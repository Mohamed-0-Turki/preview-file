import { colorChoiceOf, parseColorElement, type OfficeColor, type SchemeColorResolver } from '../color.js'
import {
  DEFAULT_LINE,
  NO_EFFECTS,
  mergeCharacterProperties,
  parseCharacterProperties,
  parseFillChoice,
  parseLine,
  parseTextBody,
  parseTransform,
  resolveShapeProperties,
  type BlipFill,
  type ShapeGeometry,
  type ShapeTransform,
} from '../drawingml.js'
import { OoxmlError } from '../errors.js'
import { OfficePackage } from '../package.js'
import { Theme } from '../theme.js'
import { universalMeasureToPt } from '../units.js'
import { attr, attrBool, attrInt, childOf, childrenOf, descendantsOf, relAttr } from '../xml.js'
import { NO_CELL_BORDERS } from './model.js'
import { parseChart } from './chart.js'
import type {
  PptxBackground,
  PptxBullet,
  PptxFrameContent,
  PptxLineSpacing,
  PptxNotesSize,
  PptxParagraph,
  PptxParagraphAlign,
  PptxPlaceholderRef,
  PptxPresentation,
  PptxRun,
  PptxShape,
  PptxSlide,
  PptxSlideSize,
  PptxTable,
  PptxTableBorders,
  PptxTableCell,
  PptxTextBody,
} from './model.js'

/**
 * The PowerPoint parser.
 *
 * Three rules govern everything here:
 *
 * 1. **Inheritance is explicit.** A slide's shape tree is not the whole
 *    picture. Master shapes paint beneath layout shapes, which paint beneath
 *    slide shapes; a placeholder with no `a:xfrm` takes its geometry from the
 *    matching layout placeholder and failing that from the master. Text
 *    properties cascade from the master's `p:txStyles` through the placeholder
 *    chain's `lstStyle` and the paragraph's `defRPr` to the run's own `rPr`,
 *    each layer overlaid on the last.
 * 2. **Nothing is flattened.** Groups keep their nesting and their
 *    `chOff`/`chExt`, because flattening forces a renderer to bake transforms
 *    into coordinates and destroys the structure.
 * 3. **Failures stay local.** An unreadable frame yields an `unsupported`
 *    frame rather than aborting the slide, so one broken chart cannot blank a
 *    forty-slide deck.
 */

const REL = {
  slideLayout: '/slideLayout',
  slideMaster: '/slideMaster',
  theme: '/theme',
  notesSlide: '/notesSlide',
} as const

/** From a slide, the way up to a theme is layout → master → theme. */
const SLIDE_CHAIN = [REL.slideLayout, REL.slideMaster, REL.theme]

/** Placeholder types whose text style comes from `p:txStyles/p:titleStyle`. */
const TITLE_PLACEHOLDERS = new Set(['title', 'ctrTitle'])

/**
 * Wingdings/Symbol bullet code points are private-use characters, not Unicode.
 * Without this table the glyph is unassigned and the bullet renders as nothing
 * or as a replacement box.
 */
const SYMBOL_BULLETS: Readonly<Record<string, string>> = {
  'F0B7': '•',
  'F0A7': '▪',
  'F0A8': '➢',
  'F0D8': '➢',
  'F0FC': '✓',
  'F0FE': '✔',
  'F06E': '■',
  'F0A0': '■',
}

const SCHEME_FONT_PREFIX = /^[+-]m([jn])-(lt|ea|cs)$/

const SHAPE_ELEMENTS = new Set(['sp', 'pic', 'grpSp', 'graphicFrame', 'cxnSp', 'contentPart'])

/** Beyond this, a group tree is either malicious or a converter bug. */
const MAX_GROUP_DEPTH = 12

/* -------------------------------------------------------------------------- */
/* Typefaces                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Resolve a typeface into a CSS `font-family` list.
 *
 * `+mn-lt`/`+mj-lt` are theme references, not names: handing one to CSS drops
 * the run onto the browser default, which is the most visible way a deck stops
 * looking like itself. The theme's East Asian and complex-script faces are
 * appended as fallbacks so a run containing CJK or Arabic glyphs still picks
 * the right font when the latin face lacks them.
 */
export function resolveTypeface(typeface: string | null | undefined, theme: Theme, preferMajor: boolean): string {
  const name = (typeface ?? '').trim()
  const match = name === '' ? null : SCHEME_FONT_PREFIX.exec(name)
  if (name !== '' && !match) return fontStack(name)

  const kind = match ? (match[1] === 'j' ? 'major' : 'minor') : preferMajor ? 'major' : 'minor'
  const fonts = theme.font(kind)
  if (match?.[2] === 'ea') return fontStack(fonts.eastAsian, fonts.latin)
  if (match?.[2] === 'cs') return fontStack(fonts.complexScript, fonts.latin)
  return fontStack(fonts.latin, fonts.eastAsian, fonts.complexScript)
}

function fontStack(...faces: readonly (string | undefined | null)[]): string {
  const seen = new Set<string>()
  const stack: string[] = []
  for (const face of faces) {
    const value = (face ?? '').trim()
    if (value === '' || seen.has(value)) continue
    seen.add(value)
    stack.push(/^[A-Za-z][A-Za-z0-9-]*$/.test(value) ? value : `"${value.replace(/"/g, '')}"`)
  }
  return stack.length > 0 ? stack.join(', ') : 'sans-serif'
}

/* -------------------------------------------------------------------------- */
/* Text defaults                                                               */
/* -------------------------------------------------------------------------- */

/**
 * The `a:lvlNpPr` level defaults of one or more `lstStyle`/`p:txStyles` blocks.
 *
 * Raw elements are kept rather than parsed values because inheritance overlays
 * one level on the next: a layout that only sets `b="1"` must not reset the
 * size and colour it inherited from the master.
 */
