/**
 * Thin DOM construction helpers.
 *
 * The Office renderers build thousands of elements per document, so these exist
 * to keep call sites short and to centralise the two conventions that matter:
 * styles are written as objects (never `style.cssText` string surgery), and
 * numbers handed to `px` are rounded so the style string stays stable.
 */

export type StyleMap = Record<string, string | number | null | undefined>

/** Rounds to 3dp and drops `-0`, so `0.1 + 0.2` never reaches the style attr. */
export function px(value: number): string {
  const rounded = Math.round(value * 1000) / 1000
  return `${rounded === 0 ? 0 : rounded}px`
}

/** Applies a style map, skipping null/undefined so callers can inline conditions. */
/**
 * Style properties whose value is a bare `<number>`.
 *
 * Everything else numeric is a length, and CSS only accepts a unit on a length —
 * `font-weight: 700px` is invalid and the browser drops the declaration, which
 * silently loses every bold run in the deck.
 */
const UNITLESS_PROPERTIES: ReadonlySet<string> = new Set([
  'fontWeight',
  'lineHeight',
  'opacity',
  'zIndex',
  'flexGrow',
  'flexShrink',
  'order',
  'columnCount',
  'aspectRatio',
])

export function setStyle(element: HTMLElement | SVGElement, styles: StyleMap): void {
  const style = element.style as unknown as Record<string, string>
  for (const [property, value] of Object.entries(styles)) {
    if (value === null || value === undefined) continue
    if (typeof value !== 'number') {
      style[property] = value
      continue
    }
    style[property] = UNITLESS_PROPERTIES.has(property) ? String(value) : px(value)
  }
}

export function setAttributes(element: Element, attributes: StyleMap): void {
  for (const [name, value] of Object.entries(attributes)) {
    if (value === null || value === undefined) continue
    element.setAttribute(name, typeof value === 'number' ? String(value) : value)
  }
}

/** `document.createElement` with a class name and an optional style map. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  styles?: StyleMap
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag)
  if (className) element.className = className
  if (styles) setStyle(element, styles)
  return element
}

const SVG_NS = 'http://www.w3.org/2000/svg'

/** `document.createElementNS` for SVG, which needs the namespace on every node. */
export function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attributes?: StyleMap,
  styles?: StyleMap
): SVGElementTagNameMap[K] {
  const element = document.createElementNS(SVG_NS, tag) as SVGElementTagNameMap[K]
  if (attributes) setAttributes(element, attributes)
  if (styles) setStyle(element, styles)
  return element
}

/** `class`/`style` pairs for SVG, which does not use the HTML attribute names. */
export function setSvgStyle(element: SVGElement, styles: StyleMap): void {
  setStyle(element, styles)
}

export function removeAllChildren(element: Element): void {
  while (element.firstChild) element.removeChild(element.firstChild)
}

/**
 * `feTurbulence`-free fallback ramp for a two-colour gradient at an arbitrary
 * angle. CSS gradients are used wherever possible; this exists for the angle
 * ranges CSS cannot express, so the two paths stay visually close.
 */
export function gradientBackground(
  stops: readonly { readonly position: number; readonly color: string }[],
  angle: number
): string {
  const list = stops.length > 0 ? stops : [{ position: 0, color: '#000' }]
  const parts = list.map((stop) => `${stop.color} ${Math.round(stop.position * 100)}%`)
  return `linear-gradient(${Math.round(angle)}deg, ${parts.join(', ')})`
}
