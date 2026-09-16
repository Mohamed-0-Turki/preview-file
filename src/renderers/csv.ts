import type { PreviewAdapter } from '../controls/types.js'
import type { PreviewOptions, PreviewResult } from '../types.js'
import { isCsvResultData } from '../previewers/result-types.js'
import { createVirtualTable } from './virtual-table.js'
import type { Renderer } from './types.js'

export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i] as string

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 1
        } else {
          inQuotes = false
        }
      } else {
        field += char
      }
      continue
    }

    if (char === '"') {
      inQuotes = true
    } else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i += 1
      row.push(field)
      field = ''
      rows.push(row)
      row = []
    } else {
      field += char
    }
  }

  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  return rows
}

interface CsvAttachment {
  destroy(): void
}

export class CsvRenderer implements Renderer {
  readonly name = 'csv'
  readonly supportedTypes = ['text/csv']

  private readonly attachmentsByContainer = new WeakMap<HTMLElement, CsvAttachment>()

  canRender(type: string): boolean {
    return type === 'text/csv'
  }

  render(container: HTMLElement, result: PreviewResult, _options?: PreviewOptions): PreviewAdapter {
    if (!isCsvResultData(result.data)) {
      throw new Error('The preview result has no CSV data.')
    }

    const rows = parseCsv(result.data.text)

    let headerOffset = 0
    let columnLabels: string[] = []
    if (rows.length > 0) {
      headerOffset = 1
      columnLabels = rows[0] as string[]
    }
    const dataRows = rows.slice(headerOffset)
    const columnCount = columnLabels.length
    if (columnCount > 0) {
      for (const row of dataRows) {
        if (row.length > columnCount) columnLabels = columnLabels.concat(Array(row.length - columnCount).fill(''))
      }
    }

    const stage = document.createElement('div')
    stage.style.position = 'absolute'
    stage.style.inset = '0'
    stage.style.display = 'flex'
    stage.style.flexDirection = 'column'
    stage.style.background = '#ffffff'
    container.appendChild(stage)

    let scale = 1
    let table = buildTable()
    let filtered: number[] | null = null
    let query = ''

    function visibleRows(): number[] {
      if (!filtered) return dataRows.map((_, index) => index)
      return filtered
    }

    function applyFilter(): void {
      const rowsToSearch = dataRows
      if (!query.trim()) {
        filtered = null
      } else {
        const needle = query.trim().toLowerCase()
        filtered = []
        for (let r = 0; r < rowsToSearch.length; r += 1) {
          const row = rowsToSearch[r] as string[]
          if (row.some((cell) => cell.toLowerCase().includes(needle))) {
            filtered.push(r)
          }
        }
      }
      rebuild()
    }

    function rebuild(): void {
      const index = visibleRows()
      table.destroy()
      table = buildTable(index)
      table.setScale(scale)
    }

    function buildTable(index?: number[]): ReturnType<typeof createVirtualTable> {
      return createVirtualTable({
        columnLabels,
        rowCount: index ? index.length : dataRows.length,
        getCell: (row, col) => {
          const sourceRow = index ? (index[row] as number) : row
          const data = dataRows[sourceRow]
          return String(data ? (data[col] ?? '') : '')
        },
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
      search: {
        search: (text: string) => {
          query = text
          applyFilter()
        },
        get resultCount() {
          return visibleRows().length
        },
        clear: () => {
          query = ''
          applyFilter()
        },
      },
    }

    this.attachmentsByContainer.set(container, {
      destroy: () => {
        table.destroy()
        stage.remove()
      },
    })

    return adapter
  }

  destroy(container: HTMLElement): void {
    const attachment = this.attachmentsByContainer.get(container)
    if (!attachment) return
    attachment.destroy()
    this.attachmentsByContainer.delete(container)
  }
}