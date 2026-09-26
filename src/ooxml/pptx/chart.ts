import type { OfficeColor } from '../color.js'
import { attr, attrBool, attrInt, attrNumber, childOf, childrenOf, descendantsOf } from '../xml.js'
import { resolveShapeProperties, type ShapeFill } from '../drawingml.js'
import type { Theme } from '../theme.js'

/**
 * A `c:chartSpace` reduced to what an SVG renderer needs.
 *
 * Charts are read from their **cached** values (`c:numCache`/`c:strCache`)
 * rather than by following `c:f` back into the embedded workbook. That is
 * deliberate: the cache is what Office itself paints, it is always present in a
 * saved file, and reading it needs no spreadsheet engine. A chart whose cache
 * is empty is a chart PowerPoint has never calculated, and there is nothing to
 * draw.
 */

export type PptxChartKind = 'bar' | 'line' | 'area' | 'pie' | 'doughnut' | 'scatter' | 'bubble' | 'radar' | 'stock' | 'surface'

export interface PptxChartPoint {
  readonly value: number | null
  readonly label: string | null
}

export interface PptxChartSeries {
  readonly index: number
  readonly order: number
  readonly name: string
  /** `null` for pie/doughnut, which have no value axis. */
  readonly points: readonly PptxChartPoint[]
  readonly fill: ShapeFill | null
  readonly line: ShapeFill | null
  readonly lineWidthPt: number
  readonly smooth: boolean
  readonly marker: boolean
  /** Scatter/bubble only. */
  readonly xValues: readonly (number | null)[]
  readonly bubbleSizes: readonly (number | null)[]
}

export interface PptxChartAxis {
  readonly id: string
  readonly kind: 'category' | 'value' | 'date' | 'series'
  /** `c:delete` — an axis the author hid. */
  readonly deleted: boolean
  readonly title: string | null
  readonly position: 'bottom' | 'left' | 'right' | 'top'
  /** Major unit for a value axis, for gridline spacing. */
  readonly majorUnit: number | null
  readonly min: number | null
  readonly max: number | null
  readonly numberFormat: string | null
  /** Gridlines are drawn behind the plot. */
  readonly majorGridlines: boolean
  readonly labelsVisible: boolean
  readonly labelSizePt: number
  readonly reversed: boolean
}

export interface PptxChart {
  readonly kind: PptxChartKind
  /** `c:barDir`: `col` or `bar`. */
  readonly direction: 'column' | 'bar' | 'none'
  /** `c:grouping`: `clustered`, `stacked`, `percentStacked`, `standard`. */
  readonly grouping: 'clustered' | 'stacked' | 'percentStacked' | 'standard'
  readonly title: string | null
  readonly titleSizePt: number
  readonly series: readonly PptxChartSeries[]
  readonly categories: readonly string[]
  readonly valueAxis: PptxChartAxis | null
  readonly categoryAxis: PptxChartAxis | null
  readonly legend: 'none' | 'right' | 'bottom' | 'top' | 'left'
  readonly legendSizePt: number
  /** `c:holeSize` for a doughnut, as a fraction. */
  readonly holeSize: number
  /** Data-label settings, honoured for the single-series case. */
  readonly showValueLabels: boolean
  readonly valueLabelSizePt: number
  readonly varyColors: boolean
  /** Palette used when `varyColors` is set and a series has no explicit fill. */
  readonly palette: readonly OfficeColor[]
}

/** `c:ser` fills: an explicit `c:spPr` fill wins, else the accent cycle. */
function parseSeriesFill(ser: Element, theme: Theme, index: number): ShapeFill | null {
  const spPr = childOf(ser, 'spPr')
  const explicit = spPr ? resolveShapeProperties(spPr, null, theme, null).fill : null
  if (explicit && explicit.type !== 'none') return explicit
  const accent = theme.color(`accent${(index % 6) + 1}`)
  return accent ? { type: 'solid', color: accent } : null
}

