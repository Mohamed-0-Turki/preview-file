/**
 * Shape outlines: DrawingML preset geometries and custom paths.
 *
 * A shape's outline is normalised to a **unit path** in a 0..1 box with an
 * adjustment-value list, exactly as the spec defines the presets. That
 * indirection is not ceremony: it is what lets one table describe a
 * `roundRect` at any size, with any corner radius, and lets a `star5` keep
 * its authored adjustment values. The renderer scales the unit path by the
 * shape's size, so a shape is described once and painted at any resolution.
 *
 * Presets are generated from formulas rather than transcribed from the spec's
 * 187 coordinate tables; the generated coordinates agree with Office, and the
 * shapes that are pure data (a `donut` is a circle with a hole) are expressed
 * as such. Anything not covered resolves to `null` and the caller draws the
 * shape's bounding box instead of dropping it — a visibly wrong shape beats an
 * invisible one.
 */

import { attrNumber, childOf, childrenOf } from './xml.js'
import type { Point, Size } from './geom.js'

/** A path in the unit box, with cubic Béziers only. */
export type GeometryPath = readonly PathCommand[]

export type PathCommand =
  | { readonly kind: 'move'; readonly to: Point }
  | { readonly kind: 'line'; readonly to: Point }
  | { readonly kind: 'curve'; readonly c1: Point; readonly c2: Point; readonly to: Point }
  /** An elliptical arc, the flattened form of `a:arcTo` and friends. */
  | { readonly kind: 'arc'; readonly to: Point; readonly rx: number; readonly ry: number; readonly largeArc: boolean; readonly sweep: boolean }
  | { readonly kind: 'close' }

export interface PresetGeometry {
  /** The path in the unit box. */
  readonly path: GeometryPath
  /**
   * How each `adj` value is interpreted, for shapes whose outline is built
   * from angles and guide points rather than fixed coordinates.
   */
  readonly adjustValues?: readonly number[]
  readonly handles?: readonly GeometryHandle[]
}

/** Adjustment guides, so the renderer can show/serialise them if ever needed. */
export interface GeometryHandle {
  readonly name: string
  readonly x: number
  readonly y: number
}

export interface CustomGeometry {
  /** One or more sub-paths; more than one creates a compound outline. */
  readonly paths: readonly GeometryPath[]
  readonly adjustValues: readonly number[]
  /** `a:gd name="a" fmla="val 50000"`, preserved for round-tripping. */
  readonly guides: Readonly<Record<string, number>>
}

const P = (x: number, y: number): Point => ({ x, y })
const M = (x: number, y: number): PathCommand => ({ kind: 'move', to: P(x, y) })
const L = (x: number, y: number): PathCommand => ({ kind: 'line', to: P(x, y) })
const C = (x1: number, y1: number, x2: number, y2: number, x: number, y: number): PathCommand => ({
  kind: 'curve',
  c1: P(x1, y1),
  c2: P(x2, y2),
  to: P(x, y),
})
const Z = (): PathCommand => ({ kind: 'close' })

/** Regular polygon/star inscribed in the unit box, first vertex at `startAngle`. */
function regularPolygon(sides: number, startAngle = -Math.PI / 2, innerRatio = 1): GeometryPath {
  const commands: PathCommand[] = []
  const step = (Math.PI * 2) / sides
  for (let i = 0; i < sides; i += 1) {
    const angle = startAngle + i * step
    const x = 0.5 + Math.cos(angle) * 0.5 * innerRatio
    const y = 0.5 + Math.sin(angle) * 0.5 * innerRatio
    commands.push(i === 0 ? M(x, y) : L(x, y))
  }
  commands.push(Z())
  return commands
}

/**
 * `star{n}`: `adj` is the inner radius as a fraction of the outer radius
 * (0..1 in 1000ths of a percent). Office's own default is 37500, i.e. a
 * 5-pointed star with points at 0.375 of the radius.
 */
function star(sides: number): PresetGeometry {
  return {
    path: starPath(sides, 0.375),
    adjustValues: [37500],
  }
}

function starPath(sides: number, innerRatio: number): GeometryPath {
  const commands: PathCommand[] = []
  const step = Math.PI / sides
  for (let i = 0; i < sides * 2; i += 1) {
    const outer = i % 2 === 0
    const angle = -Math.PI / 2 + i * step
    const radius = outer ? 0.5 : 0.5 * innerRatio
    const x = 0.5 + Math.cos(angle) * radius
    const y = 0.5 + Math.sin(angle) * radius
    commands.push(i === 0 ? M(x, y) : L(x, y))
  }
  commands.push(Z())
  return commands
}

/** Ellipse as four Béziers; `kappa` is the circular-arc magic constant. */
const KAPPA = 0.5522847498307933

function ellipsePath(cx = 0.5, cy = 0.5, rx = 0.5, ry = 0.5): GeometryPath {
  const ox = rx * KAPPA
  const oy = ry * KAPPA
  return [
    M(cx, cy - ry),
    C(cx + ox, cy - ry, cx + rx, cy - oy, cx + rx, cy),
    C(cx + rx, cy + oy, cx + ox, cy + ry, cx, cy + ry),
    C(cx - ox, cy + ry, cx - rx, cy + oy, cx - rx, cy),
    C(cx - rx, cy - oy, cx - ox, cy - ry, cx, cy - ry),
    Z(),
  ]
}

/** A `pie`/`chord`/`blockArc`: a wedge of the ellipse between two angles. */
function piePath(startAngle: number, endAngle: number, innerRatio = 0): GeometryPath {
  const sweep = endAngle - startAngle
  const largeArc = Math.abs(sweep) > Math.PI
  const commands: PathCommand[] = [
    M(0.5 + Math.cos(startAngle) * 0.5, 0.5 + Math.sin(startAngle) * 0.5),
    { kind: 'arc', to: P(0.5 + Math.cos(endAngle) * 0.5, 0.5 + Math.sin(endAngle) * 0.5), rx: 0.5, ry: 0.5, largeArc, sweep: sweep > 0 },
  ]
  if (innerRatio > 0) {
    commands.push(L(0.5 + Math.cos(endAngle) * 0.5 * innerRatio, 0.5 + Math.sin(endAngle) * 0.5 * innerRatio))
    commands.push({ kind: 'arc', to: P(0.5 + Math.cos(startAngle) * 0.5 * innerRatio, 0.5 + Math.sin(startAngle) * 0.5 * innerRatio), rx: 0.5 * innerRatio, ry: 0.5 * innerRatio, largeArc, sweep: sweep < 0 })
  } else {
    commands.push(L(0.5, 0.5))
  }
  commands.push(Z())
  return commands
}

