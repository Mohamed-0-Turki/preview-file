const DEFAULT_ROW_HEIGHT = 26
const DEFAULT_MIN_COLUMN_WIDTH = 140
const DEFAULT_FONT_SIZE = 13
const MIN_SCALE = 0.2
const MAX_SCALE = 4

export interface VirtualTableOptions {
  readonly columnLabels: readonly string[]
  readonly rowCount: number
  getCell(row: number, col: number): string
  readonly rowHeight?: number
  readonly minColumnWidth?: number
  readonly baseFontSize?: number
}

export interface VirtualTable {
  readonly viewport: HTMLElement
  setScale(scale: number): void
  scale(): number
  fitWidthTo(availableWidth: number): number
  destroy(): void
}

export function createVirtualTable(options: VirtualTableOptions): VirtualTable {
  const rowHeight = options.rowHeight ?? DEFAULT_ROW_HEIGHT
  const minColumnWidth = options.minColumnWidth ?? DEFAULT_MIN_COLUMN_WIDTH
  const baseFontSize = options.baseFontSize ?? DEFAULT_FONT_SIZE
  const columnCount = Math.max(0, options.columnLabels.length)

  const viewport = document.createElement('div')
  viewport.style.position = 'relative'
  viewport.style.overflow = 'auto'
  viewport.style.background = '#ffffff'
  viewport.style.flex = '1 1 0'
  viewport.style.minHeight = '0'
  viewport.style.fontFamily = 'system-ui, sans-serif'

  const header = document.createElement('div')
  header.style.position = 'sticky'
  header.style.top = '0'
  header.style.zIndex = '3'
  header.style.display = 'flex'
  header.style.background = '#eaeef2'
  viewport.appendChild(header)

  const body = document.createElement('div')
  body.style.position = 'relative'
  viewport.appendChild(body)

  const empty = document.createElement('div')
  empty.textContent = 'No rows to display.'
  empty.style.padding = '12px'
  empty.style.color = '#6e7781'
  empty.style.fontSize = '12px'
  body.appendChild(empty)

  let scale = 1
  let cellWidth = minColumnWidth
  let effectiveRowHeight = rowHeight
  let fontSize = baseFontSize

  const applyMetrics = (): void => {
    cellWidth = minColumnWidth * scale
    effectiveRowHeight = rowHeight * scale
    fontSize = baseFontSize * scale
  }

  const createCell = (text: string, isHeader: boolean): HTMLDivElement => {
    const cell = document.createElement('div')
    cell.style.flex = `0 0 ${cellWidth}px`
    cell.style.width = `${cellWidth}px`
    cell.style.boxSizing = 'border-box'
    cell.style.overflow = 'hidden'
    cell.style.textOverflow = 'ellipsis'
    cell.style.whiteSpace = 'nowrap'
    cell.style.padding = '0 6px'
    cell.style.height = '100%'
    cell.style.display = 'flex'
    cell.style.alignItems = 'center'
    cell.style.fontSize = `${fontSize}px`
    if (isHeader) {
      cell.style.fontWeight = '600'
      cell.style.color = '#24292f'
      cell.style.borderBottom = '2px solid #d0d7de'
    } else {
      cell.style.borderBottom = '1px solid #eaeef2'
    }
    cell.style.borderRight = '1px solid #eaeef2'
    cell.textContent = text
    cell.title = text
    return cell
  }

  const headers: HTMLDivElement[] = []
  for (let col = 0; col < columnCount; col += 1) {
    const cell = createCell(options.columnLabels[col] ?? '', true)
    headers.push(cell)
    header.appendChild(cell)
  }

  const renderWindow = (): void => {
    if (options.rowCount === 0) {
      body.replaceChildren(empty)
      header.style.display = 'none'
      return
    }

    body.replaceChildren()

    if (columnCount === 0) {
      return
    }

    const scrollTop = viewport.scrollTop
    const viewportHeight = viewport.clientHeight
    const buffer = 2

    const first = Math.max(0, Math.floor(scrollTop / effectiveRowHeight) - buffer)
    const last = Math.min(
      options.rowCount,
      Math.ceil((scrollTop + viewportHeight) / effectiveRowHeight) + buffer
    )

    for (let rowIndex = first; rowIndex < last; rowIndex += 1) {
      const row = document.createElement('div')
      row.style.position = 'absolute'
      row.style.top = `${rowIndex * effectiveRowHeight}px`
      row.style.left = '0'
      row.style.right = '0'
      row.style.height = `${effectiveRowHeight}px`
      row.style.display = 'flex'

      for (let col = 0; col < columnCount; col += 1) {
        try {
          row.appendChild(createCell(options.getCell(rowIndex, col), false))
        } catch {
          row.appendChild(createCell('', false))
        }
      }
      body.appendChild(row)
    }
  }

  const applyLayout = (): void => {
    applyMetrics()

    header.replaceChildren()
    headers.length = 0
    header.style.display = 'flex'
    for (let col = 0; col < columnCount; col += 1) {
      const cell = createCell(options.columnLabels[col] ?? '', true)
      headers.push(cell)
      header.appendChild(cell)
    }

    const contentWidth = columnCount * cellWidth
    body.style.width = `${Math.max(contentWidth, 1)}px`
    body.style.height = `${options.rowCount * effectiveRowHeight}px`

    renderWindow()
  }

  let frame = 0
  const scheduleRender = (): void => {
    if (frame) return
    frame = window.requestAnimationFrame(() => {
      frame = 0
      renderWindow()
    })
  }

  viewport.addEventListener('scroll', scheduleRender)
  const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(scheduleRender) : null
  resizeObserver?.observe(viewport)

  applyLayout()

  return {
    viewport,
    setScale: (nextScale: number) => {
      scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, nextScale))
      applyLayout()
    },
    scale: () => scale,
    fitWidthTo: (availableWidth: number) => {
      if (columnCount === 0) return scale
      const nextScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, availableWidth / (columnCount * minColumnWidth)))
      return nextScale
    },
    destroy: () => {
      if (frame) window.cancelAnimationFrame(frame)
      resizeObserver?.disconnect()
      viewport.remove()
    },
  }
}