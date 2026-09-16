import type { Previewer } from './previewer.js'

export interface PreviewResult {
  readonly type: string
  readonly data: unknown
}

export interface MagnifierOptions {
  readonly lensSize?: number
  readonly magnification?: number
  readonly borderWidth?: number
}

export interface PreviewOptions {
  readonly maxBytes?: number
  readonly magnifier?: MagnifierOptions
}

export interface FileInput {
  readonly name: string
  readonly mimeType: string
  readonly data: Uint8Array<ArrayBuffer>
}

export type PreviewerConstructor = new () => Previewer