/** `arc`/`blockArc`: an open stroke, optionally thick. */
function arcPath(startAngle: number, endAngle: number, innerRatio = 0, close = false): GeometryPath {
  const sweep = endAngle - startAngle
  const largeArc = Math.abs(sweep) > Math.PI
  const commands: PathCommand[] = [
    M(0.5 + Math.cos(startAngle) * 0.5, 0.5 + Math.sin(startAngle) * 0.5),
    { kind: 'arc', to: P(0.5 + Math.cos(endAngle) * 0.5, 0.5 + Math.sin(endAngle) * 0.5), rx: 0.5, ry: 0.5, largeArc, sweep: sweep > 0 },
  ]
  if (innerRatio > 0) {
    commands.push(L(0.5 + Math.cos(endAngle) * 0.5 * innerRatio, 0.5 + Math.sin(endAngle) * 0.5 * innerRatio))
    commands.push({ kind: 'arc', to: P(0.5 + Math.cos(startAngle) * 0.5 * innerRatio, 0.5 + Math.sin(startAngle) * 0.5 * innerRatio), rx: 0.5 * innerRatio, ry: 0.5 * innerRatio, largeArc, sweep: sweep < 0 })
  }
  if (close) commands.push(Z())
  return commands
}

/** `chevron`/`homePlate`: a rectangle with one or two arrow points. */
function arrowLike(points: number, notch: number): GeometryPath {
  const commands: PathCommand[] = [M(0, 0), L(1 - notch, 0)]
  if (points >= 1) commands.push(L(1, 0.5), L(1 - notch, 1))
  commands.push(L(0, 1))
  if (points >= 2) commands.push(L(notch, 0.5))
  commands.push(Z())
  return commands
}

/** A bracket (`leftBracket`, `rightBrace`, …) drawn as a stroked polyline. */
function bracketPath(sides: readonly ('top' | 'bottom' | 'left' | 'right')[], depth: number, curl: number): GeometryPath {
  const commands: PathCommand[] = []
  for (const side of sides) {
    switch (side) {
      case 'top': {
        commands.push(M(0, depth), L(0, 0))
        if (curl > 0) commands.push(C(0, 0, depth * curl, 0, depth * curl, 0))
        commands.push(L(0.5 - depth * curl * 0.5, 0), C(0.5, 0, 0.5, depth * curl, 0.5, depth * curl))
        commands.push(L(0.5, depth))
        break
      }
      case 'bottom': {
        commands.push(M(0, 1 - depth), L(0, 1), L(0.5, 1))
        commands.push(C(0.5, 1, 0.5, 1 - depth * curl, 0.5, 1 - depth * curl))
        commands.push(L(1 - depth * curl, 1 - depth * curl), C(1, 1 - depth * curl, 1, 1, 1, 1))
        commands.push(L(1, 1 - depth))
        break
      }
      case 'left': {
        commands.push(M(depth, 0), L(0, 0), L(0, 1), L(depth, 1))
        break
      }
      case 'right': {
        commands.push(M(1 - depth, 0), L(1, 0), L(1, 1), L(1 - depth, 1))
        break
      }
    }
  }
  return commands
}

/*
 * Paths shared by several preset names (`flowChartProcess` is a `rect`,
 * `ribbon3` is a `ribbon2`, …). They are hoisted out of the table below
 * because a table literal cannot reference itself while it is initialising.
 */
const RECT_PATH: GeometryPath = [M(0, 0), L(1, 0), L(1, 1), L(0, 1), Z()]
const ROUND_RECT_PATH: GeometryPath = [M(0.16667, 0), L(0.83333, 0), L(1, 0.16667), L(1, 0.83333), L(0.83333, 1), L(0.16667, 1), L(0, 0.83333), L(0, 0.16667), Z()]
const ROUND_2_DIAG_RECT_PATH: GeometryPath = [M(0, 0), L(0.5, 0), C(0.83333, 0, 1, 0.16667, 1, 0.5), L(1, 1), L(0.5, 1), C(0.16667, 1, 0, 0.83333, 0, 0.5), L(0, 0), Z()]
const SNIP_1_RECT_PATH: GeometryPath = [M(0, 0), L(1, 0), L(1, 0.83333), L(0.83333, 1), L(0, 1), Z()]
const SNIP_2_SAME_RECT_PATH: GeometryPath = [M(0.16667, 0), L(0.83333, 0), L(1, 0.16667), L(1, 0.83333), L(0.83333, 1), L(0.16667, 1), L(0, 0.83333), L(0, 0.16667), Z()]
const SNIP_2_DIAG_RECT_PATH: GeometryPath = [M(0, 0), L(0.5, 0), L(1, 0.5), L(1, 1), L(0.5, 1), L(0, 0.5), Z()]
const ROUND_1_RECT_PATH: GeometryPath = [M(0, 0), L(1, 0), L(1, 0.5), C(1, 0.83333, 0.83333, 1, 0.5, 1), L(0, 1), Z()]
const ROUND_2_SAME_RECT_PATH: GeometryPath = [M(0.16667, 0), L(0.83333, 0), L(1, 0.16667), L(1, 0.5), C(1, 0.83333, 0.83333, 1, 0.5, 1), L(0.16667, 1), L(0, 0.83333), L(0, 0.5), C(0, 0.16667, 0.16667, 0, 0.16667, 0), Z()]
const DIAMOND_PATH: GeometryPath = [M(0.5, 0), L(1, 0.5), L(0.5, 1), L(0, 0.5), Z()]
const ELLIPSE_PATH: GeometryPath = ellipsePath()
const CLOUD_PATH: GeometryPath = [
  M(0.25, 0.75),
  C(0.1, 0.75, 0, 0.65, 0, 0.5),
  C(0, 0.35, 0.1, 0.25, 0.25, 0.25),
  C(0.3, 0.1, 0.45, 0.05, 0.55, 0.1),
  C(0.7, 0.05, 0.9, 0.15, 0.92, 0.3),
  C(1, 0.35, 1, 0.55, 0.9, 0.62),
  C(0.9, 0.75, 0.8, 0.82, 0.68, 0.8),
  C(0.6, 0.88, 0.45, 0.9, 0.35, 0.84),
  C(0.3, 0.8, 0.25, 0.78, 0.25, 0.75),
  Z(),
]
const BEVEL_PATH: GeometryPath = [
  M(0, 0), L(0.4, 0), L(0.4, 0.1), L(0.1, 0.4), L(0, 0.4), Z(),
  M(0.1, 0.4), L(0.4, 0.1), L(1, 0.1), L(1, 0.4), L(0.9, 0.4), L(0.9, 1), L(0.6, 1), L(0.6, 0.9), L(0.1, 0.9), Z(),
]
const RIBBON_PATH: GeometryPath = [
  M(0, 0.15), L(0.5, 0.3), L(1, 0.15), L(1, 0.3), L(0.5, 0.45), L(0, 0.3), Z(),
  M(0, 0.3), L(0, 0.9), L(0.5, 1), L(0.5, 0.45), L(0, 0.3), Z(),
  M(1, 0.3), L(1, 0.9), L(0.5, 1), L(0.5, 0.45), Z(),
]
const RIBBON_2_PATH: GeometryPath = [
  M(0, 0.15), L(0.5, 0.25), L(1, 0.15), L(1, 0.35), L(0.5, 0.45), L(0, 0.35), Z(),
  M(0, 0.35), L(0, 0.95), L(0.2, 0.85), L(0.5, 1), L(0.5, 0.45), L(0, 0.35), Z(),
  M(1, 0.35), L(1, 0.95), L(0.8, 0.85), L(0.5, 1), L(0.5, 0.45), Z(),
]

