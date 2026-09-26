/**
 * Bridging the resolved DrawingML model to CSS and SVG presentation attributes.
 *
 * The parser produces absolute, resolved values — final colours, points, EMU
 * converted — so this module never resolves inheritance. Its only job is
 * deciding which CSS property expresses each Office construct, and falling back
 * to the closest visual match when CSS has no equivalent.
 *
 * Effects are expressed as `filter`/`drop-shadow` on SVG shapes rather than
 * `box-shadow`, because a CSS box shadow on SVG content is drawn from the
 * element's bounding box and would be a rounded rectangle instead of the path's
 * own silhouette. HTML shapes use `box-shadow` there, since it is cheaper.
 */

import { colorToCss, type OfficeColor } from '../../ooxml/color.js'
import type { BlipFill, ShapeFill, ShapeLine } from '../../ooxml/drawingml.js'
import type { ShadowEffect } from '../../ooxml/theme.js'
import type { StyleMap } from './dom.js'

/** Resolves a blip to a paint source, or `null` while the image is not ready. */
export type ImageResolver = (blip: BlipFill) => string | null

const DASH_PATTERNS: Readonly<Record<string, string>> = {
  dot: '1 3',
  dash: '6 4',
  lgDash: '12 6',
  dashDot: '6 3 1 3',
  lgDashDot: '12 4 1 4',
  lgDashDotDot: '12 4 1 4 1 4',
  sysDash: '3 3',
  sysDot: '1 3',
  sysDashDot: '3 3 1 3',
  sysDashDotDot: '3 3 1 3 1 3',
}

const CAP_STYLES: Readonly<Record<string, string>> = { flat: 'butt', square: 'square', round: 'round' }

/**
 * `stroke-dasharray` for a dash preset.
 *
 * The pattern is authored in points, and the values are scaled by the line
 * weight because Office's preset ratios are defined relative to `w` — a dashed
 * 4pt line has proportionally longer dashes than a dashed 0.75pt one.
 */
function dashArray(dash: string, widthPt: number): string | null {
  const pattern = DASH_PATTERNS[dash]
  if (pattern === undefined) return null
  const factor = widthPt > 0 ? widthPt : 1
  return pattern
    .split(' ')
    .map((part) => (Math.round(Number(part) * factor * 100) / 100).toString())
    .join(' ')
}

function isVisible(line: ShapeLine): boolean {
  return line.fill.type !== 'none' && line.widthPt > 0
}

function lineColor(line: ShapeLine): string {
  return line.fill.type === 'solid' ? colorToCss(line.fill.color) : 'none'
}

export interface FillPaint {
  /** A `background` shorthand, or `null` when CSS cannot express the fill. */
  readonly background: string | null
  /** A `background-size` value paired with the `background` above. */
  readonly backgroundSize: string | null
}

/**
 * CSS paint for a shape fill.
 *
 * `a:stretch` maps to `cover`/`no-repeat` and its absence to `auto`/`repeat`,
 * which is the same distinction `background-size`/`background-repeat` already
 * draw. `pattern` and `group` fills have no CSS equivalent and return `null` so
 * the caller can fall back to the theme's shape style rather than paint
 * something wrong.
 */
export function fillPaint(fill: ShapeFill, images: ImageResolver): FillPaint {
  switch (fill.type) {
    case 'solid':
      return { background: colorToCss(fill.color), backgroundSize: null }
    case 'gradient': {
      if (fill.stops.length === 0) return { background: null, backgroundSize: null }
      const parts = fill.stops.map(
        (stop) => `${colorToCss(stop.color)} ${Math.round(stop.position * 100)}%`
      )
      return { background: `linear-gradient(${Math.round(fill.angle)}deg, ${parts.join(', ')})`, backgroundSize: null }
    }
    case 'picture': {
      const url = images(fill.blip)
      if (!url) return { background: null, backgroundSize: null }
      return {
        background: `url("${url}")`,
        backgroundSize: fill.blip.stretch ? 'cover' : 'auto',
      }
    }
    default:
      return { background: null, backgroundSize: null }
  }
}

/**
 * DrawingML positions a shadow by distance and direction rather than by an
 * offset, and direction is measured clockwise from east in 60000ths of a
 * degree. CSS wants an x/y pair, so the polar pair is projected here — once, at
 * paint time, so the model stays in the authoring's own units.
 */
