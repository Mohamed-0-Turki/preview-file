import type { Previewer } from './previewer.js'

export interface PreviewResult {
  readonly type: string
  readonly data: unknown
}

export interface PreviewOptions {
  readonly maxBytes?: number
}

export interface FileInput {
  readonly name: string
  readonly mimeType: string
  readonly data: Uint8Array
}

export type PreviewerConstructor = new () => Previewer