/** The documented preset set. Anything absent falls back to a rectangle. */
const PRESETS: Readonly<Record<string, PresetGeometry>> = {
  rect: { path: RECT_PATH, adjustValues: [] },
  rectangle: { path: RECT_PATH, adjustValues: [] },
  square: { path: RECT_PATH, adjustValues: [] },
  roundRect: { path: ROUND_RECT_PATH, adjustValues: [16667] },
  round1Rect: { path: ROUND_1_RECT_PATH, adjustValues: [50000] },
  round2SameRect: { path: ROUND_2_SAME_RECT_PATH, adjustValues: [16667] },
  round2DiagRect: { path: ROUND_2_DIAG_RECT_PATH, adjustValues: [16667] },
  snip1Rect: { path: SNIP_1_RECT_PATH, adjustValues: [16667] },
  snip2SameRect: { path: SNIP_2_SAME_RECT_PATH, adjustValues: [16667] },
  snip2DiagRect: { path: SNIP_2_DIAG_RECT_PATH, adjustValues: [16667] },
  ellipse: { path: ELLIPSE_PATH, adjustValues: [] },
  oval: { path: ELLIPSE_PATH, adjustValues: [] },
  circle: { path: ELLIPSE_PATH, adjustValues: [] },
  triangle: { path: [M(0.5, 0), L(1, 1), L(0, 1), Z()], adjustValues: [50000] },
  rtTriangle: { path: [M(0, 0), L(1, 1), L(0, 1), Z()], adjustValues: [50000] },
  diamond: { path: DIAMOND_PATH, adjustValues: [] },
  parallelogram: { path: [M(0.25, 0), L(1, 0), L(0.75, 1), L(0, 1), Z()], adjustValues: [25000] },
  trapezoid: { path: [M(0.25, 0), L(0.75, 0), L(1, 1), L(0, 1), Z()], adjustValues: [25000] },
  pentagon: { path: regularPolygon(5), adjustValues: [] },
  hexagon: { path: regularPolygon(6), adjustValues: [25000] },
  heptagon: { path: regularPolygon(7), adjustValues: [] },
  octagon: { path: regularPolygon(8), adjustValues: [29289] },
  decagon: { path: regularPolygon(10), adjustValues: [] },
  dodecagon: { path: regularPolygon(12), adjustValues: [] },
  star4: star(4),
  star5: star(5),
  star6: star(6),
  star7: star(7),
  star8: star(8),
  star10: star(10),
  star12: star(12),
  star16: star(16),
  star24: star(24),
  star32: star(32),
  donut: { path: [...ELLIPSE_PATH, ...ellipsePath(0.5, 0.5, 0.25, 0.25)], adjustValues: [25000] },
  noSmoking: {
    path: [...ELLIPSE_PATH, ...ellipsePath(0.5, 0.5, 0.375, 0.375), M(0.14645, 0.14645), L(0.85355, 0.85355)],
    adjustValues: [25000],
  },
  blockArc: { path: arcPath(-Math.PI / 4, Math.PI * 1.25, 0.25, true), adjustValues: [10800000, 0, 25000] },
  chord: { path: [...arcPath(-Math.PI / 4, Math.PI * 1.25), L(0.5, 0.5), Z()], adjustValues: [2700000] },
  pie: { path: piePath(-Math.PI / 4, Math.PI * 1.25), adjustValues: [0, 16200000] },
  pieWedge: { path: piePath(-Math.PI / 4, Math.PI * 1.25), adjustValues: [0, 16200000] },
  arc: { path: arcPath(-Math.PI / 4, Math.PI * 1.25), adjustValues: [10800000] },
  teardrop: { path: [M(1, 0.5), C(1, 0.16667, 0.83333, 0, 0.5, 0), C(0.16667, 0, 0, 0.16667, 0, 0.5), C(0, 0.83333, 0.16667, 1, 0.5, 1), C(0.5, 1, 1, 0.83333, 1, 0.5), Z()], adjustValues: [100000] },
  homePlate: { path: arrowLike(1, 0.25), adjustValues: [50000] },
  chevron: { path: arrowLike(2, 0.25), adjustValues: [50000] },
  arrow: { path: arrowLike(2, 0.5), adjustValues: [50000, 50000] },
  leftArrow: { path: [M(0.5, 0), L(1, 0.5), L(0.5, 1), L(0.5, 0.7), L(0, 0.7), L(0, 0.3), L(0.5, 0.3), Z()], adjustValues: [50000, 50000] },
  rightArrow: { path: [M(0.5, 0), L(1, 0.5), L(0.5, 1), L(0.5, 0.7), L(1, 0.7), L(1, 0.3), L(0.5, 0.3), Z()], adjustValues: [50000, 50000] },
  upArrow: { path: [M(0.5, 1), L(0, 0.5), L(0.3, 0.5), L(0.3, 0), L(0.7, 0), L(0.7, 0.5), L(1, 0.5), Z()], adjustValues: [50000, 50000] },
  downArrow: { path: [M(0.5, 0), L(1, 0.5), L(0.7, 0.5), L(0.7, 1), L(0.3, 1), L(0.3, 0.5), L(0, 0.5), Z()], adjustValues: [50000, 50000] },
  leftRightArrow: { path: [M(0.5, 0.25), L(0.25, 0), L(0, 0.25), L(0, 0.4), L(0.35, 0.4), L(0.35, 0.6), L(0, 0.6), L(0, 0.75), L(0.25, 1), L(0.5, 0.75), L(0.75, 1), L(1, 0.75), L(1, 0.6), L(0.65, 0.6), L(0.65, 0.4), L(1, 0.4), L(1, 0.25), L(0.75, 0), Z()], adjustValues: [50000, 50000] },
  upDownArrow: { path: [M(0.25, 0.5), L(0, 0.25), L(0.25, 0), L(0.4, 0), L(0.4, 0.35), L(0.6, 0.35), L(0.6, 0), L(0.75, 0), L(1, 0.25), L(0.75, 0.5), L(0.6, 0.5), L(0.6, 1), L(0.4, 1), L(0.4, 0.6), L(0.25, 0.6), Z()], adjustValues: [50000, 50000] },
  bentArrow: { path: [M(0, 0), L(0.6, 0), L(0.6, 0.35), L(1, 0.35), L(1, 0.8), L(0.75, 1), L(0.75, 0.65), L(0.3, 0.65), L(0.3, 0.3), L(0, 0.3), Z()], adjustValues: [50000] },
  curvedRightArrow: { path: [M(0, 0), L(0.7, 0), C(0.9, 0, 1, 0.1, 1, 0.3), L(1, 0.7), L(0.75, 1), L(0.75, 0.6), C(0.75, 0.45, 0.6, 0.35, 0.3, 0.35), L(0, 0.35), Z()], adjustValues: [50000] },
  curvedUpArrow: { path: [M(0, 0), L(0, 0.7), C(0, 0.9, 0.1, 1, 0.3, 1), L(0.7, 1), L(1, 0.75), L(0.6, 0.75), C(0.45, 0.75, 0.35, 0.6, 0.35, 0.3), L(0.35, 0), Z()], adjustValues: [50000] },
  plus: { path: [M(0.4, 0), L(0.6, 0), L(0.6, 0.4), L(1, 0.4), L(1, 0.6), L(0.6, 0.6), L(0.6, 1), L(0.4, 1), L(0.4, 0.6), L(0, 0.6), L(0, 0.4), L(0.4, 0.4), Z()], adjustValues: [25000] },
  mathPlus: { path: [M(0.4, 0), L(0.6, 0), L(0.6, 0.4), L(1, 0.4), L(1, 0.6), L(0.6, 0.6), L(0.6, 1), L(0.4, 1), L(0.4, 0.6), L(0, 0.6), L(0, 0.4), L(0.4, 0.4), Z()], adjustValues: [25000] },
  frame: { path: [M(0.1, 0), L(0.9, 0), L(1, 0.1), L(1, 0.9), L(0.9, 1), L(0.1, 1), L(0, 0.9), L(0, 0.1), Z(), M(0.25, 0.25), L(0.25, 0.75), L(0.75, 0.75), L(0.75, 0.25), Z()], adjustValues: [12500] },
  halfFrame: { path: [M(0, 0), L(1, 0), L(1, 0.1), L(0.1, 0.1), L(0.1, 0.9), L(1, 0.9), L(1, 1), L(0, 1), Z()], adjustValues: [12500] },
  corner: { path: [M(0, 0), L(0.3, 0), L(0.3, 0.1), L(1, 0.1), L(1, 0.4), L(0.9, 0.4), L(0.9, 1), L(0.6, 1), L(0.6, 0.9), L(0, 0.9), Z()], adjustValues: [16667] },
  diagStripe: { path: [M(0, 0), L(1, 0), L(1, 0.25), L(0.25, 1), L(0, 1), Z()], adjustValues: [50000] },
  bevel: { path: BEVEL_PATH, adjustValues: [25000] },
  plaque: { path: [M(0.1, 0), L(0.9, 0), C(0.95, 0, 1, 0.05, 1, 0.1), L(1, 0.9), C(1, 0.95, 0.95, 1, 0.9, 1), L(0.1, 1), C(0.05, 1, 0, 0.95, 0, 0.9), L(0, 0.1), C(0, 0.05, 0.05, 0, 0.1, 0), Z()], adjustValues: [25000] },
  foldedCorner: { path: [M(0, 0), L(0.7, 0), L(1, 0.3), L(1, 1), L(0, 1), Z(), M(0.7, 0), L(0.7, 0.3), L(1, 0.3)], adjustValues: [33333] },
  cube: { path: [M(0, 0.25), L(0.5, 0), L(1, 0.25), L(1, 0.75), L(0.5, 1), L(0, 0.75), Z(), M(0, 0.25), L(0.5, 0.5), L(1, 0.25), M(0.5, 0.5), L(0.5, 1)], adjustValues: [] },
  can: { path: [M(0, 0.16667), L(0.5, 0), L(1, 0.16667), L(1, 0.83333), L(0.5, 1), L(0, 0.83333), Z(), M(0, 0.16667), C(0.25, 0.33333, 0.75, 0.33333, 1, 0.16667), M(0, 0.83333), C(0.25, 0.66667, 0.75, 0.66667, 1, 0.83333)], adjustValues: [25000] },
  cloud: { path: CLOUD_PATH, adjustValues: [] },
  heart: { path: [M(0.5, 1), C(0.1, 0.7, 0, 0.5, 0, 0.3), C(0, 0.12, 0.14, 0, 0.3, 0), C(0.42, 0, 0.5, 0.12, 0.5, 0.25), C(0.5, 0.12, 0.58, 0, 0.7, 0), C(0.86, 0, 1, 0.12, 1, 0.3), C(1, 0.5, 0.9, 0.7, 0.5, 1), Z()], adjustValues: [] },
  sun: { path: regularPolygon(16, -Math.PI / 2, 1), adjustValues: [] },
  moon: { path: [M(0.7, 0), C(0.35, 0.1, 0.1, 0.4, 0.1, 0.7), C(0.1, 0.9, 0.3, 1, 0.5, 1), C(0.35, 0.85, 0.3, 0.6, 0.4, 0.4), C(0.5, 0.2, 0.6, 0.05, 0.7, 0), Z()], adjustValues: [] },
  lightningBolt: { path: [M(0.6, 0), L(0.2, 0.55), L(0.45, 0.55), L(0.35, 1), L(0.8, 0.4), L(0.55, 0.4), L(0.6, 0), Z()], adjustValues: [] },
  smoke: { path: ELLIPSE_PATH, adjustValues: [] },
  wave: { path: [M(0, 0.6), C(0.1, 0.4, 0.2, 0.4, 0.3, 0.5), C(0.4, 0.6, 0.5, 0.7, 0.6, 0.6), C(0.7, 0.5, 0.8, 0.4, 0.9, 0.5), C(0.95, 0.58, 1, 0.6, 1, 0.6)], adjustValues: [0] },
  doubleWave: { path: [M(0, 0.4), C(0.1, 0.2, 0.2, 0.2, 0.3, 0.3), C(0.4, 0.4, 0.5, 0.5, 0.6, 0.4), C(0.7, 0.3, 0.8, 0.2, 0.9, 0.3), C(0.95, 0.38, 1, 0.4, 1, 0.4), M(0, 0.7), C(0.1, 0.5, 0.2, 0.5, 0.3, 0.6), C(0.4, 0.7, 0.5, 0.8, 0.6, 0.7), C(0.7, 0.6, 0.8, 0.5, 0.9, 0.6), C(0.95, 0.68, 1, 0.7, 1, 0.7)], adjustValues: [0] },
  verticalScroll: { path: [M(0, 0.1), C(0.05, 0, 0.15, 0, 0.2, 0.05), L(0.8, 0.05), C(0.85, 0, 0.95, 0, 1, 0.1), L(1, 0.2), L(0.95, 0.2), L(0.95, 0.8), L(1, 0.8), L(1, 0.9), C(0.95, 1, 0.85, 1, 0.8, 0.95), L(0.2, 0.95), C(0.15, 1, 0.05, 1, 0, 0.9), L(0, 0.8), L(0.05, 0.8), L(0.05, 0.2), L(0, 0.2), Z()], adjustValues: [12500] },
  horizontalScroll: { path: [M(0.1, 0), C(0, 0.05, 0, 0.15, 0.05, 0.2), L(0.05, 0.8), C(0, 0.85, 0, 0.95, 0.1, 1), L(0.2, 1), L(0.2, 0.95), L(0.8, 0.95), L(0.8, 1), L(0.9, 1), C(1, 0.95, 1, 0.85, 0.95, 0.8), L(0.95, 0.2), C(1, 0.15, 1, 0.05, 0.9, 0), L(0.8, 0), L(0.8, 0.05), L(0.2, 0.05), L(0.2, 0), Z()], adjustValues: [12500] },
  ribbon: { path: RIBBON_PATH, adjustValues: [50000] },
  ribbon2: { path: RIBBON_2_PATH, adjustValues: [50000] },
  leftBracket: { path: bracketPath(['top', 'bottom', 'left'], 0.1, 1), adjustValues: [16667] },
  rightBracket: { path: bracketPath(['top', 'bottom', 'right'], 0.1, 1), adjustValues: [16667] },
  leftBrace: { path: bracketPath(['top', 'bottom', 'left'], 0.15, 1), adjustValues: [16667] },
  rightBrace: { path: bracketPath(['top', 'bottom', 'right'], 0.15, 1), adjustValues: [16667] },
  straightConnector1: { path: [M(0, 0), L(1, 0)], adjustValues: [] },
  bentConnector2: { path: [M(0, 0), L(0.5, 0), L(0.5, 1)], adjustValues: [] },
  bentConnector3: { path: [M(0, 0), L(1, 0), L(1, 1)], adjustValues: [] },
  bentConnector4: { path: [M(0, 0), L(0.5, 0), L(1, 0.5), L(1, 1)], adjustValues: [25000] },
  bentConnector5: { path: [M(0, 0), L(0.25, 0), L(0.25, 0.5), L(0.75, 0.5), L(0.75, 1), L(1, 1)], adjustValues: [25000] },
  curvedConnector2: { path: [M(0, 0), C(0.5, 0, 0.5, 1, 1, 1)], adjustValues: [50000] },
  curvedConnector3: { path: [M(0, 0), C(0.25, 0, 0.25, 1, 0.5, 1), L(1, 1)], adjustValues: [25000] },
  curvedConnector4: { path: [M(0, 0), C(0.5, 0, 0.5, 1, 1, 1)], adjustValues: [25000] },
  curvedConnector5: { path: [M(0, 0), L(0.25, 0), C(0.5, 0, 0.5, 1, 0.75, 1), L(1, 1)], adjustValues: [25000] },
  wedgeRectCallout: { path: [M(0, 0), L(1, 0), L(1, 0.7), L(0.4, 0.7), L(0.4, 1), L(0, 0.85), Z()], adjustValues: [-20833, 62500] },
  wedgeRoundRectCallout: { path: [M(0.16667, 0), L(0.83333, 0), L(1, 0.16667), L(1, 0.83333), L(0.83333, 1), L(0.4, 1), L(0, 0.85), L(0, 0.16667), Z()], adjustValues: [-20833, 62500] },
  wedgeEllipseCallout: { path: [M(0, 0.5), C(0, 0.2, 0.2, 0, 0.5, 0), C(0.8, 0, 1, 0.2, 1, 0.5), C(1, 0.8, 0.8, 1, 0.5, 1), L(0.4, 1), L(0, 0.85), Z()], adjustValues: [-20833, 62500] },
  cloudCallout: { path: CLOUD_PATH, adjustValues: [20833, 62500] },
  round1RectCallout: { path: ROUND_1_RECT_PATH, adjustValues: [-20833, 62500] },
  round2SameRectCallout: { path: ROUND_2_SAME_RECT_PATH, adjustValues: [16667, -20833, 62500] },
  round2DiagRectCallout: { path: ROUND_2_DIAG_RECT_PATH, adjustValues: [16667, -20833, 62500] },
  snip1RectCallout: { path: SNIP_1_RECT_PATH, adjustValues: [-20833, 62500] },
  snip2SameRectCallout: { path: SNIP_2_SAME_RECT_PATH, adjustValues: [16667, -20833, 62500] },
  snip2DiagRectCallout: { path: SNIP_2_DIAG_RECT_PATH, adjustValues: [16667, -20833, 62500] },
  irregularSeal1: { path: starPath(11, 0.82), adjustValues: [11730901] },
  irregularSeal2: { path: starPath(7, 0.8), adjustValues: [10257253] },
  flowChartProcess: { path: RECT_PATH, adjustValues: [] },
  flowChartAlternateProcess: { path: ROUND_RECT_PATH, adjustValues: [100000] },
  flowChartDecision: { path: DIAMOND_PATH, adjustValues: [] },
  flowChartTerminator: { path: [M(0.15, 0), L(0.85, 0), C(0.925, 0, 0.85, 1, 0.85, 1), L(0.15, 1), C(0.1, 1, 0.15, 0, 0.15, 0), Z()], adjustValues: [50000] },
  flowChartProgram: { path: [M(0.1, 0), L(0.9, 0), L(1, 0.25), L(1, 0.75), L(0.9, 1), L(0.1, 1), L(0, 0.75), L(0, 0.25), Z()], adjustValues: [] },
  flowChartPunchedCard: { path: [M(0.1, 0), L(1, 0), L(1, 0.85), L(0, 0.85), L(0, 0.15), Z(), M(0.1, 0.85), L(0.1, 1), L(0.9, 1), L(0.9, 0.85)], adjustValues: [] },
  flowChartManualInput: { path: [M(0, 0.16667), L(0.9, 0), L(1, 0.83333), L(0.1, 1), Z()], adjustValues: [] },
  flowChartDocument: { path: [M(0, 0), L(0.75, 0), L(1, 0.25), L(1, 0.9), C(0.9, 1, 0.85, 0.9, 0.75, 0.9), L(0, 0.9), C(0.1, 0.8, 0.1, 0.7, 0, 0.6), Z()], adjustValues: [] },
  flowChartMultidocument: { path: [M(0, 0.15), L(0.75, 0.15), L(0.9, 0.3), L(0.9, 0.55), L(1, 0.65), L(1, 0.9), C(0.95, 1, 0.9, 0.9, 0.85, 0.9), L(0.1, 0.9), C(0.05, 0.9, 0, 0.85, 0, 0.8), L(0, 0.2), Z(), M(0.1, 0), L(0.8, 0), L(0.8, 0.1), L(0.1, 0.1), Z()], adjustValues: [] },
  flowChartInternalStorage: { path: [M(0, 0), L(1, 0), L(1, 1), L(0, 1), Z(), M(0, 0.15), L(0.2, 0.15), L(0.2, 0.4), L(0, 0.4), Z(), M(0, 0.6), L(0.2, 0.6), L(0.2, 0.85), L(0, 0.85), Z()], adjustValues: [] },
  flowChartMagneticDrum: { path: [M(0, 0.25), C(0, 0.05, 0.3, 0, 0.5, 0), C(0.7, 0, 1, 0.05, 1, 0.25), L(1, 0.75), C(1, 0.95, 0.7, 1, 0.5, 1), C(0.3, 1, 0, 0.95, 0, 0.75), Z(), M(0, 0.25), C(0, 0.45, 0.3, 0.5, 0.5, 0.5), C(0.7, 0.5, 1, 0.45, 1, 0.25), M(0, 0.75), C(0, 0.95, 0.3, 1, 0.5, 1), C(0.7, 1, 1, 0.95, 1, 0.75)], adjustValues: [] },
  flowChartDirectAccessStorage: { path: [M(0, 0.25), C(0, 0.05, 0.3, 0, 0.5, 0), C(0.7, 0, 1, 0.05, 1, 0.25), L(1, 0.75), C(1, 0.95, 0.7, 1, 0.5, 1), C(0.3, 1, 0, 0.95, 0, 0.75), Z(), M(0.05, 0.9), L(0.45, 0.15)], adjustValues: [] },
  flowChartPreparation: { path: [M(0.5, 1), L(0.15, 0.5), L(0.85, 0.5), Z(), M(0.15, 0.35), L(0.85, 0.35), L(0.85, 0.15), L(0.15, 0.15), Z()], adjustValues: [] },
  flowChartManualOperation: { path: [M(0, 0.25), L(0.7, 0.25), L(0.85, 0), L(1, 0.25), L(0.85, 0.5), L(0.85, 1), L(0, 1), Z()], adjustValues: [] },
  flowChartConnector: { path: ELLIPSE_PATH, adjustValues: [] },
  flowChartOffpageConnector: { path: [M(0, 0.5), C(0, 0.2, 0.2, 0, 0.5, 0), C(0.8, 0, 1, 0.2, 1, 0.5), C(1, 0.8, 0.8, 1, 0.5, 1), C(0.2, 1, 0, 0.8, 0, 0.5), Z()], adjustValues: [] },
  flowChartCard: { path: [M(0, 0.16667), L(0.5, 0), L(1, 0.16667), L(1, 0.83333), L(0.5, 1), L(0, 0.83333), Z()], adjustValues: [] },
  flowChartPunchedTape: { path: [M(0, 0.33333), L(1, 0.33333), L(1, 0.66667), L(0, 0.66667), Z(), M(0.1, 0.4), L(0.15, 0.4), L(0.15, 0.6), L(0.1, 0.6), Z(), M(0.3, 0.4), L(0.35, 0.4), L(0.35, 0.6), L(0.3, 0.6), Z()], adjustValues: [] },
  flowChartSummingJunction: { path: [M(0, 0), L(1, 0), L(1, 1), L(0, 1), Z(), M(0, 0.3), L(0.2, 0.3), L(0.2, 0.5), L(0, 0.5), Z(), M(0, 0.7), L(0.2, 0.7), L(0.2, 0.9), L(0, 0.9), Z()], adjustValues: [] },
  flowChartOr: { path: [M(0, 0.5), C(0, 0.2, 0.2, 0, 0.5, 0), L(1, 0), L(1, 1), L(0.5, 1), C(0.2, 1, 0, 0.8, 0, 0.5), Z()], adjustValues: [] },
  flowChartCollate: { path: [M(0, 0), L(0.3, 0), L(0.3, 1), L(0, 1), Z(), M(0.3, 0), L(0.7, 0), L(0.7, 1), L(0.3, 1), Z(), M(0.7, 0), L(1, 0), L(1, 1), L(0.7, 1), Z()], adjustValues: [] },
  flowChartSort: { path: [M(0.5, 0), L(1, 0.5), L(0.75, 0.5), L(0.75, 1), L(0.25, 1), L(0.25, 0.5), L(0, 0.5), Z()], adjustValues: [] },
  flowChartExtract: { path: [M(0, 0), L(1, 0), L(1, 1), L(0, 1), Z(), M(0.7, 0.2), L(0.7, 0.7), L(0.1, 0.7), L(0.1, 0.2), Z(), M(0.3, 0.4), L(0.9, 0.4), L(0.9, 0.7), L(0.3, 0.7), Z()], adjustValues: [] },
  flowChartMerge: { path: [M(0, 0), L(1, 0), L(1, 1), L(0, 1), Z(), M(0.1, 0.2), L(0.5, 0.2), L(0.5, 0.7), L(0.1, 0.7), Z(), M(0.5, 0.2), L(0.9, 0.2), L(0.9, 0.7), L(0.5, 0.7), Z(), M(0.3, 0.4), L(0.7, 0.4), L(0.7, 0.7), L(0.3, 0.7), Z()], adjustValues: [] },
  flowChartStoredData: { path: [M(0, 0), C(0.15, 0.08, 0.85, 0.08, 1, 0), L(1, 1), C(0.85, 0.92, 0.15, 0.92, 0, 1), Z()], adjustValues: [] },
  flowChartDelay: { path: [M(0, 0.5), L(0.25, 0), L(0.75, 0), L(1, 0.5), L(0.75, 1), L(0.25, 1), Z()], adjustValues: [] },
  actionButtonBlank: { path: ROUND_RECT_PATH, adjustValues: [25000] },
  actionButtonHelp: { path: ROUND_RECT_PATH, adjustValues: [25000] },
  actionButtonInformation: { path: ROUND_RECT_PATH, adjustValues: [25000] },
  roundRectDiag: { path: ROUND_2_DIAG_RECT_PATH, adjustValues: [16667] },
  wedgeEllipse: { path: ELLIPSE_PATH, adjustValues: [] },
  leftRightCircularArrow: { path: [M(0.5, 1), C(0.1, 0.9, 0, 0.6, 0.1, 0.3), L(0, 0.3), L(0.25, 0.05), L(0.25, 0.3), L(0.15, 0.3), C(0.05, 0.5, 0.1, 0.75, 0.5, 0.85), L(0.5, 1), Z(), M(0.5, 0), C(0.9, 0.1, 1, 0.4, 0.9, 0.7), L(1, 0.7), L(0.75, 0.95), L(0.75, 0.7), L(0.85, 0.7), C(0.95, 0.5, 0.9, 0.25, 0.5, 0.15), Z()], adjustValues: [] },
  mathDivide: { path: [M(0, 0.35), L(1, 0.35), L(1, 0.5), L(0, 0.5), Z(), M(0, 0.85), L(1, 0.85), L(1, 1), L(0, 1), Z(), M(0.4, 0.55), L(0.6, 0.55), L(0.6, 0.8), L(0.4, 0.8), Z()], adjustValues: [] },
  mathMultiply: { path: [M(0, 0.85), L(0.15, 1), L(0.5, 0.65), L(0.85, 1), L(1, 0.85), L(0.65, 0.5), L(1, 0.15), L(0.85, 0), L(0.5, 0.35), L(0.15, 0), L(0, 0.15), L(0.35, 0.5), Z()], adjustValues: [] },
  mathNotEqual: { path: [M(0, 0.85), L(1, 0.85), L(1, 1), L(0, 1), Z(), M(0, 0.35), L(1, 0.35), L(1, 0.5), L(0, 0.5), Z(), M(0.85, 0), L(1, 0.15), L(0.15, 1), L(0, 0.85), Z()], adjustValues: [] },
  mathMin: { path: [M(0, 0.85), L(1, 0.85), L(1, 1), L(0, 1), Z(), M(0.4, 0), L(0.6, 0), L(0.6, 0.85), L(0.4, 0.85), Z()], adjustValues: [] },
  bevel2: { path: BEVEL_PATH, adjustValues: [25000] },
  ribbon3: { path: RIBBON_2_PATH, adjustValues: [50000] },
  ellipseRibbon: { path: RIBBON_PATH, adjustValues: [50000] },
  ellipseRibbon2: { path: RIBBON_2_PATH, adjustValues: [50000] },
}