interface LevelDefaults {
  /** 1-based level → the `a:lvlNpPr` chain, most general first. */
  readonly levels: ReadonlyMap<number, readonly Element[]>
  /** `a:bodyPr` of the nearest block that declared one. */
  readonly body: Element | null
  /**
   * The `p:txStyles` child itself, kept so it can be threaded into another
   * part's inheritance chain — a layout placeholder needs the master's
   * `titleStyle`, not the layout's own `lstStyle` alone.
   */
  readonly root: Element | null
}

/**
 * Merge level defaults from several sources, **most general first**.
 *
 * Every `a:lvlNpPr` for a level is kept rather than only the most specific one.
 * Keeping just the last is wrong for a *paragraph* level: a master commonly sets
 * `algn="ctr"` on its title style while the layout's own level only sets `marL`,
 * and last-wins silently drops the alignment — which is why a centred deck title
 * renders flush left. The cascade is applied per property instead, most specific
 * winning, via {@link LevelChain}.
 */
function collectLevelDefaults(sources: readonly (Element | null | undefined)[]): LevelDefaults {
  const levels = new Map<number, Element[]>()
  let body: Element | null = null
  for (const source of sources) {
    if (!source) continue
    if (!body) body = childOf(source, 'bodyPr')
    for (let level = 1; level <= 9; level += 1) {
      const levelNode = childOf(source, `lvl${level}pPr`)
      if (!levelNode) continue
      const chain = levels.get(level)
      if (chain) chain.push(levelNode)
      else levels.set(level, [levelNode])
    }
  }
  return { levels, body, root: sources.find((source): source is Element => Boolean(source)) ?? null }
}

/**
 * One indent level's inherited paragraph properties.
 *
 * Reads walk the chain from the most specific source backwards, so the first
 * declaration found is the winner for that property — the same rule the character
 * cascade already follows.
 */
class LevelChain {
  /** `a:lvlNpPr` nodes, most general first. */
  private readonly nodes: readonly Element[]

  constructor(nodes: readonly Element[]) {
    this.nodes = nodes
  }

  /** The attribute value from the most specific `a:lvlNpPr` that declares it. */
  attr(name: string): string | undefined {
    for (let i = this.nodes.length - 1; i >= 0; i -= 1) {
      const value = attr(this.nodes[i], name)
      if (value !== undefined) return value
    }
    return undefined
  }

  /** The named child of the most specific `a:lvlNpPr` that declares it. */
  child(name: string): Element | null {
    for (let i = this.nodes.length - 1; i >= 0; i -= 1) {
      const child = childOf(this.nodes[i], name)
      if (child) return child
    }
    return null
  }

  /**
   * The most specific `a:lvlNpPr` that declares any of `names`, and which one it used.
   *
   * `child` is right when each name is a property of its own, but not when the names
   * are alternative spellings of a single value. A paragraph's own `a:buAutoNum` has
   * to beat a `a:buChar` inherited from the master, and asking `child` per name and
   * then ranking by kind gets that backwards: the master's `buChar` would win simply
   * by being checked first. So the alternatives are searched together, one source at
   * a time from most specific to least, and the first source that declares any of
   * them decides.
   */
  group(names: readonly string[]): { name: string; node: Element } | null {
    for (let i = this.nodes.length - 1; i >= 0; i -= 1) {
      for (const name of names) {
        const child = childOf(this.nodes[i], name)
        if (child) return { name, node: child }
      }
    }
    return null
  }

  /** Every `a:defRPr` in the chain, most general first, for merging. */
  defRPrs(): Element[] {
    return this.nodes.map((node) => childOf(node, 'defRPr')).filter((node): node is Element => node !== null)
  }

  /** `a:defRPr/@sz` from the most specific level that declares a size. */
  sizePt(fallback: number): number {
    const size = attrInt(this.child('defRPr'), 'sz')
    return size === undefined ? fallback : size / 100
  }
}

/* -------------------------------------------------------------------------- */
/* Bullets                                                                     */
/* -------------------------------------------------------------------------- */

const NO_BULLET: PptxBullet = {
  kind: 'none',
  char: '',
  fontFamily: '',
  color: null,
  sizePercent: 100,
  hangingPercent: 100,
  ordinal: null,
}

/**
 * The bullet for a paragraph.
 *
 * The bullet *kind* comes from the most specific source that declares one, but the
 * properties of that bullet — font, colour, size — cascade on their own. A master
 * that sets a bullet colour and font with the level's own `buChar` overridden in the
 * layout must keep the inherited colour, so each property is read from the
 * paragraph first and from the level chain only where the paragraph is silent.
 */
function bulletFrom(pPr: Element | null, chain: LevelChain, resolve: SchemeColorResolver): PptxBullet {
  const pick = (name: string): Element | null => childOf(pPr, name) ?? chain.child(name)

  /* Which kind of marker applies is a single decision, and specificity has to settle
   * it across the whole chain. Asking for each kind in turn and taking the first that
   * exists would rank by kind instead: a `a:buChar` inherited from the master's
   * `bodyStyle` would beat the paragraph's own `a:buAutoNum` purely by being checked
   * first, so a numbered list would render as a bulleted one. The paragraph's own
   * `a:pPr` is the most specific level, so it is consulted before the chain. */
  const kind = bulletKindOf(pPr, chain)
  if (kind === 'buNone' || kind === null) return NO_BULLET

  if (kind === 'buChar') {
    const charNode = pick('buChar')
    if (charNode) {
      const raw = attr(charNode, 'char') ?? '•'
      const declared = attr(pick('buFont'), 'typeface') ?? ''
      const sizePct = attrInt(pick('buSzPct'), 'val')
      return {
        kind: 'character',
        char: SYMBOL_BULLETS[raw.toUpperCase()] ?? raw,
        // A symbol font must survive as the primary face: the mapped character
        // is a Unicode stand-in that only exists for readers without the font.
        fontFamily: /wingding|symbol/i.test(declared) ? fontStack(declared, 'Arial') : fontStack(declared),
        color: parseColorElement(colorChoiceOf(pick('buClr')), resolve),
        sizePercent: sizePct === undefined ? 100 : sizePct / 1000,
        hangingPercent: 100,
        ordinal: null,
      }
    }
  }

  if (kind === 'buAutoNum') {
    const autoNum = pick('buAutoNum')
    if (autoNum) {
      return {
        kind: 'autoNumber',
        char: autoNumberGlyph(attr(autoNum, 'type') ?? 'arabicPeriod'),
        fontFamily: fontStack(attr(pick('buFont'), 'typeface')),
        color: parseColorElement(colorChoiceOf(pick('buClr')), resolve),
        sizePercent: 100,
        hangingPercent: 100,
        // Filled in by the caller, which is the only place that can see the
        // paragraphs above and work out the position in the list.
        ordinal: null,
      }
    }
  }

  if (kind === 'buBlip' && pick('buBlip')) {
    return { kind: 'picture', char: '', fontFamily: '', color: null, sizePercent: 100, hangingPercent: 100, ordinal: null }
  }

  return NO_BULLET
}

