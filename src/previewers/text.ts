import type { Previewer } from './types.js'
import type { FileInput, PreviewOptions, PreviewResult } from '../types.js'

export class TextPreviewer implements Previewer {
  readonly name = 'text'
  readonly supportedMimeTypes = ['text/plain']

  canPreview(mimeType: string): boolean {
    return mimeType.startsWith('text/')
  }

  async preview(file: FileInput, _options?: PreviewOptions): Promise<PreviewResult> {
    const data = new TextDecoder().decode(file.data)
    return { type: 'text/plain', data }
  }
}