export interface BlobResultData {
  readonly blob: Blob
}

export interface CsvResultData {
  readonly text: string
}

export interface CodeResultData {
  readonly text: string
  /** Original file name — the code renderer uses it to pick a language. */
  readonly name: string
  /** Detected MIME type — secondary input for language resolution. */
  readonly mimeType: string
}

export interface MarkdownResultData {
  readonly text: string
  /** Original file name — used for code-view language hints and downloads. */
  readonly name: string
  /** Detected MIME type (`text/markdown`). */
  readonly mimeType: string
}

export type WordFormat = 'docx' | 'docm' | 'dotx' | 'dotm' | 'doc' | 'dot'

export interface WordResultData {
  readonly blob: Blob
  readonly format: WordFormat
}

export interface SpreadsheetResultData {
  readonly blob: Blob
  readonly format: string
}

export type PresentationFormat =
  | 'pptx'
  | 'pptm'
  | 'potx'
  | 'potm'
  | 'ppsx'
  | 'ppsm'
  | 'ppt'
  | 'pps'
  | 'pot'
  | 'odp'

export interface PresentationResultData {
  readonly blob: Blob
  readonly format: PresentationFormat
}

export function isBlobResultData(data: unknown): data is BlobResultData {
  return (
    typeof data === 'object' &&
    data !== null &&
    'blob' in data &&
    (data as { blob?: unknown }).blob instanceof Blob
  )
}

export function isCsvResultData(data: unknown): data is CsvResultData {
  return (
    typeof data === 'object' &&
    data !== null &&
    'text' in data &&
    typeof (data as { text?: unknown }).text === 'string'
  )
}

export function isCodeResultData(data: unknown): data is CodeResultData {
  return (
    typeof data === 'object' &&
    data !== null &&
    'text' in data &&
    typeof (data as { text?: unknown }).text === 'string' &&
    'name' in data &&
    typeof (data as { name?: unknown }).name === 'string' &&
    'mimeType' in data &&
    typeof (data as { mimeType?: unknown }).mimeType === 'string'
  )
}

export function isMarkdownResultData(data: unknown): data is MarkdownResultData {
  return isCodeResultData(data)
}

export function isWordResultData(data: unknown): data is WordResultData {
  return (
    typeof data === 'object' &&
    data !== null &&
    'blob' in data &&
    (data as { blob?: unknown }).blob instanceof Blob &&
    'format' in data &&
    typeof (data as { format?: unknown }).format === 'string'
  )
}

export function isSpreadsheetResultData(data: unknown): data is SpreadsheetResultData {
  return (
    typeof data === 'object' &&
    data !== null &&
    'blob' in data &&
    (data as { blob?: unknown }).blob instanceof Blob &&
    'format' in data &&
    typeof (data as { format?: unknown }).format === 'string'
  )
}

export function isRenderableWordFormat(format: string): boolean {
  return format === 'docx' || format === 'docm' || format === 'dotx' || format === 'dotm'
}

export function isPresentationResultData(data: unknown): data is PresentationResultData {
  return (
    typeof data === 'object' &&
    data !== null &&
    'blob' in data &&
    (data as { blob?: unknown }).blob instanceof Blob &&
    'format' in data &&
    typeof (data as { format?: unknown }).format === 'string'
  )
}

export function isRenderablePresentationFormat(format: string): boolean {
  return (
    format === 'pptx' ||
    format === 'pptm' ||
    format === 'potx' ||
    format === 'potm' ||
    format === 'ppsx' ||
    format === 'ppsm'
  )
}