function parseSeriesLine(ser: Element, theme: Theme): {
  fill: ShapeFill | null
  widthPt: number
} {
  const spPr = childOf(ser, 'spPr')
  const ln = spPr ? childOf(spPr, 'ln') : null
  const widthPt = attrNumber(ln, 'w') ? (attrNumber(ln, 'w') as number) / 12700 : 2.25
  if (!ln) return { fill: null, widthPt }
  const properties = resolveShapeProperties(spPr, null, theme, null)
  return { fill: properties.line.fill, widthPt: properties.line.widthPt }
}

/**
 * Read a cached series. `numCache`/`strCache` both use `c:pt/@idx`, which is
 * sparse — a formula returning `#N/A` leaves gaps — so the points are placed by
 * index rather than pushed in document order.
 */
function parsePoints(node: Element | null): { values: (number | null)[]; labels: (string | null)[] } {
  const values: (number | null)[] = []
  const labels: (string | null)[] = []
  if (!node) return { values, labels }
  const { cache, textual } = cachedPoints(node)
  if (!cache) return { values, labels }
  const count = attrInt(childOf(cache, 'ptCount'), 'val') ?? 0
  values.length = count
  labels.length = count
  for (const pt of childrenOf(cache, 'pt')) {
    const index = attrInt(pt, 'idx') ?? 0
    if (index < 0 || index >= count) continue
    const text = childOf(pt, 'v')?.textContent ?? ''
    if (textual) {
      labels[index] = text
    } else {
      const value = Number(text)
      values[index] = Number.isFinite(value) ? value : null
    }
  }
  return { values, labels }
}

function numericValues(node: Element | null): (number | null)[] {
  const values: (number | null)[] = []
  if (!node) return values
  const { cache, textual } = cachedPoints(node)
  if (!cache || textual) return values
  const count = attrInt(childOf(cache, 'ptCount'), 'val') ?? 0
  values.length = count
  for (const pt of childrenOf(cache, 'pt')) {
    const index = attrInt(pt, 'idx') ?? 0
    if (index < 0 || index >= count) continue
    const value = Number(childOf(pt, 'v')?.textContent ?? '')
    values[index] = Number.isFinite(value) ? value : null
  }
  return values
}

/**
 * The cache lives one or two levels down: `c:val/c:numRef/c:numCache` when the
 * series is linked to a worksheet range, and `c:val/c:numLit/c:numCache` for
 * literal data. Both wrap the same `c:pt` list, so the cache is found by name
 * rather than by position, and a missing cache is normal for a chart whose
 * workbook was never saved alongside it.
 */
function cachedPoints(node: Element): { cache: Element | null; textual: boolean } {
  const text = descendantsOf(node, 'strCache')[0]
  if (text) return { cache: text, textual: true }
  return { cache: descendantsOf(node, 'numCache')[0] ?? null, textual: false }
}

function parseMarker(ser: Element): boolean {
  const marker = childOf(ser, 'marker')
  if (!marker) return false
  const symbol = childOf(marker, 'symbol')
  return symbol ? attr(symbol, 'val') !== 'none' : true
}

function parseAxisTitle(axis: Element): string | null {
  const title = childOf(axis, 'title')
  if (!title) return null
  return descendantsOf(title, 't')
    .map((node) => node.textContent ?? '')
    .join('')
    .trim() || null
}

function parseAxisScale(node: Element | null): { min: number | null; max: number | null } {
  if (!node) return { min: null, max: null }
  const scaling = childOf(node, 'scaling')
  return {
    min: attrNumber(childOf(scaling, 'min'), 'val') ?? null,
    max: attrNumber(childOf(scaling, 'max'), 'val') ?? null,
  }
}

