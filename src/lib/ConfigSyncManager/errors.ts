class BaseE2EError extends Error {
  constructor (message: string) {
    super(message)
    this.name = new.target.name
  }
}

export class CorruptedDataError extends BaseE2EError {
  constructor (message: string = 'Encrypted config payload is corrupted') {
    super(message)
  }
}

export class UnsupportedVersionError extends BaseE2EError {
  constructor (message: string = 'Unsupported E2E version') {
    super(message)
  }
}

export class MissingHandlerError extends BaseE2EError {
  constructor (message: string = 'PIN handler is required for E2E operations') {
    super(message)
  }
}

export class InvalidPinError extends BaseE2EError {
  constructor (message: string = 'Invalid PIN input') {
    super(message)
  }
}

export class MaxRetryExceededError extends BaseE2EError {
  constructor (message: string = 'Maximum retry attempts exceeded') {
    super(message)
  }
}

export class DecryptionFailedError extends BaseE2EError {
  constructor (message: string = 'Failed to decrypt payload') {
    super(message)
  }
}

export class InvalidEncryptionMethodError extends BaseE2EError {
  readonly value: unknown
  constructor (value: unknown) {
    super('Invalid encryption method')
    this.value = value
  }
}
