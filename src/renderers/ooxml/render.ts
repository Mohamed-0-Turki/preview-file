/**
 * Painting a slide.
 *
 * The walker turns a resolved {@link PptxSlide} into DOM. Three rules shape the
 * output:
 *
 * - **One coordinate space, unscaled.** Every shape is placed in the slide's
 *   point space with `transform: translate(...)`, and nothing is scaled to fit.
 *   The stage is scaled once, at the end, by the caller — which is what keeps a
 *   10pt label 10pt at every zoom level.
 * - **A group is a matrix, not a box.** A group's `chOff`/`chExt` maps its
 *   children's coordinates onto the slide, so the group element covers the whole
 *   slide from the origin and carries that matrix. Children then keep their
 *   authored coordinates verbatim.
 * - **SVG only where CSS cannot express the shape.** Preset and custom
 *   geometry, connectors and charts go to SVG; a plain rectangle stays a `div`,
 *   because a `div` costs one element where an SVG costs a subtree.
 */

import {
  childSpaceMatrix,
  isBoundingBoxShape,
  isIdentity,
  type BlipFill,
  type PptxBackground,
  type PptxShape,
  type PptxSlide,
  type Transform2D,
} from '../../ooxml/index.js'
import { el, setStyle, svg, type StyleMap } from './dom.js'
import { buildChart } from './chart.js'
import { buildTable } from './table.js'
import { buildText } from './text.js'
import { effectPaint, fillPaint, lineStyles, lineSvgAttributes, type ImageResolver } from './paint.js'
import { connectorEndpoints, outlinePath, pathData } from './path.js'

/** Resolves a relationship in `part` to a URL, or `null` when not available yet. */
export type AssetResolver = (part: string, relId: string) => string | null

const NO_ASSETS: AssetResolver = () => null

export interface RenderContext {
  /** The part whose relationships resolve this shape's images. */
  readonly part: string
  readonly images: ImageResolver
  readonly assets: AssetResolver
  /**
   * Scale inherited from enclosing groups, in slide points per authored point.
   * Text uses it to keep its authored font size: PowerPoint does not scale text
   * when a group is resized, it re-wraps it.
   */
  readonly scaleX: number
  readonly scaleY: number
}

const MAX_DEPTH = 32

function childContext(context: RenderContext, transform: { a: number; b: number; c: number; d: number } | null): { scaleX: number; scaleY: number } {
  if (!transform) return { scaleX: context.scaleX, scaleY: context.scaleY }
  // The scale of a matrix is the length of its basis vectors, which stays
  // correct under the rotation and flip a group's own `a:xfrm` may carry.
  const scaleX = Math.hypot(transform.a, transform.b)
  const scaleY = Math.hypot(transform.c, transform.d)
  return {
    scaleX: context.scaleX * (scaleX === 0 ? 1 : scaleX),
    scaleY: context.scaleY * (scaleY === 0 ? 1 : scaleY),
  }
}

function transformStyle(shape: PptxShape): StyleMap {
  const transform = shape.transform
  if (!transform) return { position: 'absolute', left: 0, top: 0 }
  const { offset, extent, rotation, flipH, flipV } = transform
  const style: StyleMap = {
    position: 'absolute',
    left: offset.x,
    top: offset.y,
    width: Math.max(0, extent.width),
    height: Math.max(0, extent.height),
  }
  if (rotation !== 0 || flipH || flipV) {
    // CSS rotates and flips about the element's own centre, which is the pivot
    // Office uses, so the two agree without any extra offset.
    const parts: string[] = []
    if (rotation !== 0) parts.push(`rotate(${rotation}deg)`)
    if (flipH || flipV) parts.push(`scale(${flipH ? -1 : 1}, ${flipV ? -1 : 1})`)
    style.transform = parts.join(' ')
  }
  return style
}

function matrixCss(matrix: Transform2D): string {
  const n = (value: number): string => {
    const rounded = Math.round(value * 1e5) / 1e5
    return String(rounded === 0 ? 0 : rounded)
  }
  return `matrix(${n(matrix.a)}, ${n(matrix.b)}, ${n(matrix.c)}, ${n(matrix.d)}, ${n(matrix.e)}, ${n(matrix.f)})`
}

