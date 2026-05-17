import { describe, it, expect, vi } from 'vitest'
import { evaluatePluginConfig } from '../../utils/pluginConfig'
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
})