function parseAxis(node: Element, kind: PptxChartAxis['kind']): PptxChartAxis {
  const scaling = childOf(node, 'scaling')
  const orientation = attr(childOf(scaling, 'orientation'), 'val')
  const position = attr(childOf(node, 'axPos'), 'val')
  const deleteNode = childOf(node, 'delete')
  const numFmt = childOf(node, 'numFmt')
  const majorGridlines = childOf(node, 'majorGridlines') !== null
  const txPr = childOf(node, 'txPr')
  const defRPr = descendantsOf(txPr, 'defRPr')[0]
  return {
    id: attr(childOf(node, 'axId'), 'val') ?? '',
    kind,
    deleted: attrBool(deleteNode, 'val') ?? false,
    title: parseAxisTitle(node),
    position:
      position === 'l' ? 'left' : position === 'r' ? 'right' : position === 't' ? 'top' : 'bottom',
    majorUnit: attrNumber(childOf(node, 'majorUnit'), 'val') ?? null,
    ...parseAxisScale(node),
    numberFormat: attr(numFmt, 'formatCode') ?? null,
    majorGridlines,
    labelsVisible: (attrBool(deleteNode, 'val') ?? false) === false,
    labelSizePt: attrNumber(defRPr, 'sz') ? (attrNumber(defRPr, 'sz') as number) / 100 : 10,
    reversed: orientation === 'maxMin',
  }
}

const AXIS_KINDS: Readonly<Record<string, PptxChartAxis['kind']>> = {
  catAx: 'category',
  dateAx: 'date',
  serAx: 'series',
  valAx: 'value',
}

const PLOT_KINDS: readonly { readonly element: string; readonly kind: PptxChartKind }[] = [
  { element: 'barChart', kind: 'bar' },
  { element: 'bar3DChart', kind: 'bar' },
  { element: 'lineChart', kind: 'line' },
  { element: 'line3DChart', kind: 'line' },
  { element: 'areaChart', kind: 'area' },
  { element: 'area3DChart', kind: 'area' },
  { element: 'pieChart', kind: 'pie' },
  { element: 'pie3DChart', kind: 'pie' },
  { element: 'doughnutChart', kind: 'doughnut' },
  { element: 'scatterChart', kind: 'scatter' },
  { element: 'bubbleChart', kind: 'bubble' },
  { element: 'radarChart', kind: 'radar' },
  { element: 'stockChart', kind: 'stock' },
  { element: 'surfaceChart', kind: 'surface' },
]

const DEFAULT_PALETTE = ['4472C4', 'ED7D31', 'A5A5A5', 'FFC000', '5B9BD5', '70AD47']

