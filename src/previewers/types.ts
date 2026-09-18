import type { FileInput, PreviewOptions, PreviewResult } from './types.js'

export interface Previewer {
  readonly name: string
  readonly supportedMimeTypes: readonly string[]
  canPreview(mimeType: string): boolean
  preview(file: FileInput, options?: PreviewOptions): Promise<PreviewResult>
}