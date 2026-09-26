/**
 * Chart rendering.
 *
 * Charts are drawn as SVG from the parsed model rather than delegated to a
 * charting library, because the model already holds everything needed to paint
 * one: cached category labels, per-series values, resolved series colours, axis
 * scaling and the legend position. Nothing here reads XML or resolves
 * inheritance.
 *
 * The layout follows Office's: a plot rectangle inset by room for the axis
 * labels, gridlines drawn behind the data, and a legend that reserves space on
 * the side the author chose. Axes and ticks are drawn in one coordinate space
 * so a label never needs to be positioned against the plot.
 *
 * The bar/line/area/pie family is implemented directly. Types outside it (stock,
 * surface, radar) fall through to a labelled placeholder, which is honest about
 * what was not drawn instead of showing a wrong chart.
 */

import { colorToCss, type OfficeColor } from '../../ooxml/index.js'
import type { PptxChart, PptxChartAxis, PptxChartSeries } from '../../ooxml/index.js'
import { svg, type StyleMap } from './dom.js'

const PT_PER_PX = 0.75

/** Share of a category's slot taken by its bars, leaving a gap between groups. */
const GROUP_FILL = 0.7

interface Frame {
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
}

interface Scale {
  readonly min: number
  readonly max: number
  readonly ticks: number[]
}

const AXIS_STYLE = '#8a8a8a'
const GRID_STYLE = '#d9d9d9'
const TEXT_STYLE = '#404040'