function shadowOffset(shadow: ShadowEffect): { x: number; y: number } {
  const radians = (shadow.direction * Math.PI) / 180
  return {
    x: round2(shadow.distancePt * Math.cos(radians)),
    y: round2(shadow.distancePt * Math.sin(radians)),
  }
}

const round2 = (value: number): number => Math.round(value * 100) / 100

function outerShadow(shadow: ShadowEffect): string | null {
  if (shadow.kind !== 'outer') return null
  const { x, y } = shadowOffset(shadow)
  const blur = Math.max(0, round2(shadow.blurPt))
  return `${x}px ${y}px ${blur}px 0px ${colorToCss(shadow.color)}`
}

function innerShadow(shadow: ShadowEffect): string | null {
  if (shadow.kind !== 'inner') return null
  const { x, y } = shadowOffset(shadow)
  const blur = Math.max(0, round2(shadow.blurPt))
  return `inset ${x}px ${y}px ${blur}px 0px ${colorToCss(shadow.color)}`
}

export interface EffectPaint {
  readonly filters: string[]
  readonly boxShadow: string | null
}

/**
 * CSS for a shape's effects.
 *
 * Only the first shadow of each kind is reproduced: CSS cannot stack several
 * same-kind shadows without them merging, and a merged shadow looks worse than
 * a missing one. Glow becomes a `drop-shadow` of the shape's own alpha, so it
 * follows an SVG path or a glyph identically.
 */
export function effectPaint(
  effects: { readonly shadows: readonly ShadowEffect[]; readonly glows: readonly { readonly color: OfficeColor; readonly radiusPt: number }[] },
  isSvg: boolean
): EffectPaint {
  const filters: string[] = []
  const boxShadows: string[] = []

  for (const glow of effects.glows) {
    const radius = Math.max(0, Math.round(glow.radiusPt * 100) / 100)
    filters.push(`drop-shadow(0 0 ${radius}px ${colorToCss(glow.color)})`)
  }

  for (const shadow of effects.shadows) {
    const outer = outerShadow(shadow)
    if (outer !== null) {
      if (isSvg) filters.push(`drop-shadow(${outer})`)
      else boxShadows.push(outer)
      continue
    }
    const inner = innerShadow(shadow)
    if (inner !== null) {
      // `inset` shadows need a filled box, so an SVG path cannot carry them
      // without a filter primitive chain that costs more than the effect shows.
      if (!isSvg) {
        boxShadows.push(inner)
        continue
      }
      const { x, y } = shadowOffset(shadow)
      filters.push(`drop-shadow(${x}px ${y}px ${shadow.blurPt}px ${colorToCss(shadow.color)})`)
    }
  }

  return { filters, boxShadow: boxShadows.length > 0 ? boxShadows.join(', ') : null }
}

/**
 * Border shorthand for an HTML shape's outline.
 *
 * CSS has no per-side line cap, so a rounded or squared cap on an HTML shape is
 * drawn butt-capped. Shapes that need a visible cap (connectors especially) go
 * through {@link lineSvgAttributes} instead, where it is expressible.
 */
export function lineStyles(line: ShapeLine): StyleMap {
  if (!isVisible(line) || line.fill.type !== 'solid') return { border: 'none' }
  const width = Math.max(0.5, line.widthPt)
  const dash = dashArray(line.dash, width)
  const style: StyleMap = {
    borderStyle: dash ? 'dashed' : line.compound === 'double' ? 'double' : 'solid',
    borderWidth: line.compound === 'single' ? width : width * 2,
    borderColor: lineColor(line),
  }
  return style
}

/** SVG `stroke` presentation attributes for a connector or a custom path. */
export function lineSvgAttributes(line: ShapeLine): StyleMap {
  if (!isVisible(line)) return { stroke: 'none', fill: 'none' }
  const width = Math.max(0.5, line.widthPt)
  const attributes: StyleMap = {
    stroke: lineColor(line),
    'stroke-width': width,
    'stroke-linecap': CAP_STYLES[line.cap] ?? 'butt',
    'stroke-linejoin': 'miter',
    'stroke-miterlimit': 4,
    fill: 'none',
  }
  const dash = dashArray(line.dash, width)
  if (dash) attributes['stroke-dasharray'] = dash
  return attributes
}
