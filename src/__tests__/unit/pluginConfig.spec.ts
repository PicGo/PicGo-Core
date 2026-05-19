import { describe, it, expect, vi } from 'vitest'
import { evaluatePluginConfig, wrapPluginConfigForCli } from '../../utils/pluginConfig'
import type { IPluginConfig } from '../../types'

describe('evaluatePluginConfig', () => {
  it('treats a field without dependsOn as static', () => {
    const schema: IPluginConfig[] = [
      { name: 'foo', type: 'input', required: false, default: 'bar' }
    ]

    const result = evaluatePluginConfig(schema, { someOther: 'x' })

    expect(result[0]).toEqual({ name: 'foo', type: 'input', required: false, default: 'bar' })
  })

  it('preserves the dependsOn metadata in the output', () => {
    const schema: IPluginConfig[] = [
      {
        name: 'repo',
        type: 'list',
        required: true,
        dependsOn: ['uploader'],
        choices: ['a', 'b']
      }
    ]

    const result = evaluatePluginConfig(schema)

    expect(result[0].dependsOn).toEqual(['uploader'])
  })

  it('passes static choices through unchanged', () => {
    const schema: IPluginConfig[] = [
      { name: 'mode', type: 'list', required: true, choices: ['a', 'b', 'c'] }
    ]

    const result = evaluatePluginConfig(schema, { uploader: 'github' })

    expect(result[0].choices).toEqual(['a', 'b', 'c'])
  })

  it('invokes function-form choices with the provided answers', () => {
    const choicesFn = vi.fn((answers: Record<string, unknown>) => {
      return answers.uploader === 'github'
        ? ['a', 'b']
        : ['c']
    })

    const schema: IPluginConfig[] = [
      { name: 'repo', type: 'list', required: true, dependsOn: ['uploader'], choices: choicesFn }
    ]

    const result = evaluatePluginConfig(schema, { uploader: 'github' })

    expect(choicesFn).toHaveBeenCalledTimes(1)
    expect(choicesFn).toHaveBeenCalledWith({ uploader: 'github' })
    expect(result[0].choices).toEqual(['a', 'b'])
  })

  it('passes an empty object to function-form choices when answers is omitted', () => {
    const choicesFn = vi.fn(() => ['fallback'])

    const schema: IPluginConfig[] = [
      { name: 'repo', type: 'list', required: true, choices: choicesFn }
    ]

    const result = evaluatePluginConfig(schema)

    expect(choicesFn).toHaveBeenCalledWith({})
    expect(result[0].choices).toEqual(['fallback'])
  })

  it('invokes function-form default with the provided answers', () => {
    const defaultFn = vi.fn((answers: Record<string, unknown>) => {
      return `prefix-${String(answers.uploader)}`
    })

    const schema: IPluginConfig[] = [
      { name: 'tag', type: 'input', required: false, default: defaultFn }
    ]

    const result = evaluatePluginConfig(schema, { uploader: 'github' })

    expect(defaultFn).toHaveBeenCalledWith({ uploader: 'github' })
    expect(result[0].default).toBe('prefix-github')
  })

  it('falls back to [] when choices function throws, isolating other fields', () => {
    const onError = vi.fn()
    const goodChoices = vi.fn(() => ['ok'])

    const schema: IPluginConfig[] = [
      {
        name: 'broken',
        type: 'list',
        required: false,
        choices: () => { throw new Error('boom') }
      },
      { name: 'fine', type: 'list', required: false, choices: goodChoices }
    ]

    const result = evaluatePluginConfig(schema, {}, { onError })

    expect(result[0].choices).toEqual([])
    expect(result[1].choices).toEqual(['ok'])
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith('broken', 'choices', expect.any(Error))
  })

  it('falls back to undefined when default function throws', () => {
    const onError = vi.fn()

    const schema: IPluginConfig[] = [
      {
        name: 'sketchy',
        type: 'input',
        required: false,
        default: () => { throw new Error('nope') }
      }
    ]

    const result = evaluatePluginConfig(schema, {}, { onError })

    expect(result[0].default).toBeUndefined()
    expect(onError).toHaveBeenCalledWith('sketchy', 'default', expect.any(Error))
  })

  it('does not mutate the input schema or its field objects', () => {
    const originalFn = (_answers: Record<string, unknown>) => ['x']
    const schema: IPluginConfig[] = [
      { name: 'a', type: 'input', required: false, default: 'initial' },
      { name: 'b', type: 'list', required: true, choices: originalFn, dependsOn: ['a'] }
    ]

    const snapshot = JSON.parse(JSON.stringify(schema.map((f) => ({
      ...f,
      choices: typeof f.choices === 'function' ? '[fn]' : f.choices,
      default: typeof f.default === 'function' ? '[fn]' : f.default
    }))))

    const result = evaluatePluginConfig(schema, { a: 'value' })

    expect(result).not.toBe(schema)
    expect(result[0]).not.toBe(schema[0])
    expect(schema[1].choices).toBe(originalFn)

    const after = JSON.parse(JSON.stringify(schema.map((f) => ({
      ...f,
      choices: typeof f.choices === 'function' ? '[fn]' : f.choices,
      default: typeof f.default === 'function' ? '[fn]' : f.default
    }))))
    expect(after).toEqual(snapshot)
  })

  it('feeds prior fields\' resolved defaults into later fields\' synthetic answers', () => {
    const indentChoicesFn = vi.fn((answers: Record<string, unknown>) => {
      return answers.format === 'json' ? ['2', '4', 'tab'] : ['2']
    })

    const schema: IPluginConfig[] = [
      {
        name: 'format',
        type: 'list',
        required: true,
        default: 'json',
        choices: ['json', 'yaml']
      },
      {
        name: 'indent',
        type: 'list',
        required: true,
        dependsOn: ['format'],
        choices: indentChoicesFn
      }
    ]

    // No user answers — indent.choices should still see format='json' from the prior field's default.
    const result = evaluatePluginConfig(schema)

    expect(indentChoicesFn).toHaveBeenCalledWith({ format: 'json' })
    expect(result[1].choices).toEqual(['2', '4', 'tab'])
  })

  it('user-provided answers override synthetic defaults for downstream fields', () => {
    const indentChoicesFn = vi.fn((answers: Record<string, unknown>) => {
      return answers.format === 'yaml' ? ['2-yaml', '4-yaml'] : ['fallback']
    })

    const schema: IPluginConfig[] = [
      {
        name: 'format',
        type: 'list',
        required: true,
        default: 'json',
        choices: ['json', 'yaml']
      },
      {
        name: 'indent',
        type: 'list',
        required: true,
        dependsOn: ['format'],
        choices: indentChoicesFn
      }
    ]

    const result = evaluatePluginConfig(schema, { format: 'yaml' })

    expect(indentChoicesFn).toHaveBeenCalledWith({ format: 'yaml' })
    expect(result[1].choices).toEqual(['2-yaml', '4-yaml'])
  })

  it('handles a mixed schema with static, functional, throwing, and reactive fields', () => {
    const onError = vi.fn()

    const schema: IPluginConfig[] = [
      { name: 'plain', type: 'input', required: false, default: 'static' },
      {
        name: 'cascade',
        type: 'list',
        required: true,
        dependsOn: ['plain'],
        choices: (answers) => [`derived-from-${String(answers.plain)}`]
      },
      {
        name: 'busted',
        type: 'list',
        required: false,
        choices: () => { throw new Error('fail') }
      }
    ]

    const result = evaluatePluginConfig(schema, { plain: 'static' }, { onError })

    expect(result[0]).toEqual({ name: 'plain', type: 'input', required: false, default: 'static' })
    expect(result[1].choices).toEqual(['derived-from-static'])
    expect(result[1].dependsOn).toEqual(['plain'])
    expect(result[2].choices).toEqual([])
    expect(onError).toHaveBeenCalledWith('busted', 'choices', expect.any(Error))
  })

  it('preserves type: editor on static editor fields', () => {
    const schema: IPluginConfig[] = [
      {
        name: 'script',
        type: 'editor',
        required: true,
        default: 'line1\nline2'
      }
    ]

    const result = evaluatePluginConfig(schema)

    expect(result[0].type).toBe('editor')
    expect(result[0].default).toBe('line1\nline2')
  })

  it('evaluates function-form default on a type: editor field with dependsOn', () => {
    const defaultFn = vi.fn(
      (answers: Record<string, unknown>) =>
        `template for ${String(answers.target ?? 'unknown')}\n`
    )

    const schema: IPluginConfig[] = [
      { name: 'target', type: 'input', required: true, default: 'prod' },
      {
        name: 'script',
        type: 'editor',
        required: true,
        dependsOn: ['target'],
        default: defaultFn
      }
    ]

    const result = evaluatePluginConfig(schema, { target: 'staging' })

    expect(result[1].type).toBe('editor')
    expect(result[1].default).toBe('template for staging\n')
    expect(result[1].dependsOn).toEqual(['target'])
    expect(defaultFn).toHaveBeenCalledWith({ target: 'staging' })
  })
})

