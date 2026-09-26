/** Stable error codes so callers can react without matching on message text. */
export type OoxmlErrorCode =
  /** The bytes are not a readable ZIP / not an OPC package. */
  | 'not-a-package'
  /** A readable package, but not one of the Word/Excel/PowerPoint families. */
  | 'unsupported-format'
  /** An OLE2/CFB container: password-protected or legacy binary Office file. */
  | 'encrypted'
  /** A part the document references is absent from the package. */
  | 'missing-part'
  /** A part exists but its XML could not be parsed within the safety budget. */
  | 'parse-failed'
  /** A part exceeds the configured size budget and was not inflated. */
  | 'resource-limit'

export class OoxmlError extends Error {
  readonly code: OoxmlErrorCode
  /** Package part the failure is attributed to, when known. */
  readonly part?: string

  constructor(code: OoxmlErrorCode, message: string, part?: string) {
    super(message)
    this.name = 'OoxmlError'
    this.code = code
    this.part = part
  }
}

export function isOoxmlError(error: unknown): error is OoxmlError {
  return error instanceof OoxmlError
}