/** The bullet kind in effect: the most specific level that names one. */
function bulletKindOf(pPr: Element | null, chain: LevelChain): string | null {
  const KINDS = ['buNone', 'buChar', 'buAutoNum', 'buBlip']
  for (const name of KINDS) {
    if (childOf(pPr, name)) return name
  }
  return chain.group(KINDS)?.name ?? null
}

/**
 * The one-based position of the next numbered item at `level`.
 *
 * Numbering restarts when the list is interrupted: a paragraph at another level, or
 * one without an auto-numbered marker, ends the run, so the next item at this level
 * starts again from one. A level that has not been seen yet starts at one.
 */
function nextOrdinal(previous: readonly PptxParagraph[], level: number): number {
  for (let i = previous.length - 1; i >= 0; i -= 1) {
    const p = previous[i]!
    if (p.level !== level || p.bullet.kind !== 'autoNumber') return 1
    return (p.bullet.ordinal ?? 0) + 1
  }
  return 1
}

function autoNumberGlyph(type: string): string {
  switch (type) {
    case 'arabicParenR':
      return '1)'
    case 'arabicParenBoth':
      return '(1)'
    case 'alphaLcPeriod':
      return 'a.'
    case 'alphaUcPeriod':
      return 'A.'
    case 'alphaLcParenR':
      return 'a)'
    case 'alphaUcParenR':
      return 'A)'
    case 'romanLcPeriod':
      return 'i.'
    case 'romanUcPeriod':
      return 'I.'
    case 'romanLcParenR':
      return 'i)'
    case 'romanUcParenR':
      return 'I)'
    case 'bulletBlank':
    case 'arabicPeriod':
    default:
      return '•'
  }
}

/* -------------------------------------------------------------------------- */
/* Text bodies                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Reads an `a:lnSpc` element into leading.
 *
 * The argument is the `a:lnSpc` itself, not the `a:pPr` holding it: the call site has
 * to consult the paragraph and then the style chain, so it has already resolved
 * which element applies. Accepting a `pPr` here and looking for `a:lnSpc` again
 * would silently report "no line spacing" for every deck.
 */
function parseLineSpacing(lnSpc: Element | null): PptxLineSpacing {
  const pct = childOf(lnSpc, 'spcPct')
  if (pct) return { percent: (attrInt(pct, 'val') ?? 100000) / 100000, points: null }
  const pts = childOf(lnSpc, 'spcPts')
  if (pts) return { percent: null, points: (attrInt(pts, 'val') ?? 0) / 100 }
  return { percent: null, points: null }
}

function alignOf(algn: string | undefined): PptxParagraphAlign {
  switch (algn) {
    case 'ctr':
      return 'center'
    case 'r':
      return 'right'
    case 'just':
      return 'justify'
    case 'dist':
      return 'distribute'
    default:
      return 'left'
  }
}

/** `a:spcPts` before or after a paragraph, inherited when the paragraph omits it. */
function spacingOf(pPr: Element | null, chain: LevelChain, element: 'spcBef' | 'spcAft'): number {
  const node = childOf(pPr, element) ?? chain.child(element)
  const pts = childOf(node, 'spcPts')
  if (pts) return (attrInt(pts, 'val') ?? 0) / 100
  return 0
}

export interface TextBodyOptions {
  readonly theme: Theme
  readonly resolve: SchemeColorResolver
  /** `lstStyle`-bearing ancestors, **most general first**. */
  readonly inherited?: readonly (Element | null | undefined)[]
  /** Default font size when nothing declares one. */
  readonly defaultSizePt?: number
  /** `true` for title placeholders, which prefer the major theme font. */
  readonly preferMajorFont?: boolean
}

/**
 * Parse a `p:txBody` (or an `a:txBody` in a table cell) with full inheritance.
 *
 * The cascade is applied per property, not per object: the level defaults set
 * the base, the paragraph's `defRPr` is overlaid, and the run's `rPr` is
 * overlaid on that. `a:br` becomes a run flag so the layout stage can break the
 * line without losing the styling of the text after it, and `a:fld` keeps its
 * cached text — a slide number must render as the number PowerPoint cached,
 * not as a re-evaluated field.
 */
