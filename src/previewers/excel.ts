import type { Previewer } from '../previewer.js'
import type { FileInput, PreviewOptions, PreviewResult } from '../types.js'
import type { SpreadsheetResultData } from './result-types.js'

function detectSpreadsheetExtension(name: string): string {
  const extension = name.split('.').pop()?.toLowerCase() ?? ''
  if (extension === 'xls' || extension === 'xlsx' || extension === 'xlsm' || extension === 'xlsb') return extension
  if (extension === 'xlt' || extension === 'xltx' || extension === 'xltm') return extension
  return 'xlsx'
}

export class ExcelPreviewer implements Previewer {
  readonly name = 'excel'
  readonly supportedMimeTypes = [
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.template',
    'application/vnd.ms-excel.sheet.macroEnabled.12',
    'application/vnd.ms-excel.sheet.binary.macroEnabled.12',
    'application/vnd.ms-excel.template.macroEnabled.12',
  ]

  canPreview(mimeType: string): boolean {
    return mimeType === 'application/vnd.ms-excel' || mimeType.includes('spreadsheetml') || mimeType.includes('ms-excel')
  }

  async preview(file: FileInput, _options?: PreviewOptions): Promise<PreviewResult> {
    const data: SpreadsheetResultData = {
      blob: new Blob([file.data], { type: file.mimeType }),
      format: detectSpreadsheetExtension(file.name),
    }
    return { type: 'application/vnd.spreadsheet', data }
  }
}