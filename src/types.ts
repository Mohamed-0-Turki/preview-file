export interface PreviewResult {
  readonly type: string
  readonly data: unknown
}

export interface MagnifierOptions {
  readonly lensSize?: number
  readonly magnification?: number
  readonly borderWidth?: number
}

export interface MonacoOptions {
  /** Base URL of the Monaco Editor AMD build (`min/` directory). Overrides the
   *  global setting from {@link setMonacoBaseUrl} and the built-in CDN default
   *  for a single preview call. */
  readonly baseUrl?: string
}

export interface PreviewOptions {
  readonly maxBytes?: number
  readonly magnifier?: MagnifierOptions
  /** URL of the pdf.js worker module (`pdf.worker.mjs`). Overrides the global
   *  setting from {@link setPdfWorkerSrc} and the built-in CDN default for a
   *  single preview call. */
  readonly workerSrc?: string
  /** Monaco Editor AMD base URL for source-code previews. Overrides the global
   *  setting from {@link setMonacoBaseUrl} and the built-in CDN default for a
   *  single preview call. */
  readonly monaco?: MonacoOptions
}

export interface FileInput {
  readonly name: string
  readonly mimeType: string
  readonly data: Uint8Array<ArrayBuffer>
}