export function parseTextBodyNode(
  txBody: Element | null | undefined,
  options: TextBodyOptions
): PptxTextBody | null {
  if (!txBody) return null
  const { theme, resolve, inherited = [], defaultSizePt = 18, preferMajorFont = false } = options
  const own = childOf(txBody, 'lstStyle')
  const levels = collectLevelDefaults([...inherited, own])

  const bodyPr = childOf(txBody, 'bodyPr')
  const parsed = parseTextBody(bodyPr ?? levels.body ?? null)
  const body = {
    insets: parsed.insets,
    anchor: parsed.anchor,
    vertical: parsed.vertical,
    wrap: parsed.wrap,
    autofit: parsed.autofit,
    rotation: parsed.rotation,
    columns: parsed.columns,
    columnSpacingPt: parsed.columnSpacingPt,
  }

  const paragraphs: PptxParagraph[] = []
  for (const p of childrenOf(txBody, 'p')) {
    const pPr = childOf(p, 'pPr')
    const level = Math.min(8, Math.max(0, attrInt(pPr, 'lvl') ?? 0))
    // The paragraph's own properties win; anything it does not declare comes from
    // the inherited level chain, so a master `titleStyle` supplies the alignment
    // and indents a paragraph leaves unset.
    const chain = new LevelChain(levels.levels.get(level + 1) ?? [])
    const align = attr(pPr, 'algn') ?? chain.attr('algn')
    const marL = attr(pPr, 'marL') ?? chain.attr('marL')
    const indent = attr(pPr, 'indent') ?? chain.attr('indent')

    let base = parseCharacterProperties(null, resolve, theme, chain.sizePt(defaultSizePt))
    for (const defRPr of chain.defRPrs()) {
      base = mergeCharacterProperties(base, defRPr, resolve, theme)
    }
    const paragraphProps = mergeCharacterProperties(base, childOf(pPr, 'defRPr'), resolve, theme)

    const runs: PptxRun[] = []
    let breakBefore = false
    for (const child of childrenOf(p)) {
      if (child.localName === 'br') {
        breakBefore = true
        continue
      }
      if (child.localName !== 'r' && child.localName !== 'fld') continue
      const properties = mergeCharacterProperties(paragraphProps, childOf(child, 'rPr'), resolve, theme)
      const t = childOf(child, 't')
      if (!t) continue
      // The text of `a:t` is verbatim, including a leading or trailing space,
      // which is how two runs of one sentence are separated. Trimming it glues
      // "Bold red," to "then plain blue." — and `xml:space` is not a reliable
      // signal for it, because PowerPoint omits it on runs that do keep spaces.
      const text = t.textContent ?? ''
      if (text === '') continue
      runs.push({
        text,
        properties,
        fontFamily: resolveTypeface(properties.latinTypeface, theme, preferMajorFont),
        breakBefore,
        field: child.localName === 'fld',
      })
      breakBefore = false
    }

    const endPr = childOf(p, 'endParaRPr')
    const bullet = bulletFrom(pPr, chain, resolve)
    paragraphs.push({
      level,
      align: alignOf(align),
      bullet: bullet.kind === 'autoNumber' ? { ...bullet, ordinal: nextOrdinal(paragraphs, level) } : bullet,
      marginLeftPt: universalMeasureToPt(marL) ?? 0,
      indentPt: universalMeasureToPt(indent) ?? 0,
      spaceBeforePt: spacingOf(pPr, chain, 'spcBef'),
      spaceAfterPt: spacingOf(pPr, chain, 'spcAft'),
      lineSpacing: parseLineSpacing(childOf(pPr, 'lnSpc') ?? chain.child('lnSpc')),
      runs,
      endProperties: endPr ? mergeCharacterProperties(paragraphProps, endPr, resolve, theme) : null,
    })
  }

  return { ...body, paragraphs }
}

/* -------------------------------------------------------------------------- */
/* Background                                                                  */
/* -------------------------------------------------------------------------- */

function parseBackground(root: Element | null, resolve: SchemeColorResolver): PptxBackground {
  const bg = childOf(root, 'bg')
  if (!bg) return { kind: 'none' }
  // `p:bgRef` is an indexed reference into the master's background set, which
  // needs the theme's `bgFillStyleLst`; a plain `idx` is not resolvable here,
  // so it degrades to the master's background rather than to a wrong colour.
  if (childOf(bg, 'bgRef')) return { kind: 'none' }
  const bgPr = childOf(bg, 'bgPr')
  if (!bgPr) return { kind: 'none' }

  const solid = childOf(bgPr, 'solidFill')
  if (solid) {
    const color = parseColorElement(colorChoiceOf(solid), resolve)
    return color ? { kind: 'solid', color } : { kind: 'none' }
  }
  const grad = childOf(bgPr, 'gradFill')
  if (grad) {
    const stops: { position: number; color: OfficeColor }[] = []
    for (const gs of childrenOf(childOf(grad, 'gsLst'))) {
      const color = parseColorElement(colorChoiceOf(gs), resolve)
      if (color) stops.push({ position: (attrInt(gs, 'pos') ?? 0) / 100000, color })
    }
    if (stops.length === 0) return { kind: 'none' }
    const linear = childOf(grad, 'lin')
    return { kind: 'gradient', stops, angle: linear ? (attrInt(linear, 'ang') ?? 0) / 60000 : 90 }
  }
  const blipFill = childOf(bgPr, 'blipFill')
  if (blipFill) {
    const fill = parseFillChoice(blipFill, resolve)
    if (fill?.type === 'picture') return { kind: 'picture', blip: fill.blip }
  }
  return { kind: 'none' }
}

/* -------------------------------------------------------------------------- */
/* Placeholders                                                                */
/* -------------------------------------------------------------------------- */

function placeholderAliases(placeholder: PptxPlaceholderRef): string[] {
  const keys = [`idx:${placeholder.index ?? 'x'}:${placeholder.type}`, `type:${placeholder.type}`]
  // A title and a centre-title are interchangeable across master/layout pairs,
  // as are a subtitle and a body, because producers disagree on which they use.
  if (placeholder.type === 'ctrTitle') keys.push(`idx:${placeholder.index ?? 'x'}:title`, 'type:title')
  if (placeholder.type === 'title') keys.push(`idx:${placeholder.index ?? 'x'}:ctrTitle`, 'type:ctrTitle')
  if (placeholder.type === 'subTitle') keys.push(`idx:${placeholder.index ?? 'x'}:body`, 'type:body')
  if (placeholder.type === 'body') keys.push(`idx:${placeholder.index ?? 'x'}:subTitle`, 'type:subTitle')
  return keys
}

