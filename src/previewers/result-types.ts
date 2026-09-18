export interface BlobResultData {
  readonly blob: Blob
}

export interface CsvResultData {
  readonly text: string
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