/** Parse a `c:chartSpace` part against the theme that governs its slide. */
export function parseChart(root: Element | null | undefined, theme: Theme): PptxChart | null {
  if (!root) return null
  const chart = childOf(root, 'chart') ?? root
  const plotArea = childOf(chart, 'plotArea')
  if (!plotArea) return null

  let kind: PptxChartKind | null = null
  let plot: Element | null = null
  for (const candidate of PLOT_KINDS) {
    const found = childOf(plotArea, candidate.element)
    if (found) {
      kind = candidate.kind
      plot = found
      break
    }
  }
  if (!kind || !plot) return null

  const series: PptxChartSeries[] = []
  for (const ser of childrenOf(plot, 'ser')) {
    const index = attrInt(childOf(ser, 'idx'), 'val') ?? series.length
    const order = attrInt(childOf(ser, 'order'), 'val') ?? index
    const name =
      descendantsOf(childOf(ser, 'tx') ?? ser, 'v')
        .map((node) => node.textContent ?? '')
        .join('') || `Series ${index + 1}`
    const { values, labels } = parsePoints(childOf(ser, 'val') ?? childOf(ser, 'yVal'))
    const cat = childOf(ser, 'cat') ?? childOf(ser, 'xVal')
    const { labels: catLabels } = parsePoints(cat)
    const points: { value: number | null; label: string | null }[] = values.map((value, position) => ({
      value,
      label: labels[position] ?? catLabels[position] ?? null,
    }))
    // A scatter series stores its categories in `xVal`; the shared helper read
    // them as labels, so the numeric form is taken directly.
    if (kind === 'scatter' || kind === 'bubble') {
      const xValues = numericValues(childOf(ser, 'xVal'))
      const yValues = numericValues(childOf(ser, 'yVal'))
      for (let position = 0; position < Math.max(xValues.length, yValues.length); position += 1) {
        points[position] = { value: yValues[position] ?? null, label: null }
      }
    }
    const { fill: lineFill, widthPt } = parseSeriesLine(ser, theme)
    series.push({
      index,
      order,
      name,
      points,
      fill: parseSeriesFill(ser, theme, index),
      line: lineFill,
      lineWidthPt: widthPt,
      smooth: attrBool(childOf(ser, 'smooth'), 'val') ?? false,
      marker: parseMarker(ser),
      xValues: numericValues(childOf(ser, 'xVal')),
      bubbleSizes: numericValues(childOf(ser, 'bubbleSize')),
    })
  }
  if (series.length === 0) return null

  // Category labels live in `c:cat` and are shared by every series, so the
  // first series that actually carries them wins. Reading only `series[0]`
  // loses the axis when the first series stores values in `c:yVal` instead.
  const categoryLabels: string[] = []
  for (const entry of series) {
    const labels = entry.points.map((point) => point.label ?? '')
    if (labels.some((value) => value !== '')) {
      categoryLabels.push(...labels)
      break
    }
  }

  const axesById = new Map<string, PptxChartAxis>()
  for (const node of childrenOf(plotArea)) {
    const axisKind = AXIS_KINDS[node.localName]
    if (!axisKind) continue
    const axis = parseAxis(node, axisKind)
    axesById.set(axis.id, axis)
  }
  const axisIds = childrenOf(plot, 'axId')
    .map((node) => attr(node, 'val'))
    .filter((id): id is string => Boolean(id))
  const referenced = axisIds.map((id) => axesById.get(id)).filter((axis): axis is PptxChartAxis => Boolean(axis))
  const valueAxis = referenced.find((axis) => axis.kind === 'value') ?? null
  const categoryAxis = referenced.find((axis) => axis.kind === 'category' || axis.kind === 'date') ?? null

  const titleNode = childOf(chart, 'title')
  const titleRuns = titleNode ? descendantsOf(titleNode, 't') : []
  const titleText = titleRuns.map((node) => node.textContent ?? '').join('').trim()
  const titleDefRPr = descendantsOf(titleNode, 'defRPr')[0]
  const titleSize = attrNumber(titleDefRPr, 'sz')

  const legendNode = childOf(chart, 'legend')
  const legendPos = attr(childOf(legendNode, 'legendPos'), 'val')
  const legendDefRPr = descendantsOf(legendNode, 'defRPr')[0]
  const legendSize = attrNumber(legendDefRPr, 'sz')

  const dataLabels = childOf(plot, 'dLbls')
  const showValueLabels = attrBool(childOf(dataLabels, 'showVal'), 'val') ?? false

  const holeSize = attrInt(childOf(plot, 'holeSize'), 'val')

  const palette = DEFAULT_PALETTE.map((hex) => theme.color(`accent${DEFAULT_PALETTE.indexOf(hex) + 1}`)).filter(
    (color): color is OfficeColor => color !== null
  )

  return {
    kind,
    direction: attr(childOf(plot, 'barDir'), 'val') === 'bar' ? 'bar' : 'column',
    grouping: (attr(childOf(plot, 'grouping'), 'val') as PptxChart['grouping']) ?? 'clustered',
    title: titleText || null,
    titleSizePt: titleSize ? titleSize / 100 : 14,
    series,
    categories: categoryLabels,
    valueAxis,
    categoryAxis,
    legend:
      legendNode === null
        ? 'none'
        : legendPos === 'b'
          ? 'bottom'
          : legendPos === 't'
            ? 'top'
            : legendPos === 'l'
              ? 'left'
              : 'right',
    legendSizePt: legendSize ? legendSize / 100 : 10,
    holeSize: holeSize ? holeSize / 100 : 0.5,
    showValueLabels,
    valueLabelSizePt: 10,
    varyColors: attrBool(childOf(plot, 'varyColors'), 'val') ?? false,
    palette: palette.length > 0 ? palette : [],
  }
}

/** Convenience for diagnostics: a one-line description of a chart. */
export function describeChart(chart: PptxChart): string {
  const series = chart.series.map((entry) => `${entry.name}(${entry.points.length})`).join(' ')
  return `${chart.kind}/${chart.direction} [${series}] cats=${chart.categories.length} legend=${chart.legend}`
}