function readPlaceholder(nvPr: Element | null): PptxPlaceholderRef | null {
  const ph = childOf(nvPr, 'ph')
  if (!ph) return null
  return {
    // The schema defaults an omitted `type` to `body`; a reader that treats the
    // absence as "no placeholder" loses the inheritance chain for the most
    // common placeholder in a deck.
    type: attr(ph, 'type') ?? 'body',
    index: attrInt(ph, 'idx') ?? null,
    orientation: attr(ph, 'orient') ?? null,
    size: attr(ph, 'sz') ?? null,
  }
}

interface PlaceholderEntry {
  readonly transform: ShapeTransform | null
  /**
   * The `lstStyle` chain that governs this placeholder, most general first and
   * including this part's own. A slide placeholder that inherits from a layout
   * placeholder must see the master's styles too, or a title that the layout
   * only partially restyles falls back to PowerPoint's built-in defaults.
   */
  readonly sources: readonly (Element | null)[]
}

/* -------------------------------------------------------------------------- */
/* Shape parsing                                                               */
/* -------------------------------------------------------------------------- */

interface ShapeContext {
  readonly pkg: OfficePackage
  readonly part: string
  readonly theme: Theme
  readonly resolve: SchemeColorResolver
  readonly placeholders: ReadonlyMap<string, PlaceholderEntry>
  /** The master's `p:txStyles` children, used per placeholder type. */
  readonly textStyles: TextStyleRoots
  /** The placeholder chain inherited from the layout and master. */
  readonly chain: readonly (Element | null)[]
  readonly depth: number
}

interface TextStyleRoots {
  readonly title: Element | null
  readonly body: Element | null
  readonly other: Element | null
}

function nonVisualOf(node: Element): Element | null {
  return (
    childOf(childOf(node, 'nvSpPr'), 'cNvPr') ??
    childOf(childOf(node, 'nvPicPr'), 'cNvPr') ??
    childOf(childOf(node, 'nvCxnSpPr'), 'cNvPr') ??
    childOf(childOf(node, 'nvGrpSpPr'), 'cNvPr') ??
    childOf(childOf(node, 'nvGraphicFramePr'), 'cNvPr')
  )
}

function nvPrOf(node: Element): Element | null {
  return (
    childOf(childOf(node, 'nvSpPr'), 'nvPr') ??
    childOf(childOf(node, 'nvPicPr'), 'nvPr') ??
    childOf(childOf(node, 'nvCxnSpPr'), 'nvPr') ??
    childOf(childOf(node, 'nvGrpSpPr'), 'nvPr') ??
    childOf(childOf(node, 'nvGraphicFramePr'), 'nvPr')
  )
}

function xfrmOf(node: Element): Element | null {
  // `p:graphicFrame` and `p:cxnSp` carry `p:xfrm` directly; everything else
  // nests `a:xfrm` inside `spPr`/`grpSpPr`.
  return childOf(node, 'xfrm') ?? childOf(childOf(node, 'spPr'), 'xfrm') ?? childOf(childOf(node, 'grpSpPr'), 'xfrm')
}

function blipOf(container: Element | null): BlipFill | null {
  if (!container) return null
  const fill = parseFillChoice(container, () => null)
  return fill && fill.type === 'picture' ? fill.blip : null
}

/**
 * Parse a shape tree, preserving authored order and nesting.
 *
 * Order is z-order: Office paints `p:spTree` children in document order, so a
 * reader that reverses it gets overlapping translucent shapes visibly wrong.
 */
async function parseShapeTree(
  tree: Element,
  context: ShapeContext
): Promise<{ shapes: PptxShape[]; placeholders: Map<string, PlaceholderEntry> }> {
  const shapes: PptxShape[] = []
  const placeholders = new Map<string, PlaceholderEntry>()
  for (const node of childrenOf(tree)) {
    if (!SHAPE_ELEMENTS.has(node.localName)) continue
    const shape = await parseShape(node, context)
    if (!shape) continue
    shapes.push(shape)
    if (shape.placeholder && context.depth === 0) {
      const entry = placeholderEntryFor(node, shape, context)
      for (const key of placeholderAliases(shape.placeholder)) {
        if (!placeholders.has(key)) placeholders.set(key, entry)
      }
    }
  }
  return { shapes, placeholders }
}

/** Build the entry a more-derived part will inherit from this shape. */
function placeholderEntryFor(node: Element, shape: PptxShape, context: ShapeContext): PlaceholderEntry {
  const lstStyle = childOf(childOf(node, 'txBody'), 'lstStyle')
  const inherited = shape.placeholder ? lookupPlaceholder(context, shape.placeholder) : null
  return {
    transform: shape.transform,
    sources: [...(inherited?.sources ?? []), ...context.chain, lstStyle],
  }
}