describe('wrapPluginConfigForCli', () => {
  it('passes static fields through unchanged', () => {
    const schema: IPluginConfig[] = [
      { name: 'host', type: 'input', required: true, default: 'https://example.com' },
      { name: 'region', type: 'list', required: true, choices: ['us', 'eu'], default: 'us' }
    ]

    const result = wrapPluginConfigForCli(schema)

    expect(result[0]).toEqual(schema[0])
    expect(result[1]).toEqual(schema[1])
  })

  it('preserves the function form of choices/default (lazy, not eager)', () => {
    const choicesFn = vi.fn((answers: Record<string, unknown>) =>
      answers.region === 'eu' ? ['eu-1', 'eu-2'] : ['us-1']
    )
    const defaultFn = vi.fn((answers: Record<string, unknown>) =>
      answers.region === 'eu' ? 'eu-1' : 'us-1'
    )
    const schema: IPluginConfig[] = [
      { name: 'bucket', type: 'list', required: true, dependsOn: ['region'], choices: choicesFn, default: defaultFn }
    ]

    const result = wrapPluginConfigForCli(schema)

    // Wrapping itself must NOT invoke the originals.
    expect(choicesFn).not.toHaveBeenCalled()
    expect(defaultFn).not.toHaveBeenCalled()
    expect(typeof result[0].choices).toBe('function')
    expect(typeof result[0].default).toBe('function')
  })

  it('forwards answers verbatim to the wrapped function', () => {
    const choicesFn = vi.fn(() => ['ok'])
    const schema: IPluginConfig[] = [
      { name: 'bucket', type: 'list', required: true, dependsOn: ['region'], choices: choicesFn }
    ]

    const result = wrapPluginConfigForCli(schema)
    ;(result[0].choices as (a: Record<string, unknown>) => unknown)({ region: 'eu', other: 1 })

    expect(choicesFn).toHaveBeenCalledWith({ region: 'eu', other: 1 })
  })

  it('returns a sentinel choice with value=null when wrapped choices throws, and reports via onError', () => {
    // Inquirer 6's list/checkbox prompt crashes on an empty choices array,
    // so the wrap returns one sentinel item whose value is null (using
    // `undefined` would be coerced back to `name` by inquirer's Choice
    // constructor, so we use `null` to truly persist "not set").
    const boom = new Error('boom from choices')
    const onError = vi.fn()
    const schema: IPluginConfig[] = [
      {
        name: 'flaky',
        type: 'list',
        required: false,
        choices: () => { throw boom }
      }
    ]

    const result = wrapPluginConfigForCli(schema, { onError })
    const value = (result[0].choices as (a: Record<string, unknown>) => unknown)({}) as Array<{ name: string, value: unknown }>

    expect(Array.isArray(value)).toBe(true)
    expect(value).toHaveLength(1)
    expect(value[0].name).toBe('flaky')
    expect(value[0].value).toBeNull()
    expect(onError).toHaveBeenCalledWith('flaky', 'choices', boom)
  })

  it('returns undefined when a wrapped default function throws, and reports via onError', () => {
    const boom = new Error('boom from default')
    const onError = vi.fn()
    const schema: IPluginConfig[] = [
      {
        name: 'flaky',
        type: 'input',
        required: false,
        default: () => { throw boom }
      }
    ]

    const result = wrapPluginConfigForCli(schema, { onError })
    const value = (result[0].default as (a: Record<string, unknown>) => unknown)({})

    expect(value).toBeUndefined()
    expect(onError).toHaveBeenCalledWith('flaky', 'default', boom)
  })

  it('isolates a throwing field — other fields continue to evaluate normally', () => {
    const onError = vi.fn()
    const schema: IPluginConfig[] = [
      {
        name: 'flaky',
        type: 'list',
        required: false,
        choices: () => { throw new Error('nope') }
      },
      {
        name: 'healthy',
        type: 'list',
        required: false,
        choices: (answers: Record<string, unknown>) => ['ok-for-' + String(answers.region ?? 'default')]
      }
    ]

    const result = wrapPluginConfigForCli(schema, { onError })

    const flakyValue = (result[0].choices as (a: Record<string, unknown>) => unknown)({ region: 'eu' }) as Array<{ name: string, value: unknown }>
    const healthyValue = (result[1].choices as (a: Record<string, unknown>) => unknown)({ region: 'eu' })

    // flaky degrades to a single sentinel choice with null value (the saved
    // field becomes "not set"); name carries the field name for clarity.
    expect(flakyValue).toHaveLength(1)
    expect(flakyValue[0].name).toBe('flaky')
    expect(flakyValue[0].value).toBeNull()
    // healthy field is unaffected
    expect(healthyValue).toEqual(['ok-for-eu'])
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith('flaky', 'choices', expect.any(Error))
  })

  it('does not mutate the input schema or its field objects', () => {
    const originalChoices = () => ['x']
    const schema: IPluginConfig[] = [
      { name: 'foo', type: 'list', required: false, choices: originalChoices }
    ]
    const before = JSON.parse(JSON.stringify(schema.map(f => ({ ...f, choices: typeof f.choices })))) // serializable snapshot

    const result = wrapPluginConfigForCli(schema)

    // Result is a new array, original schema fields are intact
    expect(result).not.toBe(schema)
    expect(result[0]).not.toBe(schema[0])
    expect(schema[0].choices).toBe(originalChoices)
    // Snapshot unchanged
    const after = JSON.parse(JSON.stringify(schema.map(f => ({ ...f, choices: typeof f.choices }))))
    expect(after).toEqual(before)
  })

  it('does not call onError when onError is omitted (no-op error reporter)', () => {
    const schema: IPluginConfig[] = [
      { name: 'flaky', type: 'list', required: false, choices: () => { throw new Error('x') } }
    ]
    const result = wrapPluginConfigForCli(schema)

    expect(() =>
      (result[0].choices as (a: Record<string, unknown>) => unknown)({})
    ).not.toThrow()
  })
})
