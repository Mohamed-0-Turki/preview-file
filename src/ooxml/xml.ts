import { OoxmlError } from './errors.js'

/** Namespace URIs the engine reasons about explicitly. */
export const NS = {
  w: 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
  r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  rel: 'http://schemas.openxmlformats.org/package/2006/relationships',
  ct: 'http://schemas.openxmlformats.org/package/2006/content-types',
  a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
  p: 'http://schemas.openxmlformats.org/presentationml/2006/main',
  s: 'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
  c: 'http://schemas.openxmlformats.org/drawingml/2006/chart',
  mc: 'http://schemas.openxmlformats.org/markup-compatibility/2006',
  v: 'urn:schemas-microsoft-com:vml',
  o: 'urn:schemas-microsoft-com:office:office',
  wp: 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
  a14: 'http://schemas.microsoft.com/office/drawing/2010/main',
  xdr: 'http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing',
  wps: 'http://schemas.microsoft.com/office/word/2010/wordprocessingShape',
  wpg: 'http://schemas.microsoft.com/office/word/2010/wordprocessingGroup',
  w14: 'http://schemas.microsoft.com/office/word/2010/wordml',
  xml: 'http://www.w3.org/XML/1998/namespace',
  cp: 'http://schemas.openxmlformats.org/package/2006/metadata/core-properties',
  dc: 'http://purl.org/dc/elements/1.1/',
  dcterms: 'http://purl.org/dc/terms/',
  ep: 'http://schemas.openxmlformats.org/officeDocument/2006/extended-properties',
  vt: 'http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes',
} as const

/**
 * Upper bound on the element count of a single XML part. A hostile or corrupt
 * part can otherwise balloon memory before the first meaningful node is read;
 * the engine fails the part (and only that part) instead of the preview.
 */
const MAX_XML_NODES = 3_000_000

const parserErrorNamespace = 'http://www.mozilla.org/newlayout/xml/parsererror.xml'

/**
 * Parse a package part into an element tree.
 *
 * `DOMParser` is used deliberately: it is the only XML parser guaranteed to
 * exist in the browsers this package targets, and it never resolves external
 * entities. A `<!DOCTYPE` declaration is rejected outright (billion-laughs and
 * external-entity shapes both require one) and the element count is capped.
 */
export function parseXml(source: string, partName: string): Element {
  if (/<!DOCTYPE/i.test(source)) {
    throw new OoxmlError('parse-failed', `Refusing to parse "${partName}": DOCTYPE declarations are not allowed.`, partName)
  }

  const document = new DOMParser().parseFromString(source, 'application/xml')
  const root = document.documentElement
  if (!root) {
    throw new OoxmlError('parse-failed', `"${partName}" is not well-formed XML.`, partName)
  }
  if (root.namespaceURI === parserErrorNamespace || root.localName === 'parsererror') {
    throw new OoxmlError('parse-failed', `"${partName}" is not well-formed XML.`, partName)
  }

  const nodes = root.getElementsByTagName('*').length
  if (nodes > MAX_XML_NODES) {
    throw new OoxmlError(
      'resource-limit',
      `"${partName}" has ${nodes} elements, beyond the ${MAX_XML_NODES} limit this preview engine will parse.`,
      partName
    )
  }

  return root
}

/** Parse a part, returning `null` when it is absent or unparseable. */
export function parseXmlOrNull(source: string | null, partName: string): Element | null {
  if (source === null) return null
  try {
    return parseXml(source, partName)
  } catch {
    return null
  }
}

function matches(el: Element, localName: string, ns?: string): boolean {
  if (el.localName !== localName) return false
  return ns === undefined || el.namespaceURI === ns
}

/** First direct child matching a local name (optionally pinned to a namespace). */
export function childOf(parent: Element | null | undefined, localName: string, ns?: string): Element | null {
  for (let node = parent?.firstElementChild ?? null; node; node = node.nextElementSibling) {
    if (matches(node, localName, ns)) return node
  }
  return null
}

/**
 * Direct children matching a local name. With no `localName`, every child is
 * returned in document order — the cheap way to walk an ordered child list
 * (`p:spTree`, `w:tbl`, `a:solidFill` groups) without repeated queries.
 */
export function childrenOf(parent: Element | null | undefined, localName?: string, ns?: string): Element[] {
  const out: Element[] = []
  for (let node = parent?.firstElementChild ?? null; node; node = node.nextElementSibling) {
    if (localName === undefined || matches(node, localName, ns)) out.push(node)
  }
  return out
}

/**
 * Depth-first descendants matching a local name, in document order.
 *
 * The traversal pushes children in reverse so the stack pops them in reading
 * order. A forward push would still find every node, but would return them
 * last-child-first — which is invisible for counting and wrong for anything
 * that walks a list in order, such as a shape tree or a run of text.
 */