async function parseShape(node: Element, context: ShapeContext): Promise<PptxShape | null> {
  const nonVisual = nonVisualOf(node)
  const placeholder = readPlaceholder(nvPrOf(node))
  const isGroup = node.localName === 'grpSp'
  if (isGroup && context.depth >= MAX_GROUP_DEPTH) return null

  const inherited = placeholder ? lookupPlaceholder(context, placeholder) : null
  const xfrm = xfrmOf(node)
  const own = parseTransform(xfrm)
  const transform = own ?? (isGroup ? null : (inherited?.transform ?? null))

  const common = {
    id: attr(nonVisual, 'id') ?? '',
    name: attr(nonVisual, 'name') ?? '',
    ownerPart: context.part,
    hidden: attrBool(nonVisual, 'hidden') ?? false,
    placeholder,
    transform,
    text: null,
    blip: null,
    frame: null,
  } as const

  if (isGroup) {
    return {
      ...common,
      kind: 'group',
      geometry: null,
      fill: { type: 'none' },
      line: DEFAULT_LINE,
      effects: NO_EFFECTS,
      styledByReference: false,
      children: (await parseShapeTree(node, { ...context, depth: context.depth + 1 })).shapes,
      textBox: false,
    }
  }

  const spPr = childOf(node, 'spPr')
  const properties = resolveShapeProperties(spPr, childOf(node, 'style'), context.theme, null, xfrm ?? undefined)

  const base: PptxShape = {
    ...common,
    kind: node.localName === 'pic' ? 'picture' : node.localName === 'cxnSp' ? 'connector' : node.localName === 'graphicFrame' ? 'graphicFrame' : node.localName === 'contentPart' ? 'content' : 'shape',
    geometry: node.localName === 'graphicFrame' || node.localName === 'contentPart' ? null : (properties.geometry as ShapeGeometry),
    fill: properties.fill,
    line: properties.line,
    effects: properties.effects,
    styledByReference: properties.sources.fill !== 'explicit',
    children: [],
    textBox: attrBool(childOf(childOf(node, 'nvSpPr'), 'cNvSpPr'), 'txBox') ?? false,
  }

  if (node.localName === 'pic') {
    return { ...base, blip: blipOf(childOf(node, 'blipFill')), styledByReference: false }
  }
  if (node.localName === 'graphicFrame') {
    return { ...base, frame: await parseFrame(context.pkg, context.part, node, context.theme) }
  }
  if (node.localName === 'contentPart') {
    return { ...base, fill: { type: 'none' }, line: DEFAULT_LINE, effects: NO_EFFECTS }
  }

  const txBody = childOf(node, 'txBody')
  const titleLike = placeholder ? TITLE_PLACEHOLDERS.has(placeholder.type) : false
  // `otherStyle` is the catch-all, so it always sits at the bottom of the
  // cascade; the placeholder's own style is layered on top of it.
  const styleRoot = titleLike ? context.textStyles.title : placeholder ? context.textStyles.body : context.textStyles.other
  return {
    ...base,
    text: parseTextBodyNode(txBody, {
      theme: context.theme,
      resolve: context.resolve,
      inherited: [context.textStyles.other, styleRoot, ...(inherited?.sources ?? []), ...context.chain],
      preferMajorFont: titleLike,
    }),
  }
}

function lookupPlaceholder(context: ShapeContext, placeholder: PptxPlaceholderRef): PlaceholderEntry | null {
  for (const key of placeholderAliases(placeholder)) {
    const found = context.placeholders.get(key)
    if (found) return found
  }
  return null
}

/* -------------------------------------------------------------------------- */
/* Graphic frames                                                              */
/* -------------------------------------------------------------------------- */

async function parseFrame(
  pkg: OfficePackage,
  part: string,
  node: Element,
  theme: Theme
): Promise<PptxFrameContent> {
  const graphicData = descendantsOf(node, 'graphicData')[0]
  if (!graphicData) return { kind: 'unsupported', uri: '' }
  const uri = attr(graphicData, 'uri') ?? ''

  if (/diagram/i.test(uri)) {
    // A SmartArt frame names its parts with distinct attributes on `dgm:relIds`
    // rather than a plain `r:id`, so they must be read individually.
    const relIds = childOf(graphicData, 'relIds')
    return {
      kind: 'diagram',
      dataPart: await pkg.targetOf(part, relAttr(relIds, 'dm')),
      layoutPart: await pkg.targetOf(part, relAttr(relIds, 'lo')),
    }
  }

  const table = childOf(graphicData, 'tbl')
  if (table) return { kind: 'table', table: await parseTable(table, theme) }

  if (/chart/i.test(uri)) {
    const chartNode = descendantsOf(graphicData, 'chart')[0]
    const chartPart = await pkg.targetOf(part, relAttr(chartNode, 'id'))
    if (chartPart) {
      const chartRoot = await pkg.xml(chartPart)
      const themePart = await pkg.themeFor(chartPart)
      const chartTheme = themePart ? await parseThemePart(pkg, themePart) : theme
      const chart = parseChart(chartRoot, chartTheme)
      if (chart) return { kind: 'chart', chart }
    }
  }

  if (/oleObject/i.test(uri) || childOf(graphicData, 'oleObj')) {
    return { kind: 'ole', preview: blipOf(childOf(graphicData, 'pic')) }
  }

  return { kind: 'unsupported', uri }
}

async function parseTable(tbl: Element, theme: Theme): Promise<PptxTable> {
  const tblPr = childOf(tbl, 'tblPr')
  const resolve = theme.resolverFor(null)
  const columnWidthsPt = childrenOf(childOf(tbl, 'tblGrid'), 'gridCol').map((col) => universalMeasureToPt(attr(col, 'w')) ?? 0)
  const rowHeightsPt: number[] = []
  const cells: PptxTableCell[] = []

  let row = 0
  for (const tr of childrenOf(tbl, 'tr')) {
    rowHeightsPt.push(universalMeasureToPt(attr(tr, 'h')) ?? 0)
    let column = 0
    for (const tc of childrenOf(tr, 'tc')) {
      const tcPr = childOf(tc, 'tcPr')
      const columnSpan = attrInt(tc, 'gridSpan') ?? 1
      cells.push({
        row,
        column,
        rowSpan: attrInt(tc, 'rowSpan') ?? 1,
        columnSpan,
        horizontalMerge: mergeFlag(attr(tcPr, 'hMerge')),
        verticalMerge: mergeFlag(attr(tcPr, 'vMerge')),
        anchor: cellAnchor(attr(tcPr, 'anchor')),
        insets: {
          left: universalMeasureToPt(attr(tcPr, 'marL')) ?? 7.2,
          top: universalMeasureToPt(attr(tcPr, 'marT')) ?? 3.6,
          right: universalMeasureToPt(attr(tcPr, 'marR')) ?? 7.2,
          bottom: universalMeasureToPt(attr(tcPr, 'marB')) ?? 3.6,
        },
        fill: parseFillChoice(tcPr, resolve) ?? { type: 'none' },
        borders: cellBorders(childOf(tcPr, 'tcBorders'), resolve),
        text: parseTextBodyNode(childOf(tc, 'txBody'), { theme, resolve, defaultSizePt: 18 }),
      })
      column += columnSpan
    }
    row += 1
  }

  return {
    columnWidthsPt,
    rowHeightsPt,
    firstRow: attrBool(tblPr, 'firstRow') ?? false,
    bandRow: attrBool(tblPr, 'bandRow') ?? false,
    firstColumn: attrBool(tblPr, 'firstColumn') ?? false,
    lastRow: attrBool(tblPr, 'lastRow') ?? false,
    lastColumn: attrBool(tblPr, 'lastColumn') ?? false,
    bandColumn: attrBool(tblPr, 'bandCol') ?? false,
    cells,
  }
}