function applyEffects(element: HTMLElement | SVGElement, shape: PptxShape, isSvg: boolean): void {
  const paint = effectPaint(shape.effects, isSvg)
  if (paint.filters.length > 0) setStyle(element, { filter: paint.filters.join(' ') })
  if (paint.boxShadow) setStyle(element, { boxShadow: paint.boxShadow })
}

function buildBackground(background: PptxBackground, context: RenderContext): HTMLElement | null {
  if (background.kind === 'none') return null
  const layer = el('div', undefined, { position: 'absolute', inset: 0 })
  switch (background.kind) {
    case 'solid':
      setStyle(layer, { background: fillPaint({ type: 'solid', color: background.color }, context.images).background })
      break
    case 'gradient':
      setStyle(layer, {
        background: fillPaint(
          { type: 'gradient', stops: background.stops, angle: background.angle, scaled: true },
          context.images
        ).background,
      })
      break
    case 'picture': {
      const paint = fillPaint({ type: 'picture', blip: background.blip }, context.images)
      if (!paint.background) return null
      setStyle(layer, {
        background: paint.background,
        backgroundSize: paint.backgroundSize ?? 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      })
      break
    }
    default:
      return null
  }
  return layer
}

/**
 * The shape's own fill and outline, as a positioned box.
 *
 * The node is tagged with the shape's kind and name. Nothing in the renderer
 * reads it, but it makes a rendered slide inspectable from the console and gives
 * tests something stable to select that is not a style string.
 */
function buildShapeBox(shape: PptxShape, context: RenderContext): HTMLElement {
  const box = el('div', `py-ooxml-shape py-ooxml-${shape.kind}`, { ...transformStyle(shape), boxSizing: 'border-box' })
  box.dataset['pfName'] = shape.name
  const paint = fillPaint(shape.fill, context.images)
  if (paint.background) {
    setStyle(box, {
      background: paint.background,
      backgroundSize: paint.backgroundSize ?? null,
      backgroundPosition: 'center',
      backgroundRepeat: shape.fill.type === 'picture' && shape.fill.blip.stretch ? 'no-repeat' : null,
    })
  }
  setStyle(box, lineStyles(shape.line))
  applyEffects(box, shape, false)
  return box
}

/**
 * Geometry overlay.
 *
 * Drawn as a child of the fill rather than as the fill itself, so a shape can
 * have both a CSS background and an SVG outline. When the geometry is a plain
 * box the CSS background already covers it and only the silhouette is drawn,
 * which is what makes a `roundRect` look round. Anything else needs the path
 * filled too, or the shape renders as its bounding box.
 */
function buildGeometryOverlay(shape: PptxShape, context: RenderContext): SVGElement | null {
  const geometry = shape.geometry
  const transform = shape.transform
  if (!geometry || geometry.kind === 'none' || !transform) return null

  const width = Math.max(0, transform.extent.width)
  const height = Math.max(0, transform.extent.height)
  const path = outlinePath(geometry, { width, height }, { x: 0, y: 0 })
  if (!path) return null
  const data = pathData(path)
  const solid = shape.fill.type === 'solid'
  const outlined = shape.line.fill.type !== 'none' && shape.line.widthPt > 0
  // The CSS background stands in for the path only when the path is the box.
  const backgroundCovers = solid && isBoundingBoxShape(geometry)
  if (backgroundCovers && !outlined) return null

  const layer = svg('svg', {
    width,
    height,
    viewBox: `0 0 ${width} ${height}`,
    style: 'position:absolute;inset:0;overflow:visible;pointer-events:none',
  })
  layer.appendChild(
    svg('path', {
      // The line attributes carry their own `fill: 'none'`; they go first so the
      // path's fill is not clobbered by the stroke's default.
      ...lineSvgAttributes(shape.line),
      d: data,
      fill: backgroundCovers ? 'none' : (fillPaint(shape.fill, context.images).background ?? 'none'),
    })
  )
  return layer
}

