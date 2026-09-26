/**
 * Turning resolved DrawingML geometry into SVG path data.
 *
 * Preset and custom geometry are stored in the unit box (0..100000 on both
 * axes), so a shape is drawn by scaling its path into its own extent rather than
 * by nesting a transform per shape. That keeps one coordinate space per element
 * and means stroke widths stay in points, unaffected by the path's scale.
 *
 * The unit box maps to the shape's width and height independently, so a
 * non-square shape gets a non-uniform scale — which is what Office does, and
 * why a preset "ellipse" in a 4:1 box is the same ellipse the author saw.
 */

import { ellipsePath, scalePath } from '../../ooxml/geometry.js'
import type { GeometryPath, PathCommand } from '../../ooxml/geometry.js'
import type { ShapeGeometry } from '../../ooxml/drawingml.js'
import type { Rect, Size } from '../../ooxml/geom.js'

const n = (value: number): string => {
  const rounded = Math.round(value * 100) / 100
  return String(rounded === 0 ? 0 : rounded)
}

/** Path commands to SVG `d`, with curves kept as curves rather than flattened. */
export function pathData(path: GeometryPath): string {
  const out: string[] = []
  for (const command of path) {
    switch (command.kind) {
      case 'move':
        out.push(`M${n(command.to.x)} ${n(command.to.y)}`)
        break
      case 'line':
        out.push(`L${n(command.to.x)} ${n(command.to.y)}`)
        break
      case 'curve':
        out.push(
          `C${n(command.c1.x)} ${n(command.c1.y)} ${n(command.c2.x)} ${n(command.c2.y)} ${n(command.to.x)} ${n(command.to.y)}`
        )
        break
      case 'arc':
        // DrawingML's flattened arc carries radii in the same unit box as its
        // endpoints, so it scales with the path and needs no extra correction.
        out.push(
          `A${n(command.rx)} ${n(command.ry)} 0 ${command.largeArc ? 1 : 0} ${command.sweep ? 1 : 0} ${n(command.to.x)} ${n(command.to.y)}`
        )
        break
      case 'close':
        out.push('Z')
        break
    }
  }
  return out.join(' ')
}

/** The outline of `geometry` in a `size` box at `offset`, or `null` if it has none. */
export function outlinePath(geometry: ShapeGeometry | null, size: Size, offset: { x: number; y: number }): GeometryPath | null {
  if (!geometry || geometry.kind === 'none') return null
  const path =
    geometry.kind === 'custom'
      ? geometry.custom.paths[0] ?? null
      : geometry.preset.path
  if (!path || path.length === 0) return null
  return scalePath(path, size, offset)
}

/** Path data for a custom geometry's first sub-path; later sub-paths are dropped. */
export function customPathData(geometry: ShapeGeometry, size: Size): string | null {
  const path = outlinePath(geometry, size, { x: 0, y: 0 })
  return path ? pathData(path) : null
}

/**
 * The unit-box ellipse, for a geometry CSS can express on its own.
 *
 * Returning `null` for everything else is deliberate: CSS `border-radius` only
 * reproduces rounded rectangles, and using it for a preset like `round2SameRect`
 * would silently draw the wrong shape. Presets with a known CSS equivalent are
 * listed explicitly.
 */
export function cssBorderRadius(name: string, adjust: readonly number[]): string | null {
  const first = adjust.length > 0 ? adjust[0] ?? 0 : 0
  // Adjust values are 0..100000 fractions of half the shorter side.
  const percent = Math.min(50, (first / 100000) * 100 * (first <= 50000 ? 1 : 0))
  switch (name) {
    case 'rect':
    case 'flowChartProcess':
    case 'roundRect':
    case 'round1Rect':
    case 'round2SameRect':
    case 'round2DiagRect':
    case 'snip1Rect':
    case 'snip2SameRect':
    case 'plaque':
      return `${percent}%`
    default:
      return null
  }
}

/** An ellipse path filling a `size` box, used when a shape has no geometry. */
export function ellipseIn(size: Size): GeometryPath {
  return scalePath(ellipsePath(), size)
}

/**
 * Connector endpoints.
 *
 * A straight connector's `p:cxnSp` carries an explicit extent, and flips are how
 * the author says "right to left", so the flip has to be applied to the endpoints
 * rather than to a transform — CSS has no `flipH`.
 */
export function connectorEndpoints(rect: Rect, flipH: boolean, flipV: boolean): { x1: number; y1: number; x2: number; y2: number } {
  const left = flipH ? rect.x + rect.width : rect.x
  const right = flipH ? rect.x : rect.x + rect.width
  const top = flipV ? rect.y + rect.height : rect.y
  const bottom = flipV ? rect.y : rect.y + rect.height
  return { x1: left, y1: top, x2: right, y2: bottom }
}

export type { PathCommand }