/**
 * `a:tcBorders` overrides the table style for one cell. A side that is absent
 * falls back to the style, so `null` here means "not overridden" rather than
 * "no border" — the renderer has to distinguish the two to avoid drawing a
 * border the author removed.
 */
function cellBorders(node: Element | null, resolve: SchemeColorResolver): PptxTableBorders {
  if (!node) return NO_CELL_BORDERS
  return {
    left: parseLine(childOf(node, 'lnL'), resolve),
    right: parseLine(childOf(node, 'lnR'), resolve),
    top: parseLine(childOf(node, 'lnT'), resolve),
    bottom: parseLine(childOf(node, 'lnB'), resolve),
  }
}

function mergeFlag(value: string | undefined): boolean {
  return value === '1' || value === 'true'
}

function cellAnchor(value: string | undefined): PptxTableCell['anchor'] {
  if (value === 'ctr') return 'center'
  if (value === 'b') return 'bottom'
  return 'top'
}

/* -------------------------------------------------------------------------- */
/* Parts                                                                       */
/* -------------------------------------------------------------------------- */

interface TreePart {
  readonly shapes: readonly PptxShape[]
  readonly placeholders: Map<string, PlaceholderEntry>
  readonly background: PptxBackground
}

const EMPTY_TREE: TreePart = { shapes: [], placeholders: new Map(), background: { kind: 'none' } }

async function parseTreePart(
  pkg: OfficePackage,
  part: string,
  context: { theme: Theme; resolve: SchemeColorResolver },
  options: {
    readonly placeholders: ReadonlyMap<string, PlaceholderEntry>
    readonly chain: readonly (Element | null)[]
    readonly textStyles: TextStyleRoots
  }
): Promise<TreePart> {
  const root = await pkg.xml(part)
  if (!root) return { shapes: [], placeholders: new Map(), background: { kind: 'none' } }
  const cSld = childOf(root, 'cSld')
  const tree = childOf(cSld, 'spTree')
  const parsed = tree
    ? await parseShapeTree(tree, {
        pkg,
        part,
        theme: context.theme,
        resolve: context.resolve,
        placeholders: options.placeholders,
        textStyles: options.textStyles,
        chain: options.chain,
        depth: 0,
      })
    : { shapes: [], placeholders: new Map<string, PlaceholderEntry>() }
  return { shapes: parsed.shapes, placeholders: parsed.placeholders, background: parseBackground(cSld, context.resolve) }
}

async function parseThemePart(pkg: OfficePackage, part: string): Promise<Theme> {
  const xml = await pkg.xml(part)
  return xml ? Theme.parse(xml) : Theme.empty()
}

/* -------------------------------------------------------------------------- */
/* Presentation                                                                */
/* -------------------------------------------------------------------------- */

interface SlideContext {
  readonly layoutPart: string | null
  readonly masterPart: string | null
  readonly theme: Theme
  readonly colorMap: Readonly<Record<string, string>>
  readonly textStyleRoots: TextStyleRoots
}

/** `p:clrMap` is a bag of attributes, not child elements. */
function readColorMap(root: Element | null): Record<string, string> {
  const node = childOf(root, 'clrMap')
  const map: Record<string, string> = {}
  if (!node) return map
  for (const attribute of node.attributes) {
    if (attribute.name === 'xmlns' || attribute.name.startsWith('xmlns:')) continue
    map[attribute.localName] = attribute.value
  }
  return map
}

/** `p:clrMapOvr` either replaces the map or defers to the master. */
function readColorMapOverride(root: Element | null): Record<string, string> | null {
  const override = childOf(childOf(root, 'clrMapOvr'), 'overrideClrMapping')
  if (!override) return null
  const map: Record<string, string> = {}
  for (const attribute of override.attributes) {
    if (attribute.name === 'xmlns' || attribute.name.startsWith('xmlns:')) continue
    map[attribute.localName] = attribute.value
  }
  return Object.keys(map).length > 0 ? map : null
}

async function readTextStyles(pkg: OfficePackage, masterPart: string | null): Promise<TextStyleRoots> {
  if (!masterPart) return { title: null, body: null, other: null }
  const root = await pkg.xml(masterPart)
  const txStyles = childOf(root, 'txStyles')
  if (!txStyles) return { title: null, body: null, other: null }
  return {
    title: childOf(txStyles, 'titleStyle'),
    body: childOf(txStyles, 'bodyStyle'),
    other: childOf(txStyles, 'otherStyle'),
  }
}

