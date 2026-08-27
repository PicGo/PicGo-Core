import { describe, expect, it } from 'vitest'
import { normalizeWslPath } from '../../utils/normalizeWslPath'

const WslPrefixes = ['wsl$', 'wsl.localhost']
const TestFileName = 'image.png'
const TestDistributions = ['test-distribution', 'alternate-distribution']

const createRelativeWslPath = (prefix: string, distribution: string, separator: '/' | '\\' = '\\'): string => {
  return [prefix, distribution, TestFileName].join(separator)
}

const createAbsoluteWslPath = (prefix: string, distribution: string): string => {
  return `\\\\${createRelativeWslPath(prefix, distribution)}`
}

describe('utils/normalizeWslPath', () => {
  it.each(WslPrefixes.flatMap(prefix => [
    [createRelativeWslPath(prefix, TestDistributions[0]), createAbsoluteWslPath(prefix, TestDistributions[0])],
    [createRelativeWslPath(prefix, TestDistributions[1], '/'), createAbsoluteWslPath(prefix, TestDistributions[1])],
    [
      createRelativeWslPath(prefix, TestDistributions[0]).replaceAll('\\', '\\\\'),
      createAbsoluteWslPath(prefix, TestDistributions[0])
    ]
  ]))('adds the UNC prefix to %s', (filePath, expectedPath) => {
    expect(normalizeWslPath(filePath, 'win32')).toBe(expectedPath)
  })

  it.each(WslPrefixes)('leaves an already absolute %s UNC path unchanged', (prefix) => {
    const filePath = createAbsoluteWslPath(prefix, TestDistributions[0])

    expect(normalizeWslPath(filePath, 'win32')).toBe(filePath)
  })

  it('leaves non-WSL paths unchanged', () => {
    const filePath = 'not-a-wsl-path'

    expect(normalizeWslPath(filePath, 'win32')).toBe(filePath)
  })

  it('does not change WSL paths on non-Windows platforms', () => {
    const filePath = createRelativeWslPath(WslPrefixes[0], TestDistributions[0])

    expect(normalizeWslPath(filePath, 'linux')).toBe(filePath)
  })
})