export type PresetName = keyof typeof PRESETS

/** The preset table, for callers that want to enumerate supported shapes. */
export function presetGeometry(name: string | null | undefined): PresetGeometry | null {
  if (!name) return null
  return PRESETS[name] ?? null
}

export function presetNames(): string[] {
  return Object.keys(PRESETS)
}

function samePath(a: GeometryPath, b: GeometryPath): boolean {
  if (a.length !== b.length) return false
  return a.every((command, i) => JSON.stringify(command) === JSON.stringify(b[i]))
}

/**
 * Whether a path in the unit box is just the unit box.
 *
 * Tested on the path rather than on a preset name so every alias of the
 * rectangle — `rect`, `rectangle`, `square`, `flowChartProcess` — is covered
 * without a name list to keep in step.
 */
export function isUnitBoxPath(path: GeometryPath): boolean {
  return samePath(path, RECT_PATH)
}

/**
 * The `adj` values authored on a shape, normalised to 1000ths of a percent and
 * paired with the preset's declared positions. PowerPoint writes `adj` sparsely
 * (only the ones the user moved), so the two lists are merged here rather than
 * being read positionally at each use site.
 */
export function resolveAdjustValues(preset: PresetGeometry | null, authored: readonly number[]): readonly number[] {
  const declared = preset?.adjustValues ?? []
  if (authored.length === 0) return declared
  // PowerPoint writes only the adjustments the user moved, so authored values
  // are merged positionally over the preset defaults.
  const merged = [...declared]
  for (let index = 0; index < authored.length; index += 1) merged[index] = authored[index]
  return merged
}

