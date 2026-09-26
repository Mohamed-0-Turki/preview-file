/**
 * Affine geometry for the DrawingML layout model.
 *
 * Everything in this file is unit-explicit. The model is in **points**
 * (`pt`) with angles in **degrees**; EMU only appears where the XML uses it,
 * at the parse boundary. A single canonical unit is what makes it possible to
 * compare our output against a LibreOffice PDF in points without a chain of
 * conversion factors, and it is why nothing here is named `x` when it means
 * "width in EMU".
 */

export interface Point {
  readonly x: number
  readonly y: number
}

export interface Size {
  readonly width: number
  readonly height: number
}

export interface Rect extends Point, Size {}

/**
 * The 2D affine matrix `[a b c d e f]`, matching both the SVG `matrix(...)`
 * argument order and DrawingML's `a:xfrm`, so it can be handed to either
 * without rearrangement.
 *
 * ```text
 * | a c e |
 * | b d f |
 * | 0 0 1 |
 * ```
 */
export interface Transform2D {
  readonly a: number
  readonly b: number
  readonly c: number
  readonly d: number
  readonly e: number
  readonly f: number
}

export const IDENTITY: Transform2D = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }

export function isIdentity(transform: Transform2D): boolean {
  return transform.a === 1 && transform.b === 0 && transform.c === 0 && transform.d === 1 && transform.e === 0 && transform.f === 0
}

/** `this` applied after `other` (i.e. `other` runs first). */
export function composeTransform(outer: Transform2D, inner: Transform2D): Transform2D {
  return {
    a: outer.a * inner.a + outer.c * inner.b,
    b: outer.b * inner.a + outer.d * inner.b,
    c: outer.a * inner.c + outer.c * inner.d,
    d: outer.b * inner.c + outer.d * inner.d,
    e: outer.a * inner.e + outer.c * inner.f + outer.e,
    f: outer.b * inner.e + outer.d * inner.f + outer.f,
  }
}

export function translateTransform(x: number, y: number): Transform2D {
  return { a: 1, b: 0, c: 0, d: 1, e: x, f: y }
}

export function scaleTransform(sx: number, sy: number = sx): Transform2D {
  return { a: sx, b: 0, c: 0, d: sy, e: 0, f: 0 }
}

/** Degrees, clockwise, matching DrawingML's positive rotation direction. */
export function rotateTransform(degrees: number): Transform2D {
  const radians = (degrees * Math.PI) / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  return { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 }
}

/** Rotation about an arbitrary pivot, the form DrawingML encodes in `rot`. */
export function rotateAbout(pivot: Point, degrees: number): Transform2D {
  return composeTransform(translateTransform(pivot.x, pivot.y), composeTransform(rotateTransform(degrees), scaleTransform(-1, -1)))
}

/** Horizontal shear, for italic `a:xfrm` on chart and Word drawing shapes. */
export function skewTransformX(degrees: number): Transform2D {
  const radians = (degrees * Math.PI) / 180
  return { a: 1, b: 0, c: Math.tan(radians), d: 1, e: 0, f: 0 }
}

export function applyTransform(point: Point, transform: Transform2D): Point {
  return {
    x: transform.a * point.x + transform.c * point.y + transform.e,
    y: transform.b * point.x + transform.d * point.y + transform.f,
  }
}

export function determinant(transform: Transform2D): number {
  return transform.a * transform.d - transform.b * transform.c
}

/**
 * The inverse of `transform`, or `null` when it is singular. Callers that must
 * map screen space back to model space (hit testing, text inside a flipped
 * group) need to branch on this rather than divide by zero.
 */
export function invertTransform(transform: Transform2D): Transform2D | null {
  const det = determinant(transform)
  if (det === 0 || !Number.isFinite(det)) return null
  const a = transform.d / det
  const b = -transform.b / det
  const c = -transform.c / det
  const d = transform.a / det
  return {
    a,
    b,
    c,
    d,
    e: -(a * transform.e + c * transform.f),
    f: -(b * transform.e + d * transform.f),
  }
}

/**
 * The DrawingML flip flags as a transform. A group or shape may declare
 * `flipH`/`flipV` instead of negative extents, and PowerPoint uses both
 * spellings, so the flags are normalised into the matrix here.
 */
export function flipTransform(flipH: boolean, flipV: boolean): Transform2D {
  return { a: flipH ? -1 : 1, b: 0, c: 0, d: flipV ? -1 : 1, e: 0, f: 0 }
}

export function rectFromPoints(points: readonly Point[]): Rect {
  if (points.length === 0) return { x: 0, y: 0, width: 0, height: 0 }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const point of points) {
    if (point.x < minX) minX = point.x
    if (point.y < minY) minY = point.y
    if (point.x > maxX) maxX = point.x
    if (point.y > maxY) maxY = point.y
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

/** The axis-aligned box containing a transformed rectangle, in the target space. */
export function transformedBounds(rect: Rect, transform: Transform2D = IDENTITY): Rect {
  const corners: Point[] = [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height },
    { x: rect.x, y: rect.y + rect.height },
  ]
  return rectFromPoints(corners.map((corner) => applyTransform(corner, transform)))
}

/** The tight axis-aligned bounds of a path, honouring control points. */
export function pathBounds(points: readonly Point[]): Rect {
  return rectFromPoints(points)
}

export function unionRects(rects: readonly Rect[]): Rect {
  if (rects.length === 0) return { x: 0, y: 0, width: 0, height: 0 }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const rect of rects) {
    if (rect.x < minX) minX = rect.x
    if (rect.y < minY) minY = rect.y
    if (rect.x + rect.width > maxX) maxX = rect.x + rect.width
    if (rect.y + rect.height > maxY) maxY = rect.y + rect.height
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

export function rectContains(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  )
}

export function rectCenter(rect: Rect): Point {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
}

/** The `left/top/width/height` percentage tuple used by `a:srcRect` and friends. */
export interface FractionRect {
  readonly left: number
  readonly top: number
  readonly right: number
  readonly bottom: number
}

export const ZERO_FRACTION_RECT: FractionRect = { left: 0, top: 0, right: 0, bottom: 0 }

/**
 * Apply a crop rectangle (authored in 1000ths of a percent) to a source size,
 * returning the visible sub-rectangle. Clamped, because producers emit
 * out-of-range crops that Office silently tolerates.
 */
export function applySourceRect(size: Size, crop: FractionRect): Rect {
  const left = clampFraction(crop.left / 100000) * size.width
  const top = clampFraction(crop.top / 100000) * size.height
  const right = clampFraction(crop.right / 100000) * size.width
  const bottom = clampFraction(crop.bottom / 100000) * size.height
  return {
    x: left,
    y: top,
    width: Math.max(0, size.width - left - right),
    height: Math.max(0, size.height - top - bottom),
  }
}

function clampFraction(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(0.99, Math.max(0, value))
}
