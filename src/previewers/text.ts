import type { Previewer } from '../previewer.js'
import type { FileInput, PreviewOptions, PreviewResult } from '../types.js'

export class TextPreviewer implements Previewer {
  readonly name = 'text'
  readonly supportedMimeTypes = ['text/plain']

  canPreview(mimeType: string): boolean {
    return mimeType.startsWith('text/')
  }

  async preview(_file: FileInput, _options?: PreviewOptions): Promise<PreviewResult> {
    throw new Error('Not implemented yet')
  }
}