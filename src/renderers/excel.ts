import type { PreviewAdapter } from '../controls/types.js'
import type { PreviewOptions, PreviewResult } from '../types.js'
import { isSpreadsheetResultData } from '../previewers/result-types.js'
import { createVirtualTable } from './virtual-table.js'
import { createRenderState } from './render-state.js'
import type { Renderer } from './types.js'

function columnName(index: number): string {
  let name = ''
  let n = index + 1
  while (n > 0) {
    const remainder = (n - 1) % 26
    name = String.fromCharCode(65 + remainder) + name
    n = Math.floor((n - 1) / 26)
  }
  return name
}

interface SheetData {
  readonly columnLabels: readonly string[]
  readonly rowCount: number
  readonly getCell: (row: number, col: number) => string
}

interface ExcelAttachment {
  destroy(): void
}

export class ExcelRenderer implements Renderer {
  readonly name = 'excel'
  readonly supportedTypes = ['application/vnd.spreadsheet']

  private readonly attachments = createRenderState<ExcelAttachment>()

  canRender(type: string): boolean {
    return type === 'application/vnd.spreadsheet'
  }

  async render(container: HTMLElement, result: PreviewResult, _options?: PreviewOptions): Promise<PreviewAdapter> {
    if (!isSpreadsheetResultData(result.data)) {
      throw new Error('The preview result has no spreadsheet data.')
    }

    const XLSXModule = await import('xlsx')
    const XLSX = XLSXModule as typeof import('xlsx')
    const bytes = new Uint8Array(await result.data.blob.arrayBuffer())
    const workbook = XLSX.read(bytes, { type: 'array' })
    const sheetNames = workbook.SheetNames

    if (sheetNames.length === 0) {
      throw new Error('The workbook contains no sheets.')
    }

    const stage = document.createElement('div')
    stage.style.position = 'absolute'
    stage.style.inset = '0'
    stage.style.display = 'flex'
    stage.style.flexDirection = 'column'
    stage.style.background = 'var(--pf-surface, #ffffff)'
    container.appendChild(stage)

    const sheetCache = new Map<string, SheetData>()

    const getSheetData = (name: string): SheetData => {
      const cached = sheetCache.get(name)
      if (cached) return cached

      const sheet = workbook.Sheets[name]
      if (!sheet) throw new Error(`Sheet "${name}" could not be read.`)

      const reference = sheet['!ref'] ?? 'A1'
      const range = XLSX.utils.decode_range(reference)
      const columnCount = range.e.c + 1
      const columnLabels: string[] = []
      for (let col = 0; col < columnCount; col += 1) columnLabels.push(columnName(col))

      const data: SheetData = {
        columnLabels,
        rowCount: range.e.r + 1,
        getCell: (row, col) => {
          const address = XLSX.utils.encode_cell({ r: row, c: col })
          const cell = sheet[address]
          return cell ? XLSX.utils.format_cell(cell) : ''
        },
      }
      sheetCache.set(name, data)
      return data
    }

    let activeSheet = sheetNames[0] as string
    let scale = 1
    let table = buildTable()

    function currentData(): SheetData {
      return getSheetData(activeSheet)
    }

    function rebuildTable(): void {
      table.destroy()
      table = buildTable()
      stage.appendChild(table.viewport)
      table.setScale(scale)
    }

    function buildTable(): ReturnType<typeof createVirtualTable> {
      const data = currentData()
      return createVirtualTable({
        columnLabels: data.columnLabels,
        rowCount: data.rowCount,
        getCell: (row, col) => data.getCell(row, col),
      })
    }

    stage.appendChild(table.viewport)

    const zoomBy = (factor: number): void => {
      scale = Math.min(4, Math.max(0.2, scale * factor))
      table.setScale(scale)
    }

    const adapter: PreviewAdapter = {
      canZoom: true,
      get zoomPercent() {
        return Math.round(scale * 100)
      },
      zoomIn: () => zoomBy(1.25),
      zoomOut: () => zoomBy(0.8),
      resetZoom: () => {
        scale = 1
        table.setScale(scale)
      },
      fit: {
        fitWidth: () => {
          scale = table.fitWidthTo(Math.max(1, stage.clientWidth))
          table.setScale(scale)
        },
        fitPage: () => {
          scale = table.fitWidthTo(Math.max(1, stage.clientWidth))
          table.setScale(scale)
        },
      },
      sheets: {
        get sheets() {
          return sheetNames
        },
        get activeSheet() {
          return activeSheet
        },
        switchSheet: (name: string) => {
          if (!sheetNames.includes(name) || name === activeSheet) return
          activeSheet = name
          rebuildTable()
        },
      },
    }

    this.attachments.set(container, {
      destroy: () => {
        table.destroy()
        stage.remove()
      },
    })

    return adapter
  }

  destroy(container: HTMLElement): void {
    this.attachments.destroyFor(container)
  }
}