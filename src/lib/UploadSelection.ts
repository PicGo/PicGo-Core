import type { ILocalesKey } from '../i18n/zh-CN'
import type { IPicGo, IUploaderConfigItem, ResolvedUploadSelection, UploadSelection } from '../types'
import { PICGO_CLOUD } from '../utils/static'

enum UploadSelectionErrorCode {
  InvalidSelection = 'INVALID_UPLOAD_SELECTION',
  UnknownUploader = 'UNKNOWN_UPLOADER',
  ConfigNotFound = 'UPLOAD_CONFIG_NOT_FOUND',
  AmbiguousConfig = 'UPLOAD_CONFIG_AMBIGUOUS'
}

class UploadSelectionError extends Error {
  readonly code: UploadSelectionErrorCode

  constructor (code: UploadSelectionErrorCode, message: string) {
    super(message)
    this.name = 'UploadSelectionError'
    this.code = code
  }
}

interface IConfigMatch {
  uploader: string
  config: IUploaderConfigItem
}

interface IValidatedSelection {
  uploader?: string
  configName?: string
  configId?: string
}

const validateSelector = (
  ctx: IPicGo,
  parameter: keyof UploadSelection,
  value: unknown
): string | undefined => {
  if (value === undefined) return undefined
  if (typeof value !== 'string' || value.trim() === '') {
    throw new UploadSelectionError(
      UploadSelectionErrorCode.InvalidSelection,
      ctx.i18n.translate<ILocalesKey>('UPLOAD_SELECTION_INVALID_PARAMETER', { parameter })
    )
  }
  return parameter === 'configName' ? value.trim() : value
}

const validateSelection = (ctx: IPicGo, selection?: UploadSelection): IValidatedSelection | undefined => {
  if (selection === undefined) return undefined

  const uploader = validateSelector(ctx, 'uploader', selection.uploader)
  const configName = validateSelector(ctx, 'configName', selection.configName)
  const configId = validateSelector(ctx, 'configId', selection.configId)

  if (uploader === undefined && configName === undefined && configId === undefined) return undefined
  return { uploader, configName, configId }
}

const cloneResolvedSelection = (match: IConfigMatch): ResolvedUploadSelection => ({
  uploader: match.uploader,
  config: structuredClone(match.config)
})

const formatScope = (uploader: string | undefined, registeredTypes: string[]): string => {
  if (uploader !== undefined) return `uploader="${uploader}"`
  return `uploader=[${registeredTypes.join(', ')}]`
}

const formatCandidates = (matches: IConfigMatch[]): string => {
  return matches
    .map(({ uploader, config }) => `${uploader}/${config._configName} (${config._id})`)
    .join(', ')
}

const findMatches = (
  ctx: IPicGo,
  uploaderTypes: string[],
  predicate: (config: IUploaderConfigItem) => boolean
): IConfigMatch[] => {
  const matches: IConfigMatch[] = []
  for (const uploader of uploaderTypes) {
    for (const config of ctx.uploaderConfig.getConfigList(uploader)) {
      if (predicate(config)) matches.push({ uploader, config })
    }
  }
  return matches
}

const throwNotFound = (
  ctx: IPicGo,
  selectors: string,
  scope: string
): never => {
  throw new UploadSelectionError(
    UploadSelectionErrorCode.ConfigNotFound,
    ctx.i18n.translate<ILocalesKey>('UPLOAD_SELECTION_CONFIG_NOT_FOUND', { selectors, scope })
  )
}

const throwAmbiguous = (
  ctx: IPicGo,
  selector: string,
  scope: string,
  matches: IConfigMatch[]
): never => {
  throw new UploadSelectionError(
    UploadSelectionErrorCode.AmbiguousConfig,
    ctx.i18n.translate<ILocalesKey>('UPLOAD_SELECTION_CONFIG_AMBIGUOUS', {
      selector,
      scope,
      candidates: formatCandidates(matches)
    })
  )
}

const resolveUploadOptions = (
  ctx: IPicGo,
  selection?: UploadSelection
): ResolvedUploadSelection | undefined => {
  const validated = validateSelection(ctx, selection)
  if (validated === undefined) return undefined

  const registeredTypes = [...new Set(ctx.uploaderConfig.listUploaderTypes())]
  const { uploader, configName, configId } = validated
  if (uploader !== undefined && !registeredTypes.includes(uploader)) {
    throw new UploadSelectionError(
      UploadSelectionErrorCode.UnknownUploader,
      ctx.i18n.translate<ILocalesKey>('UPLOAD_SELECTION_UNKNOWN_UPLOADER', {
        uploader,
        uploaders: `[${registeredTypes.join(', ')}]`
      })
    )
  }

  const scopeTypes = uploader === undefined ? registeredTypes : [uploader]
  const scope = formatScope(uploader, registeredTypes)

  if (configId === undefined && configName === undefined && uploader !== undefined) {
    const activeConfig = ctx.uploaderConfig.getActiveConfig(uploader)
    if (activeConfig !== undefined) return cloneResolvedSelection({ uploader, config: activeConfig })
    if (uploader === PICGO_CLOUD) return { uploader }
    return throwNotFound(ctx, ctx.i18n.translate<ILocalesKey>('UPLOAD_SELECTION_ACTIVE_CONFIG'), scope)
  }

  let idMatches: IConfigMatch[] = []
  if (configId !== undefined) {
    idMatches = findMatches(ctx, scopeTypes, config => config._id === configId)
    if (idMatches.length === 1) return cloneResolvedSelection(idMatches[0])
  }

  if (configName !== undefined) {
    const targetName = configName.toLowerCase()
    const nameMatches = findMatches(
      ctx,
      scopeTypes,
      config => typeof config._configName === 'string' && config._configName.trim().toLowerCase() === targetName
    )
    if (nameMatches.length === 1) return cloneResolvedSelection(nameMatches[0])
    if (nameMatches.length > 1) {
      const attemptedSelectors = [
        configId === undefined ? undefined : `configId="${configId}"`,
        `configName="${configName}"`
      ].filter((selector): selector is string => selector !== undefined).join(', ')
      return throwAmbiguous(ctx, attemptedSelectors, scope, nameMatches)
    }
  }

  if (idMatches.length > 1 && configName === undefined) {
    return throwAmbiguous(ctx, `configId="${configId}"`, scope, idMatches)
  }

  const attemptedSelectors = [
    configId === undefined ? undefined : `configId="${configId}"`,
    configName === undefined ? undefined : `configName="${configName}"`
  ].filter((selector): selector is string => selector !== undefined).join(', ')
  return throwNotFound(ctx, attemptedSelectors, scope)
}

export {
  resolveUploadOptions,
  UploadSelectionError,
  UploadSelectionErrorCode
}