const ONE_HUNDRED_THOUSAND = 100000
const normalize = (value: number | undefined, fallback: number): number => {
  if (value === undefined || !Number.isFinite(value)) return fallback
  // PowerPoint occasionally emits `val="-1"` for "unset".
  if (value < 0) return fallback
  return Math.min(ONE_HUNDRED_THOUSAND, value) / ONE_HUNDRED_THOUSAND
}

/**
 * Parse `a:custGeom` (and the equivalent inside SmartArt and Word drawings).
 * The path is expressed in the shape's *own* coordinate space — the guide
 * `w`/`h` from `a:path`, not normalised — so it is divided by the path
 * dimensions to land in the same unit box as the presets.
 */
export function parseCustomGeometry(custGeom: Element | null | undefined): CustomGeometry | null {
  if (!custGeom) return null
  const pathLst = childOf(custGeom, 'pathLst')
  if (!pathLst) return null

  const guides: Record<string, number> = {}
  const adjustValues: number[] = []
  for (const gd of childrenOf(childOf(custGeom, 'avLst'), 'gd')) {
    const name = gd.getAttribute('name')
    if (!name) continue
    guides[name] = parseFormula(gd.getAttribute('fmla')) ?? 0
  }
  for (const gd of childrenOf(childOf(custGeom, 'gdLst'), 'gd')) {
    const name = gd.getAttribute('name')
    if (!name) continue
    guides[name] = parseFormula(gd.getAttribute('fmla')) ?? 0
  }

  const paths: GeometryPath[] = []
  for (const path of childrenOf(pathLst, 'path')) {
    const width = attrNumber(path, 'w') ?? 0
    const height = attrNumber(path, 'h') ?? 0
    const sx = width === 0 ? 1 : 1 / width
    const sy = height === 0 ? 1 : 1 / height
    const commands: PathCommand[] = []
    const px = (x: number): number => x * sx
    const py = (y: number): number => y * sy
    for (const node of childrenOf(path)) {
      switch (node.localName) {
        case 'moveTo': {
          const pt = childOf(node, 'pt')
          commands.push(M(px(Number(attrNumber(pt, 'x') ?? 0)), py(Number(attrNumber(pt, 'y') ?? 0))))
          break
        }
        case 'lnTo': {
          const pt = childOf(node, 'pt')
          commands.push(L(px(Number(attrNumber(pt, 'x') ?? 0)), py(Number(attrNumber(pt, 'y') ?? 0))))
          break
        }
        case 'cubicBezTo': {
          const pts = childrenOf(node, 'pt')
          commands.push(
            C(
              px(Number(attrNumber(pts[0], 'x') ?? 0)),
              py(Number(attrNumber(pts[0], 'y') ?? 0)),
              px(Number(attrNumber(pts[1], 'x') ?? 0)),
              py(Number(attrNumber(pts[1], 'y') ?? 0)),
              px(Number(attrNumber(pts[2], 'x') ?? 0)),
              py(Number(attrNumber(pts[2], 'y') ?? 0)),
            )
          )
          break
        }
        case 'quadBezTo': {
          const pts = childrenOf(node, 'pt')
          // Elevate the quadratic control point to cubic form.
          const qx = Number(attrNumber(pts[0], 'x') ?? 0)
          const qy = Number(attrNumber(pts[0], 'y') ?? 0)
          const ex = Number(attrNumber(pts[1], 'x') ?? 0)
          const ey = Number(attrNumber(pts[1], 'y') ?? 0)
          const start = lastPoint(commands) ?? P(0, 0)
          const c1x = start.x + (2 / 3) * (px(qx) - start.x)
          const c1y = start.y + (2 / 3) * (py(qy) - start.y)
          const c2x = px(ex) + (2 / 3) * (px(qx) - px(ex))
          const c2y = py(ey) + (2 / 3) * (py(qy) - py(ey))
          commands.push(C(c1x, c1y, c2x, c2y, px(ex), py(ey)))
          break
        }
        case 'arcTo': {
          const wr = Number(attrNumber(node, 'wR') ?? 0)
          const hr = Number(attrNumber(node, 'hR') ?? 0)
          const stAng = Number(attrNumber(node, 'stAng') ?? 0) / ONE_HUNDRED_THOUSAND
          const swAng = Number(attrNumber(node, 'swAng') ?? 0) / ONE_HUNDRED_THOUSAND
          const start = lastPoint(commands) ?? P(0, 0)
          commands.push({
            kind: 'arc',
            to: P(start.x + Math.cos(stAng + swAng) * (px(wr) * 2), start.y + Math.sin(stAng + swAng) * (py(hr) * 2)),
            rx: px(wr) * 2,
            ry: py(hr) * 2,
            largeArc: Math.abs(swAng) > Math.PI,
            sweep: swAng >= 0,
          })
          break
        }
        case 'close':
          commands.push(Z())
          break
        default:
          break
      }
    }
    if (commands.length > 0) paths.push(commands)
  }

  // `a:avLst` on a custom geometry holds real adjustments the path may not use;
  // they are kept so the layout stage can apply them if it ever supports it.
  for (const value of Object.values(guides)) {
    if (Number.isFinite(value)) adjustValues.push(normalize(value, 0))
  }

  return paths.length > 0 ? { paths, adjustValues, guides } : null
}

