import type { FileInput, PreviewOptions, PreviewResult } from '../types.js'

export interface Previewer {
  readonly name: string
  readonly supportedMimeTypes: readonly string[]
  /** Whether this previewer can handle a resolved MIME type. The optional file
   *  name lets capability-aware previewers (Code/Monaco) decide from the file's
   *  name and extension, not just the declared MIME string. */
  canPreview(mimeType: string, name?: string): boolean
  preview(file: FileInput, options?: PreviewOptions): Promise<PreviewResult>
}

export type PreviewerConstructor = new () => Previewer