/** Tick values for a value axis: the author's major unit, or a "nice" default. */
function buildScale(chart: PptxChart, axis: PptxChartAxis | null): Scale {
  let min = axis?.min ?? Number.POSITIVE_INFINITY
  let max = axis?.max ?? Number.NEGATIVE_INFINITY
  for (const series of chart.series) {
    for (const point of series.points) {
      if (point.value === null) continue
      if (point.value < min) min = point.value
      if (point.value > max) max = point.value
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    min = 0
    max = 1
  }
  if (min === max) {
    // A flat series has no range, so it is given a symmetric band around itself
    // rather than a zero-height axis that draws nothing.
    min = Math.min(0, min)
    max = max + 1
  }
  if (min > 0) min = 0
  if (max < 0) max = 0

  const step = axis?.majorUnit && axis.majorUnit > 0 ? axis.majorUnit : chooseStep(min, max)
  const ticks: number[] = []
  const first = Math.ceil(min / step) * step
  for (let value = first; value <= max + step / 1000; value += step) {
    ticks.push(Math.round(value * 1e6) / 1e6)
  }
  return { min, max, ticks }
}

/**
 * The tick step for a range, chosen by how many gridlines it produces rather
 * than by rounding the step up.
 *
 * Picking from 1/2/5/10 by magnitude alone lands on 2 for a 0..7.8 range, which
 * is only four gridlines — visibly coarser than what Office draws. Scoring the
 * candidates by how close their tick count is to six picks 1, and gives eight.
 */
const STEP_CANDIDATES: readonly number[] = [1, 2, 2.5, 5, 10]
const TARGET_TICKS = 6

function chooseStep(min: number, max: number): number {
  const range = max - min
  if (!Number.isFinite(range) || range <= 0) return 1
  const magnitude = 10 ** Math.floor(Math.log10(range / TARGET_TICKS))
  let best = magnitude
  let bestScore = Number.POSITIVE_INFINITY
  for (const multiplier of STEP_CANDIDATES) {
    const step = multiplier * magnitude
    if (step <= 0) continue
    const count = Math.floor((max - min) / step + 1e-9) + 1
    // Fewer than two gridlines means an unreadable axis, and more than twelve
    // turns it into noise, so both are penalised rather than allowed.
    const score = Math.abs(count - TARGET_TICKS) + (count < 2 ? 100 : 0) + (count > 12 ? 100 : 0)
    if (score < bestScore) {
      bestScore = score
      best = step
    }
  }
  return best
}

function formatTick(value: number, format: string | null): string {
  if (format) {
    // Only the common simple cases are honoured; a full Excel number-format
    // engine is out of scope, and an unformatted fallback is safer than a
    // half-parsed one.
    const scaled = format.match(/^0\.(0+)$/)
    if (scaled) return value.toFixed(scaled[1]?.length ?? 0)
  }
  return String(Math.round(value * 1e6) / 1e6)
}

function seriesColor(series: PptxChartSeries, index: number, chart: PptxChart): string {
  const fill = series.fill
  if (fill && fill.type === 'solid') return colorToCss(fill.color)
  if (fill && fill.type === 'gradient' && fill.stops[0]) return colorToCss(fill.stops[0].color)
  const palette = chart.palette
  const color: OfficeColor | undefined = palette[index % Math.max(1, palette.length)]
  return color ? colorToCss(color) : '#5b9bd5'
}

function textNode(x: number, y: number, content: string, sizePt: number, extra: StyleMap = {}): SVGTextElement {
  const node = svg('text', {
    x,
    y,
    'font-size': sizePt * PT_PER_PX,
    fill: TEXT_STYLE,
    'font-family': 'Calibri, system-ui, sans-serif',
    ...extra,
  })
  node.textContent = content
  return node
}

function frameFor(chart: PptxChart, width: number, height: number): Frame {
  const valueAxis = chart.valueAxis
  const labelWidth = valueAxis && !valueAxis.deleted && valueAxis.labelsVisible ? 36 : 8
  const categoryLabels = chart.categoryAxis && !chart.categoryAxis.deleted && chart.categoryAxis.labelsVisible
  const labelHeight = categoryLabels ? chart.categoryAxis.labelSizePt * PT_PER_PX + 6 : 8
  const titleHeight = chart.title ? chart.titleSizePt * PT_PER_PX + 8 : 0
  return {
    left: labelWidth,
    top: titleHeight,
    width: Math.max(1, width - labelWidth - 8),
    height: Math.max(1, height - titleHeight - labelHeight - 8),
  }
}

/**
 * The chart types whose plot is a per-category band. A column chart and a bar
 * chart share the `bar` kind and differ only by `c:barDir`, so `direction` —
 * not `kind` — is what makes one horizontal.
 */
function isCategoryKind(chart: PptxChart): boolean {
  return chart.kind === 'bar' || chart.kind === 'area' || chart.kind === 'line'
}

/** Bar/column/area/line/pie rendering. Returns `null` for unsupported types. */
function drawSupported(chart: PptxChart, width: number, height: number): SVGElement | null {
  if (!isCategoryKind(chart) && chart.kind !== 'pie' && chart.kind !== 'doughnut') return null
  const root = svg('svg', { width, height, viewBox: `0 0 ${width} ${height}` })
  if (chart.title) {
    root.appendChild(
      textNode(width / 2, chart.titleSizePt * PT_PER_PX, chart.title, chart.titleSizePt, {
        'text-anchor': 'middle',
        'font-weight': 600,
      })
    )
  }

  if (chart.kind === 'pie' || chart.kind === 'doughnut') {
    drawPie(chart, root, width, height)
    return root
  }

  const frame = frameFor(chart, width, height)
  const scale = buildScale(chart, chart.valueAxis)
  drawGridAndValueAxis(chart, root, frame, scale)

  const horizontal = chart.direction === 'bar'
  const pointCount = Math.max(1, chart.categories.length)
  // A "slot" is the along-axis space one category gets, and the whole band
  // layout is a fraction of it. Deriving the band from the plot's other
  // dimension instead is what makes a wide chart grow its bars without bound.
  const slot = (horizontal ? frame.height : frame.width) / pointCount
  const seriesCount = Math.max(1, chart.series.length)
  const stacked = chart.grouping === 'stacked' || chart.grouping === 'percentStacked'
  const groupSize = slot * GROUP_FILL
  const band = groupSize / seriesCount
  const thickness = Math.max(1, band * 0.9)

  // A stacked bar continues where the previous series ended, so the running
  // total is kept per category rather than per series.
  const runningTotals = chart.categories.map(() => scale.min)

  chart.series.forEach((series, seriesIndex) => {
    const color = seriesColor(series, seriesIndex, chart)
    series.points.forEach((point, pointIndex) => {
      if (point.value === null) return
      const base = stacked ? (runningTotals[pointIndex] ?? scale.min) : scale.min
      const top = base + point.value
      if (stacked) runningTotals[pointIndex] = top

      const from = fractionOf(scale, Math.min(base, top))
      const to = fractionOf(scale, Math.max(base, top))
      // `to - from` is a fraction of the value range, so it becomes a length by
      // scaling the axis it is measured along.
      const length = Math.abs(to - from) * (horizontal ? frame.width : frame.height)
      const along = (pointIndex + 0.5) * slot - groupSize / 2 + seriesIndex * band + (band - thickness) / 2
      const x = horizontal ? frame.left + from * frame.width : frame.left + along
      const y = horizontal ? frame.top + along : frame.top + (1 - to) * frame.height
      const w = horizontal ? length : thickness
      const h = horizontal ? thickness : length

      root.appendChild(
        svg('rect', {
          class: 'py-ooxml-bar',
          x: Math.round(x * 100) / 100,
          y: Math.round(y * 100) / 100,
          width: Math.max(0, Math.round(w * 100) / 100),
          height: Math.max(0, Math.round(h * 100) / 100),
          fill: color,
        })
      )
      if (chart.showValueLabels && chart.series.length === 1) {
        root.appendChild(
          textNode(x + w / 2, horizontal ? y - 2 : y - 3, String(point.value), chart.valueLabelSizePt, {
            'text-anchor': 'middle',
          })
        )
      }
    })
  })

  if (chart.kind === 'line' || chart.kind === 'area') {
    drawLines(chart, root, frame, scale, slot, horizontal)
  }

  drawCategoryAxis(chart, root, frame, slot, horizontal)
  if (chart.legend !== 'none') drawLegend(chart, root, width, height)
  return root
}

const fractionOf = (scale: Scale, value: number): number =>
  scale.max === scale.min ? 0 : (value - scale.min) / (scale.max - scale.min)

function drawGridAndValueAxis(chart: PptxChart, root: SVGElement, frame: Frame, scale: Scale): void {
  const axis = chart.valueAxis
  const grid = svg('g')
  for (const tick of scale.ticks) {
    const ratio = fractionOf(scale, tick)
    const y = frame.top + (1 - ratio) * frame.height
    grid.appendChild(
      svg('line', {
        x1: frame.left,
        y1: Math.round(y * 100) / 100,
        x2: frame.left + frame.width,
        y2: Math.round(y * 100) / 100,
        stroke: GRID_STYLE,
        'stroke-width': 1,
      })
    )
    if (axis && !axis.deleted && axis.labelsVisible) {
      grid.appendChild(
        textNode(frame.left - 4, y + axis.labelSizePt * 0.35, formatTick(tick, axis.numberFormat), axis.labelSizePt, {
          'text-anchor': 'end',
        })
      )
    }
  }
  grid.appendChild(
    svg('line', {
      x1: frame.left,
      y1: frame.top,
      x2: frame.left,
      y2: frame.top + frame.height,
      stroke: AXIS_STYLE,
      'stroke-width': 1,
    })
  )
  root.appendChild(grid)
}

function drawCategoryAxis(
  chart: PptxChart,
  root: SVGElement,
  frame: Frame,
  slot: number,
  horizontal: boolean
): void {
  const axis = chart.categoryAxis
  if (axis && axis.deleted) return
  const size = axis?.labelSizePt ?? 10
  chart.categories.forEach((category, index) => {
    const center = (index + 0.5) * slot
    if (horizontal) {
      root.appendChild(
        textNode(frame.left + frame.width + 4, frame.top + center + size * 0.35, category, size, {
          'text-anchor': 'start',
        })
      )
    } else {
      root.appendChild(
        textNode(frame.left + center, frame.top + frame.height + size + 2, category, size, {
          'text-anchor': 'middle',
        })
      )
    }
  })
  const line = horizontal
    ? svg('line', {
        x1: frame.left + frame.width,
        y1: frame.top,
        x2: frame.left + frame.width,
        y2: frame.top + frame.height,
        stroke: AXIS_STYLE,
        'stroke-width': 1,
      })
    : svg('line', {
        x1: frame.left,
        y1: frame.top + frame.height,
        x2: frame.left + frame.width,
        y2: frame.top + frame.height,
        stroke: AXIS_STYLE,
        'stroke-width': 1,
      })
  root.appendChild(line)
}

function drawLines(
  chart: PptxChart,
  root: SVGElement,
  frame: Frame,
  scale: Scale,
  slot: number,
  horizontal: boolean
): void {
  chart.series.forEach((series, seriesIndex) => {
    const color = seriesColor(series, seriesIndex, chart)
    const parts: string[] = []
    let open = false
    series.points.forEach((point, index) => {
      if (point.value === null) {
        open = false
        return
      }
      const ratio = fractionOf(scale, point.value)
      const along = (index + 0.5) * slot
      const x = horizontal ? frame.left + ratio * frame.width : frame.left + along
      const y = horizontal ? frame.top + along : frame.top + (1 - ratio) * frame.height
      parts.push(`${open ? 'L' : 'M'}${Math.round(x * 100) / 100} ${Math.round(y * 100) / 100}`)
      open = true
    })
    if (parts.length === 0) return
    if (chart.kind === 'area') {
      // An area is its line closed against the baseline, so the closing
      // coordinates are read back out of the first and last commands rather
      // than recomputed.
      const first = parts[0] ?? ''
      const last = parts[parts.length - 1] ?? ''
      const tail = horizontal
        ? `L${frame.left} ${yOf(last)} L${frame.left} ${yOf(first)} Z`
        : `L${xOf(last)} ${frame.top + frame.height} L${xOf(first)} ${frame.top + frame.height} Z`
      root.appendChild(
        svg('path', { d: `${parts.join(' ')} ${tail}`, fill: color, 'fill-opacity': 0.35, stroke: 'none' })
      )
    }
    root.appendChild(
      svg('path', {
        d: parts.join(' '),
        fill: 'none',
        stroke: color,
        'stroke-width': 2,
        'stroke-linejoin': 'round',
        'stroke-linecap': 'round',
      })
    )
    if (series.marker) {
      series.points.forEach((point, index) => {
        if (point.value === null) return
        const ratio = fractionOf(scale, point.value)
        const along = (index + 0.5) * slot
        const x = horizontal ? frame.left + ratio * frame.width : frame.left + along
        const y = horizontal ? frame.top + along : frame.top + (1 - ratio) * frame.height
        root.appendChild(svg('circle', { cx: x, cy: y, r: 3, fill: color }))
      })
    }
  })
}

const yOf = (command: string): number => Number(command.split(' ')[1] ?? 0)
const xOf = (command: string): number => Number(command.replace(/[ML]/, '').split(' ')[0] ?? 0)

function drawPie(chart: PptxChart, root: SVGElement, width: number, height: number): void {
  const series = chart.series[0]
  const radius = Math.max(1, Math.min(width, height) / 2 - 8)
  const cx = width / 2
  const cy = height / 2
  const total = (series?.points ?? []).reduce((sum, point) => sum + (point.value ?? 0), 0)
  if (!series || total <= 0) return
  let angle = -Math.PI / 2
  series.points.forEach((point, index) => {
    const value = point.value ?? 0
    const slice = (value / total) * Math.PI * 2
    const end = angle + slice
    const inner = chart.kind === 'doughnut' ? radius * chart.holeSize : 0
    root.appendChild(
      svg('path', {
        d: annulusSector(cx, cy, radius, inner, angle, end),
        fill: seriesColor(series, index, chart),
        stroke: '#ffffff',
        'stroke-width': 1,
      })
    )
    if (chart.showValueLabels) {
      const middle = angle + slice / 2
      const labelRadius = (radius + inner) / 2
      root.appendChild(
        textNode(cx + Math.cos(middle) * labelRadius, cy + Math.sin(middle) * labelRadius, String(value), chart.valueLabelSizePt, {
          'text-anchor': 'middle',
          'dominant-baseline': 'middle',
        })
      )
    }
    angle = end
  })
}

/** A filled sector, or a ring segment when `inner` is non-zero. */
function annulusSector(
  cx: number,
  cy: number,
  outer: number,
  inner: number,
  from: number,
  to: number
): string {
  const full = to - from >= Math.PI * 2 - 1e-6
  const end = full ? from + Math.PI * 2 - 1e-6 : to
  const large = end - from > Math.PI ? 1 : 0
  const r = (angle: number): string =>
    `${Math.round((cx + Math.cos(angle) * outer) * 100) / 100} ${Math.round((cy + Math.sin(angle) * outer) * 100) / 100}`
  const i = (angle: number): string =>
    `${Math.round((cx + Math.cos(angle) * inner) * 100) / 100} ${Math.round((cy + Math.sin(angle) * inner) * 100) / 100}`
  if (inner <= 0) {
    return `M${cx} ${cy} L${r(from)} A${outer} ${outer} 0 ${large} 1 ${r(end)} Z`
  }
  return `M${r(from)} A${outer} ${outer} 0 ${large} 1 ${r(end)} L${i(end)} A${inner} ${inner} 0 ${large} 0 ${i(from)} Z`
}

function drawLegend(chart: PptxChart, root: SVGElement, width: number, height: number): void {
  const size = chart.legendSizePt
  const entries = chart.series
  const horizontal = chart.legend === 'bottom' || chart.legend === 'top'
  const step = size * PT_PER_PX * 6
  entries.forEach((series, index) => {
    const swatchX = horizontal ? 8 + index * step : width - step
    const swatchY = horizontal ? height - size * PT_PER_PX - 4 : 8 + index * step
    root.appendChild(
      svg('rect', {
        x: swatchX,
        y: swatchY,
        width: size * PT_PER_PX * 0.8,
        height: size * PT_PER_PX * 0.8,
        fill: seriesColor(series, index, chart),
      })
    )
    root.appendChild(
      textNode(swatchX + size * PT_PER_PX, swatchY + size * PT_PER_PX * 0.8, series.name, size, {
        'text-anchor': 'start',
      })
    )
  })
}

/** A visible note in place of a chart type this renderer does not draw. */
function placeholder(width: number, height: number, label: string): SVGElement {
  const root = svg('svg', { width, height, viewBox: `0 0 ${width} ${height}` })
  root.appendChild(
    svg('rect', {
      x: 0.5,
      y: 0.5,
      width: Math.max(0, width - 1),
      height: Math.max(0, height - 1),
      fill: 'none',
      stroke: GRID_STYLE,
      'stroke-dasharray': '4 4',
    })
  )
  root.appendChild(
    textNode(width / 2, height / 2, `${label} chart`, 12, { 'text-anchor': 'middle', 'dominant-baseline': 'middle' })
  )
  return root
}

const KIND_LABELS: Readonly<Record<string, string>> = {
  stock: 'Stock',
  surface: 'Surface',
  radar: 'Radar',
  bubble: 'Bubble',
  scatter: 'Scatter',
}

/**
 * Build the chart's SVG for a `width`×`height` box in pixels.
 *
 * The box is in pixels while the model is in points, so a chart inserted at a
 * non-native size scales the way a picture would rather than being redrawn.
 */
export function buildChart(chart: PptxChart, width: number, height: number): SVGElement {
  const supported = drawSupported(chart, width, height)
  const root = supported ?? placeholder(width, height, KIND_LABELS[chart.kind] ?? 'Chart')
  root.classList.add('py-ooxml-chart')
  root.dataset['pfChartKind'] = chart.kind
  return root
}