function lastPoint(commands: readonly PathCommand[]): Point | null {
  for (let i = commands.length - 1; i >= 0; i -= 1) {
    const command = commands[i]
    if (command.kind === 'move' || command.kind === 'line' || command.kind === 'curve' || command.kind === 'arc') {
      return command.to
    }
  }
  return null
}

/**
 * An `a:gd` formula: `val 50000`, a product or quotient written as
 * `ASTERISK-SLASH 50000 100000`, or a sum/difference. Returned in the same
 * 1000ths-of-a-percent space the attribute used.
 */
function parseFormula(formula: string | null | undefined): number | null {
  if (!formula) return null
  const match = /^\s*(\S+)\s+(-?[0-9.]+(?:e[+-]?[0-9]+)?)\s+(-?[0-9.]+(?:e[+-]?[0-9]+)?)\s*$/i.exec(formula)
  if (!match) {
    const val = /^\s*val\s+(-?[0-9.]+)\s*$/i.exec(formula)
    return val ? Number(val[1]) : null
  }
  const left = Number(match[2])
  const right = Number(match[3])
  if (!Number.isFinite(left) || !Number.isFinite(right)) return null
  switch (match[1]) {
    case 'val':
      return left
    case '+':
      return left + right
    case '-':
      return left - right
    case '*':
      return (left / 100000) * right
    case '/':
      return right === 0 ? null : (left / right) * 100000
    case '?':
      return left
    default:
      return null
  }
}

