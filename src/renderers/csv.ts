import type { PreviewAdapter } from '../controls/types.js'
import type { PreviewOptions, PreviewResult } from '../types.js'
import { isCsvResultData } from '../previewers/result-types.js'
import { createVirtualTable } from './virtual-table.js'
import { parseCsv } from '../utils/index.js'
import { createRenderState } from './render-state.js'
import type { Renderer } from './types.js'

interface CsvAttachment {
  destroy(): void
}

export class CsvRenderer implements Renderer {
  readonly name = 'csv'
  readonly supportedTypes = ['text/csv']

  private readonly attachments = createRenderState<CsvAttachment>()

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
    stage.style.background = 'var(--pf-surface, #ffffff)'
    container.appendChild(stage)

    let scale = 1
    let table = buildTable()

    function buildTable(): ReturnType<typeof createVirtualTable> {
      return createVirtualTable({
        columnLabels,
        rowCount: dataRows.length,
        getCell: (row, col) => {
          const data = dataRows[row]
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