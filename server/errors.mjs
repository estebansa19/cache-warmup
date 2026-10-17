// The error type every server module throws. bridge.mjs turns its code into an HTTP status.

export class CodedError extends Error {
  /** @param {string} code @param {string} message */
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export function coded(/** @type {string} */ code, /** @type {string} */ message) {
  return new CodedError(code, message);
}