function buildTextLayer(shape: PptxShape, context: RenderContext): HTMLElement | null {
  if (!shape.text) return null
  const transform = shape.transform
  if (!transform) return null
  const autofit = shape.text.autofit
  const fontScale = typeof autofit === 'object' ? autofit.fontScale : 1
  const { scaleX, scaleY } = context
  const text = buildText(shape.text, {
    // The box is authored in unscaled units and then scaled back up, so a shape
    // inside a resized group wraps its text at the width it will occupy.
    widthPt: transform.extent.width / (scaleX === 0 ? 1 : scaleX),
    heightPt: transform.extent.height / (scaleY === 0 ? 1 : scaleY),
    rotation: shape.text.rotation,
    fontScale,
  })
  if (!text) return null
  if (scaleX !== 1 || scaleY !== 1) {
    setStyle(text, { transform: `scale(${scaleX}, ${scaleY})` })
  }
  return text
}

/** `p:pic`, and the preview image of an OLE frame. */
function buildPicture(blip: BlipFill, shape: PptxShape, context: RenderContext): HTMLElement | null {
  const transform = shape.transform
  if (!transform) return null
  const url = context.assets(context.part, blip.embedRelId)
  const frame = el('div', undefined, { position: 'absolute', inset: 0, overflow: 'hidden' })
  if (!url) return frame

  const width = transform.extent.width
  const height = transform.extent.height
  const crop = blip.crop
  const cropped = crop.left !== 0 || crop.top !== 0 || crop.right !== 0 || crop.bottom !== 0

  if (cropped) {
    // `a:srcRect` names the part of the source that survives, in 1000ths of a
    // percent, and that part then *fills* the frame. So the image is scaled up
    // by 1/visible and shifted by -crop/visible; insetting it instead would
    // shrink the visible pixels and leave empty margins around them.
    const visibleW = Math.max(0.01, 1 - (crop.left + crop.right) / 100000)
    const visibleH = Math.max(0.01, 1 - (crop.top + crop.bottom) / 100000)
    const image = el('img', undefined, {
      position: 'absolute',
      left: `${(-crop.left / 100000 / visibleW) * 100}%`,
      top: `${(-crop.top / 100000 / visibleH) * 100}%`,
      width: `${100 / visibleW}%`,
      height: `${100 / visibleH}%`,
    })
    image.src = url
    image.alt = shape.name
    frame.appendChild(image)
    return frame
  }

  const image = el('img', undefined, {
    position: 'absolute',
    left: 0,
    top: 0,
    width,
    height,
    objectFit: blip.stretch ? 'fill' : 'none',
  })
  image.src = url
  image.alt = shape.name
  frame.appendChild(image)
  return frame
}

/** A straight or elbow connector, drawn as an SVG line across its own box. */
function buildConnector(shape: PptxShape): SVGElement | null {
  const transform = shape.transform
  if (!transform) return null
  const width = Math.max(0, transform.extent.width)
  const height = Math.max(0, transform.extent.height)
  const ends = connectorEndpoints({ x: 0, y: 0, width, height }, transform.flipH, transform.flipV)
  const layer = svg('svg', {
    width,
    height,
    viewBox: `0 0 ${width} ${height}`,
    style: 'position:absolute;inset:0;overflow:visible;pointer-events:none',
  })
  layer.appendChild(
    svg('line', { x1: ends.x1, y1: ends.y1, x2: ends.x2, y2: ends.y2, ...lineSvgAttributes(shape.line) })
  )
  return layer
}

