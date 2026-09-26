/**
 * Table rendering.
 *
 * A table is a positioned grid of absolutely-placed cells rather than a
 * `<table>`: DrawingML cells carry independent anchors, insets and per-side
 * borders, and a `gridSpan` cell does not participate in table layout rules the
 * way `colspan` does. Absolute placement also keeps merged cells from forcing
 * the surrounding grid to reflow.
 *
 * Column widths and row heights are the authored values, not a re-measurement:
 * PowerPoint honours them, so a table that has been laid out by the browser
 * would drift away from the deck's other shapes.
 */

import { colorToCss } from '../../ooxml/color.js'
import type { PptxTable, PptxTableCell, PptxTextBody } from '../../ooxml/pptx/model.js'
import { el, setStyle, type StyleMap } from './dom.js'
import { lineStyles } from './paint.js'
import { buildText } from './text.js'

interface Placement {
  readonly leftPt: number
  readonly topPt: number
  readonly widthPt: number
  readonly heightPt: number
}

/** Prefix sums of the authored column widths, so a cell's x is a lookup. */
function columnEdges(widths: readonly number[]): number[] {
  const edges = [0]
  for (const width of widths) edges.push((edges[edges.length - 1] ?? 0) + Math.max(0, width))
  return edges
}

function rowEdges(heights: readonly number[]): number[] {
  const edges = [0]
  for (const height of heights) edges.push((edges[edges.length - 1] ?? 0) + Math.max(0, height))
  return edges
}

function placementOf(cell: PptxTableCell, xEdges: readonly number[], yEdges: readonly number[]): Placement {
  const left = xEdges[cell.column] ?? 0
  const top = yEdges[cell.row] ?? 0
  const right = xEdges[Math.min(xEdges.length - 1, cell.column + cell.columnSpan)] ?? left
  const bottom = yEdges[Math.min(yEdges.length - 1, cell.row + cell.rowSpan)] ?? top
  return { leftPt: left, topPt: top, widthPt: Math.max(0, right - left), heightPt: Math.max(0, bottom - top) }
}

function cellBorderStyles(cell: PptxTableCell): StyleMap {
  const style: StyleMap = {
    boxSizing: 'border-box',
    position: 'absolute',
    overflow: 'hidden',
  }
  // Each side is styled independently because a cell can override one edge and
  // inherit the rest; a single `border` shorthand would clobber the neighbours.
  for (const side of ['top', 'right', 'bottom', 'left'] as const) {
    const line = cell.borders[side]
    const side_ = side[0]?.toUpperCase() + side.slice(1)
    if (!line) {
      style[`border${side_}Style`] = 'none'
      continue
    }
    const styles = lineStyles(line)
    style[`border${side_}Style`] = styles.borderStyle ?? 'solid'
    style[`border${side_}Width`] = styles.borderWidth ?? 0.75
    style[`border${side_}Color`] = styles.borderColor ?? '#000000'
  }
  return style
}

/**
 * Draw a table into `host`.
 *
 * Cells are emitted in authored order so that later cells paint over earlier
 * ones, which is what a vertically merged cell relies on: the merged cell is
 * authored last and must cover the ones it absorbs.
 */
export function buildTable(table: PptxTable, host: HTMLElement): HTMLDivElement {
  const xEdges = columnEdges(table.columnWidthsPt)
  const yEdges = rowEdges(table.rowHeightsPt)
  const totalWidth = xEdges[xEdges.length - 1] ?? 0
  const totalHeight = yEdges[yEdges.length - 1] ?? 0

  const root = el('div', undefined, {
    position: 'relative',
    width: totalWidth,
    height: totalHeight,
    fontSize: '0px',
  })

  for (const cell of table.cells) {
    if (cell.horizontalMerge || cell.verticalMerge) continue
    const box = placementOf(cell, xEdges, yEdges)
    if (box.widthPt <= 0 || box.heightPt <= 0) continue
    root.appendChild(buildCell(cell, box))
  }

  host.appendChild(root)
  return root
}

function buildCell(cell: PptxTableCell, box: Placement): HTMLDivElement {
  const element = el('div', 'py-ooxml-cell', {
    ...cellBorderStyles(cell),
    left: box.leftPt,
    top: box.topPt,
    width: box.widthPt,
    height: box.heightPt,
  })
  element.dataset['pfRow'] = String(cell.row)
  element.dataset['pfColumn'] = String(cell.column)
  if (cell.rowSpan > 1) element.dataset['pfRowSpan'] = String(cell.rowSpan)
  if (cell.columnSpan > 1) element.dataset['pfColumnSpan'] = String(cell.columnSpan)

  if (cell.fill.type === 'solid') {
    setStyle(element, { background: colorToCss(cell.fill.color) })
  }

  const content = el('div', undefined, {
    position: 'absolute',
    left: cell.insets.left,
    right: cell.insets.right,
    top: cell.insets.top,
    bottom: cell.insets.bottom,
    display: 'flex',
    flexDirection: 'column',
    justifyContent:
      cell.anchor === 'center' ? 'center' : cell.anchor === 'bottom' ? 'flex-end' : 'flex-start',
  })
  element.appendChild(content)

  const body: PptxTextBody | null = cell.text
  if (body) {
    const text = buildText(body, {
      widthPt: Math.max(0, box.widthPt - cell.insets.left - cell.insets.right),
      heightPt: Math.max(0, box.heightPt - cell.insets.top - cell.insets.bottom),
      rotation: 0,
      fontScale: 1,
    })
    // `buildText` positions itself absolutely; inside a cell it is flow content,
    // so the sizing is re-applied as a static block.
    if (text) {
      setStyle(text, { position: 'static', width: '100%', height: '100%', margin: 0 })
      content.appendChild(text)
    }
  }

  return element
}
