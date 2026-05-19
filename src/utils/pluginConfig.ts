import { IPluginConfig, PluginConfigAnswers } from '../types'

interface EvaluatePluginConfigOptions {
  /**
   * Optional logger callback invoked when a `choices` or `default` function
   * throws. The runtime can wire this to `ctx.log.warn` so degraded fields
   * are visible. Receives `(fieldName, kind, error)`.
   */
  onError?: (fieldName: string, kind: 'choices' | 'default', error: unknown) => void
}

/**
 * Evaluate a Plugin Config Schema, resolving function-form `choices` and
 * `default` against the given `answers` snapshot. Pure: never mutates the
 * input schema or its field objects.
 *
 * Used by:
 * - CLI: ideally as a no-op pass before handing the schema to inquirer
 *   (today the CLI relies on inquirer to evaluate the functions itself,
 *   so calling this without `answers` is safe and equivalent).
 * - GUI: called twice — once at schema serialization (no `answers`) and
 *   again on reactive refresh (with the current form's value snapshot).
 *
 * @param schema  the raw schema returned by `plugin.config(ctx)`
 * @param answers field-value snapshot to pass to function-form choices/default
 *                (defaults to `{}` so functions that don't read answers are
 *                still safe to call)
 * @param options optional error reporter
 * @returns a new array of resolved IPluginConfig items
 */
export function evaluatePluginConfig (
  schema: IPluginConfig[],
  answers?: PluginConfigAnswers,
  options?: EvaluatePluginConfigOptions
): IPluginConfig[] {
  const userAnswers = answers ?? {}
  // synthAnswers seeds subsequent fields with the effective values seen so far,
  // mirroring inquirer's sequential evaluation in the CLI. User-provided answers
  // always win; we only fall back to a field's resolved default when no answer
  // was supplied for that field name.
  const synthAnswers: PluginConfigAnswers = { ...userAnswers }

  return schema.map((field) => {
    const next: IPluginConfig = { ...field }

    if (typeof field.default === 'function') {
      try {
        next.default = (field.default as (a: PluginConfigAnswers) => unknown)({ ...synthAnswers })
      } catch (error) {
        next.default = undefined
        options?.onError?.(field.name, 'default', error)
      }
    }

    if (typeof field.choices === 'function') {
      try {
        next.choices = (field.choices as (a: PluginConfigAnswers) => unknown)({ ...synthAnswers }) as IPluginConfig['choices']
      } catch (error) {
        next.choices = []
        options?.onError?.(field.name, 'choices', error)
      }
    }

    if (synthAnswers[field.name] === undefined && next.default !== undefined) {
      synthAnswers[field.name] = next.default
    }

    return next
  })
}

interface WrapPluginConfigForCliOptions {
  /**
   * Optional logger callback invoked when a `choices` or `default` function
   * throws during inquirer evaluation. Receives `(fieldName, kind, error)`.
   */
  onError?: (fieldName: string, kind: 'choices' | 'default', error: unknown) => void
}

/**
 * Lazily wrap function-form `choices` / `default` with a try/catch so a
 * single throwing field doesn't kill the entire inquirer prompt chain on
 * the CLI side.
 *
 * Unlike `evaluatePluginConfig`, this does NOT eagerly invoke the
 * functions — it preserves the function form so inquirer can still call
 * them lazily with the latest accumulated `answers`. CLI cascade
 * semantics are therefore unchanged. A throwing field degrades to
 * `choices: []` / `default: undefined`, mirroring the GUI's field-level
 * isolation guarantee provided by `evaluatePluginConfig`.
 */
export function wrapPluginConfigForCli (
  schema: IPluginConfig[],
  options?: WrapPluginConfigForCliOptions
): IPluginConfig[] {
  return schema.map((field) => {
    const next: IPluginConfig = { ...field }

    if (typeof field.choices === 'function') {
      const orig = field.choices as (a: PluginConfigAnswers) => unknown
      next.choices = ((answers: PluginConfigAnswers) => {
        try {
          return orig(answers)
        } catch (error) {
          options?.onError?.(field.name, 'choices', error)
          // Inquirer's list/checkbox prompts can't navigate an empty
          // choices array — `this.selected` stays undefined and the
          // prompt crashes on `getChoice(undefined).value`. Return a
          // single sentinel choice so the prompt is navigable; the user
          // can confirm past it and the saved field becomes `null`
          // (i.e. "not set"). Note: `value: undefined` would be coerced
          // back to `name` by inquirer 6's Choice constructor, so we use
          // `null` here. This mirrors the GUI semantics where
          // `evaluatePluginConfig` sets `choices: []` and the Select
          // shows no options.
          return [{ name: field.name, value: null }]
        }
      }) as IPluginConfig['choices']
    }

    if (typeof field.default === 'function') {
      const orig = field.default as (a: PluginConfigAnswers) => unknown
      next.default = (answers: PluginConfigAnswers) => {
        try {
          return orig(answers)
        } catch (error) {
          options?.onError?.(field.name, 'default', error)
          return undefined
        }
      }
    }

    return next
  })
}
