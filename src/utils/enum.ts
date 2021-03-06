export enum ILogType {
  success = 'success',
  info = 'info',
  warn = 'warn',
  error = 'error'
}

/**
 * these events will be catched by users
 */
export enum IBuildInEvent {
  UPLOAD_PROGRESS = 'uploadProgress',
  FAILED = 'failed',
  BEFORE_TRANSFORM = 'beforeTransform',
  BEFORE_UPLOAD = 'beforeUpload',
  AFTER_UPLOAD = 'afterUpload',
  FINISHED = 'finished',
  INSTALL = 'install',
  UNINSTALL = 'uninstall',
  UPDATE = 'update',
  NOTIFICATION = 'notification'
}

/**
 * these events will be catched only by picgo
 */
export enum IBusEvent {
  CONFIG_CHANGE = 'CONFIG_CHANGE'
}
