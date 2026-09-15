import type { Previewer } from '../previewer.js'
import type { FileInput, PreviewOptions, PreviewResult } from '../types.js'

export class ImagePreviewer implements Previewer {
  readonly name = 'image'
  readonly supportedMimeTypes = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
  ]

  canPreview(mimeType: string): boolean {
    return mimeType.startsWith('image/')
  }

  async preview(_file: FileInput, _options?: PreviewOptions): Promise<PreviewResult> {
    throw new Error('Not implemented yet')
  }
}