async function slideContext(pkg: OfficePackage, slidePart: string): Promise<SlideContext> {
  const layoutPart = await pkg.followRelationship(slidePart, REL.slideLayout, SLIDE_CHAIN)
  const masterPart = await pkg.followRelationship(slidePart, REL.slideMaster, SLIDE_CHAIN)
  const themePart = await pkg.followRelationship(slidePart, REL.theme, SLIDE_CHAIN)
  const masterRoot = masterPart ? await pkg.xml(masterPart) : null
  return {
    layoutPart,
    masterPart,
    theme: await parseThemePart(pkg, themePart ?? (masterPart ? await pkg.themeFor(masterPart) : '') ?? ''),
    colorMap: readColorMap(masterRoot),
    textStyleRoots: await readTextStyles(pkg, masterPart),
  }
}

/**
 * A layout's placeholders are *templates*, not background art: painting them
 * under a slide that also defines the same placeholder shows the prompt text
 * twice. Only non-placeholder shapes are promoted to a slide's background.
 */
function backgroundShapes(shapes: readonly PptxShape[]): PptxShape[] {
  return shapes.filter((shape) => !shape.placeholder)
}

async function parseSlide(pkg: OfficePackage, part: string, index: number): Promise<PptxSlide> {
  const context = await slideContext(pkg, part)
  const root = await pkg.xml(part)
  const cSld = root ? childOf(root, 'cSld') : null
  const colorMap = readColorMapOverride(cSld) ?? context.colorMap
  const resolve = context.theme.resolverFor(colorMap)
  const base = { pkg, theme: context.theme, resolve }

  // Master → layout → slide, each inheriting the placeholder registry and text
  // chain of the one above it, so a slide placeholder can resolve geometry all
  // the way to the master.
  const master = context.masterPart
    ? await parseTreePart(pkg, context.masterPart, base, {
        placeholders: new Map(),
        chain: [],
        textStyles: context.textStyleRoots,
      })
    : EMPTY_TREE

  const layout = context.layoutPart
    ? await parseTreePart(pkg, context.layoutPart, base, {
        placeholders: master.placeholders,
        chain: [],
        textStyles: context.textStyleRoots,
      })
    : EMPTY_TREE

  const tree = childOf(cSld, 'spTree')
  const own = tree
    ? (
        await parseShapeTree(tree, {
          ...base,
          part,
          placeholders: layout.placeholders.size > 0 ? layout.placeholders : master.placeholders,
          textStyles: context.textStyleRoots,
          chain: [],
          depth: 0,
        })
      ).shapes
    : []

  const showMasterShapes = attrBool(root, 'showMasterSp') ?? true
  const shapes: PptxShape[] = []
  if (showMasterShapes) {
    shapes.push(...backgroundShapes(master.shapes), ...backgroundShapes(layout.shapes))
  }
  shapes.push(...own)

  return {
    index,
    part,
    layoutPart: context.layoutPart,
    masterPart: context.masterPart,
    name: attr(cSld, 'name') ?? `Slide ${index + 1}`,
    showMasterShapes,
    showMasterBackground: attrBool(root, 'showMasterSp') !== false,
    background: pickBackground(parseBackground(cSld, resolve), layout.background, master.background),
    shapes,
    notesPart: await notesPartOf(pkg, part),
  }
}

async function notesPartOf(pkg: OfficePackage, part: string): Promise<string | null> {
  const rels = await pkg.relationships(part)
  return rels.find((rel) => rel.type.endsWith(REL.notesSlide))?.partName ?? null
}

function pickBackground(own: PptxBackground, layout: PptxBackground, master: PptxBackground): PptxBackground {
  if (own.kind !== 'none') return own
  if (layout.kind !== 'none') return layout
  return master
}

/**
 * Parse a presentation into the resolved model.
 *
 * Slide order comes from `p:sldIdLst`, not from part numbering: a deck whose
 * slides were inserted or reordered keeps `slide1..slide5.xml` but presents
 * them in the order the list declares. A deck with no list is malformed but
 * recoverable, so the conventional part names are used in numeric order.
 */
export async function parsePresentation(pkg: OfficePackage, name: string): Promise<PptxPresentation> {
  const root = await pkg.requireXml(pkg.mainPart)
  const sizeNode = childOf(root, 'sldSz')
  const size: PptxSlideSize = {
    widthPt: universalMeasureToPt(attr(sizeNode, 'cx')) ?? 720,
    heightPt: universalMeasureToPt(attr(sizeNode, 'cy')) ?? 540,
    type: attr(sizeNode, 'type') ?? null,
  }

  const notesNode = childOf(root, 'notesSz')
  const notesSize: PptxNotesSize | null = notesNode
    ? {
        widthPt: universalMeasureToPt(attr(notesNode, 'cx')) ?? 0,
        heightPt: universalMeasureToPt(attr(notesNode, 'cy')) ?? 0,
      }
    : null

  const parts: string[] = []
  for (const entry of childrenOf(childOf(root, 'sldIdLst'), 'sldId')) {
    const part = await pkg.targetOf(pkg.mainPart, relAttr(entry, 'id'))
    if (part) parts.push(part)
  }
  if (parts.length === 0) {
    parts.push(
      ...pkg
        .partNames()
        .filter((part) => /^ppt\/slides\/slide\d+\.xml$/.test(part))
        .sort((left, right) => slideNumber(left) - slideNumber(right))
    )
  }
  if (parts.length === 0) {
    throw new OoxmlError('parse-failed', 'The presentation does not contain any slides.', pkg.mainPart)
  }

  const slides: PptxSlide[] = []
  for (let index = 0; index < parts.length; index += 1) {
    slides.push(await parseSlide(pkg, parts[index] as string, index))
  }

  const first = await slideContext(pkg, parts[0] as string)
  return { name, size, notesSize, slides, theme: first.theme, firstSlideNumber: 1 }
}

function slideNumber(part: string): number {
  const match = /slide(\d+)\.xml$/.exec(part)
  return match ? Number(match[1]) : 0
}
