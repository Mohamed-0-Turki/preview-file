import type { Previewer } from '../previewer.js'
import type { FileInput, PreviewOptions, PreviewResult } from '../types.js'

export class ImagePreviewer implements Previewer {
  readonly name = 'image'
  readonly supportedMimeTypes = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/svg+xml',
    'image/avif',
    'image/bmp',
    'image/apng',
  ]

  canPreview(mimeType: string): boolean {
    return mimeType.startsWith('image/')
  }

  async preview(file: FileInput, _options?: PreviewOptions): Promise<PreviewResult> {
    const blob = new Blob([file.data], { type: file.mimeType })
    return { type: file.mimeType, data: { blob } }
  }
}