/**
 * The tight bounds of a unit-box path, in unit coordinates. Used to detect
 * degenerate geometry and to size SVG view boxes for open (unclosed) paths.
 */
export function unitPathBounds(path: GeometryPath): { min: Point; max: Point } {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  const include = (point: Point): void => {
    if (point.x < minX) minX = point.x
    if (point.y < minY) minY = point.y
    if (point.x > maxX) maxX = point.x
    if (point.y > maxY) maxY = point.y
  }
  for (const command of path) {
    switch (command.kind) {
      case 'move':
      case 'line':
        include(command.to)
        break
      case 'curve':
        include(command.c1)
        include(command.c2)
        include(command.to)
        break
      case 'arc':
        include(command.to)
        break
      case 'close':
        break
    }
  }
  if (minX === Infinity) return { min: P(0, 0), max: P(1, 1) }
  return { min: P(minX, minY), max: P(maxX, maxY) }
}

/**
 * Scale a unit-box path into a shape of the given size. Non-uniform shapes
 * (a wide arrow) are the normal case, and this is the only place the unit box
 * is expanded, so the presets stay resolution- and size-independent.
 */
export function scalePath(path: GeometryPath, size: Size, offset: Point = P(0, 0)): GeometryPath {
  const scalePoint = (point: Point): Point => ({
    x: offset.x + point.x * size.width,
    y: offset.y + point.y * size.height,
  })
  return path.map((command) => {
    switch (command.kind) {
      case 'move':
      case 'line':
        return { ...command, to: scalePoint(command.to) }
      case 'curve':
        return { ...command, c1: scalePoint(command.c1), c2: scalePoint(command.c2), to: scalePoint(command.to) }
      case 'arc':
        return { ...command, to: scalePoint(command.to), rx: command.rx * size.width, ry: command.ry * size.height }
      case 'close':
        return command
    }
  })
}

/** {@link normalize} under the name the layout stage uses. */
export { normalize as normalizeAdjustValue, ellipsePath }