export function descendantsOf(root: Element | null | undefined, localName: string, ns?: string): Element[] {
  if (!root) return []
  if (ns !== undefined) {
    return Array.from(root.getElementsByTagNameNS(ns, localName)) as Element[]
  }
  const out: Element[] = []
  const visit = (node: Element): void => {
    let child = node.firstElementChild
    while (child) {
      const next = child.nextElementSibling
      if (child.localName === localName) out.push(child)
      visit(child)
      child = next
    }
  }
  visit(root)
  return out
}

/** An unprefixed attribute (`w:val`, `r:id` is *not* unprefixed — see {@link relAttr}). */
export function attr(el: Element | null | undefined, name: string): string | undefined {
  const value = el?.getAttribute(name)
  return value === null ? undefined : value
}

export function attrNumber(el: Element | null | undefined, name: string): number | undefined {
  const value = attr(el, name)
  if (value === undefined) return undefined
  const parsed = Number(value.trim())
  return Number.isFinite(parsed) ? parsed : undefined
}

export function attrInt(el: Element | null | undefined, name: string): number | undefined {
  const value = attrNumber(el, name)
  return value === undefined ? undefined : Math.round(value)
}

/** OOXML booleans are `1`/`0`/`true`/`false`/`on`/`off`. */
export function attrBool(el: Element | null | undefined, name: string): boolean | undefined {
  const value = attr(el, name)
  if (value === undefined) return undefined
  const normalized = value.trim().toLowerCase()
  if (normalized === '1' || normalized === 'true' || normalized === 'on') return true
  if (normalized === '0' || normalized === 'false' || normalized === 'off') return false
  return undefined
}

/**
 * An enumerated attribute constrained to a known vocabulary. An unknown value
 * yields `undefined` so the caller keeps its default rather than painting a
 * construct the host application would also reject.
 */
export function attrEnum<T extends string>(
  el: Element | null | undefined,
  name: string,
  allowed: readonly T[]
): T | undefined {
  const value = attr(el, name)
  if (value === undefined) return undefined
  const normalized = value.trim() as T
  return allowed.includes(normalized) ? normalized : undefined
}

/** An `r:`-namespaced attribute (`r:id`, `r:embed`, `r:link`). */
export function relAttr(el: Element | null | undefined, name: string): string | undefined {
  const value = el?.getAttributeNS(NS.r, name)
  return value === null || value === undefined ? undefined : value
}

/** `xml:space`, which decides whether leading/trailing whitespace is kept. */
export function xmlSpace(el: Element): 'preserve' | 'default' {
  return el.getAttributeNS(NS.xml, 'space') === 'preserve' ? 'preserve' : 'default'
}

/** Direct text-node content only, ignoring whitespace between child elements. */
export function ownText(el: Element | null | undefined): string {
  if (!el) return ''
  let out = ''
  for (let node = el.firstChild; node; node = node.nextSibling) {
    if (node.nodeType === 3) out += node.nodeValue ?? ''
  }
  return out
}

/** Concatenated text of an element and all its descendants. */
export function textOf(el: Element | null | undefined): string {
  return el?.textContent ?? ''
}

/**
 * Resolve a markup-compatibility wrapper to the content a consumer should
 * read. `mc:Choice` wins when the engine understands its `Requires` namespace,
 * otherwise the `mc:Fallback`; for a `w:drawing`-style element the alternate
 * content sits beside the primary child, so `prefer` is the sibling to use when
 * the element is only a container for "one of these".
 */
export function resolveAlternateContent(el: Element, requires?: (ns: string) => boolean): Element {
  const choice = childOf(el, 'Choice', NS.mc)
  if (choice && (!requires || requires(choice.getAttribute('Requires') ?? ''))) return choice
  const fallback = childOf(el, 'Fallback', NS.mc)
  return fallback ?? choice ?? el
}

/**
 * Unwrap `mc:AlternateContent` anywhere inside `parent` in place, then return
 * `parent`. Producers wrap optional constructs (DrawingML text boxes, SmartArt
 * fallback art, chart extensions) in these, so every consumer would otherwise
 * need its own handling.
 */
export function unwrapAlternateContent(parent: Element, requires?: (ns: string) => boolean): Element {
  for (let node = parent.firstElementChild; node; ) {
    const next = node.nextElementSibling
    if (node.localName === 'AlternateContent' && node.namespaceURI === NS.mc) {
      const replacement = resolveAlternateContent(node, requires)
      if (replacement !== node && replacement.namespaceURI === NS.mc) {
        // A nested wrapper: recurse so the result is never still a wrapper.
        unwrapAlternateContent(replacement, requires)
        const inner = replacement.firstElementChild
        if (inner) parent.replaceChild(inner, node)
      }
    }
    node = next
  }
  return parent
}
