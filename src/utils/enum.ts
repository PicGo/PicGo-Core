export enum ILogType {
  success = 'success',
  info = 'info',
  warn = 'warn',
  error = 'error',
  debug = 'debug'
}

/**
 * these events will be caught by users
 */
export enum IBuildInEvent {
  UPLOAD_PROGRESS = 'uploadProgress',
  FAILED = 'failed',
  BEFORE_TRANSFORM = 'beforeTransform',
  BEFORE_UPLOAD = 'beforeUpload',
  AFTER_UPLOAD = 'afterUpload',
  CLOUD_IMPORT_PROGRESS = 'cloudImportProgress',
  FINISHED = 'finished',
  INSTALL = 'install',
  UNINSTALL = 'uninstall',
  UPDATE = 'update',
  NOTIFICATION = 'notification'
}

/**
 * these events will be caught only by picgo
 */
export enum IBusEvent {
  CONFIG_CHANGE = 'CONFIG_CHANGE'
}
