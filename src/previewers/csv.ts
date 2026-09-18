import type { Previewer } from './types.js'
import type { FileInput, PreviewOptions, PreviewResult } from '../types.js'
import type { CsvResultData } from './result-types.js'

export class CsvPreviewer implements Previewer {
  readonly name = 'csv'
  readonly supportedMimeTypes = ['text/csv']

  canPreview(mimeType: string): boolean {
    return mimeType === 'text/csv'
  }

  async preview(file: FileInput, _options?: PreviewOptions): Promise<PreviewResult> {
    const data: CsvResultData = { text: new TextDecoder().decode(file.data) }
    return { type: 'text/csv', data }
  }
}