/** `p:graphicFrame`: a table, a chart, or a frame we cannot paint. */
function buildFrame(shape: PptxShape, context: RenderContext): HTMLElement | null {
  const frame = shape.frame
  const transform = shape.transform
  if (!frame || !transform) return null

  const host = el('div', 'py-ooxml-frame', { ...transformStyle(shape), boxSizing: 'border-box', overflow: 'hidden' })
  host.dataset['pfName'] = shape.name
  host.dataset['pfFrame'] = frame.kind
  applyEffects(host, shape, false)

  if (frame.kind === 'table') {
    buildTable(frame.table, host)
    return host
  }
  if (frame.kind === 'chart') {
    host.appendChild(
      buildChart(frame.chart, Math.max(1, transform.extent.width), Math.max(1, transform.extent.height))
    )
    return host
  }
  if (frame.kind === 'ole' && frame.preview) {
    const preview = buildPicture(frame.preview, shape, context)
    if (preview) host.appendChild(preview)
    return host
  }
  return host
}

function buildGroup(shape: PptxShape, context: RenderContext, depth: number): HTMLElement | null {
  if (depth >= MAX_DEPTH) return null
  const group = el('div', 'py-ooxml-shape py-ooxml-group', { position: 'absolute', left: 0, top: 0, width: 0, height: 0 })
  group.dataset['pfName'] = shape.name
  const paint = fillPaint(shape.fill, context.images)
  if (paint.background) setStyle(group, { background: paint.background })

  let inner = context
  if (shape.transform) {
    const matrix = childSpaceMatrix(shape.transform)
    if (!isIdentity(matrix)) {
      setStyle(group, { transform: matrixCss(matrix), transformOrigin: '0 0' })
    }
    const scale = childContext(context, matrix)
    inner = { ...context, ...scale }
  }
  applyEffects(group, shape, false)

  for (const child of shape.children) {
    const node = buildShape(child, inner, depth + 1)
    if (node) group.appendChild(node)
  }
  return group
}

function buildShape(shape: PptxShape, context: RenderContext, depth = 0): HTMLElement | null {
  if (shape.hidden) return null
  switch (shape.kind) {
    case 'group':
      return buildGroup(shape, context, depth)
    case 'graphicFrame':
      return buildFrame(shape, context)
    case 'connector': {
      const box = buildShapeBox(shape, context)
      const connector = buildConnector(shape)
      if (connector) {
        applyEffects(connector, shape, true)
        box.appendChild(connector)
      }
      return box
    }
    case 'picture': {
      const box = buildShapeBox(shape, context)
      const blip = shape.blip ?? (shape.fill.type === 'picture' ? shape.fill.blip : null)
      if (blip) {
        const picture = buildPicture(blip, shape, context)
        if (picture) box.appendChild(picture)
      }
      return box
    }
    default: {
      const box = buildShapeBox(shape, context)
      const overlay = buildGeometryOverlay(shape, context)
      if (overlay) {
        applyEffects(overlay, shape, true)
        box.appendChild(overlay)
      }
      const text = buildTextLayer(shape, context)
      if (text) box.appendChild(text)
      return box
    }
  }
}

export interface SlideRenderOptions {
  readonly assets?: AssetResolver
  readonly images?: ImageResolver
}

/**
 * Render a slide into `container`, which must already be sized to the slide.
 *
 * The slide is laid out in points — a 960pt-wide slide fills a 960-unit-wide
 * container — so the caller can scale the container afterwards with a single
 * `transform: scale()` without any of the content reflowing.
 */
export function renderSlide(
  slide: PptxSlide,
  container: HTMLElement,
  options: SlideRenderOptions = {}
): HTMLElement {
  const context: RenderContext = {
    part: slide.part,
    // Picture fills and picture backgrounds resolve through the same asset store
    // as `p:pic`, so a caller that supplies assets gets every blip for free and
    // only has to pass `images` when it paints blips from another part.
    images: options.images ?? ((blip) => (options.assets ?? NO_ASSETS)(slide.part, blip.embedRelId)),
    assets: options.assets ?? NO_ASSETS,
    scaleX: 1,
    scaleY: 1,
  }

  const stage = el('div', undefined, { position: 'absolute', inset: 0, transformOrigin: '0 0' })
  container.appendChild(stage)

  const background = buildBackground(slide.background, context)
  if (background) stage.appendChild(background)

  for (const shape of slide.shapes) {
    const node = buildShape(shape, context)
    if (node) stage.appendChild(node)
  }
  return stage
}
