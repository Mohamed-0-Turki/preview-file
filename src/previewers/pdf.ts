import type { Previewer } from '../previewer.js'
import type { FileInput, PreviewOptions, PreviewResult } from '../types.js'
import type { BlobResultData } from './result-types.js'

export class PdfPreviewer implements Previewer {
  readonly name = 'pdf'
  readonly supportedMimeTypes = ['application/pdf']

  canPreview(mimeType: string): boolean {
    return (
      mimeType === 'application/pdf' ||
      mimeType === 'application/x-pdf' ||
      mimeType === 'application/acrobat' ||
      mimeType === 'text/pdf'
    )
  }

  async preview(file: FileInput, _options?: PreviewOptions): Promise<PreviewResult> {
    const data: BlobResultData = {
      blob: new Blob([file.data], { type: file.mimeType }),
    }
    return { type: 'application/pdf', data }
  }
}