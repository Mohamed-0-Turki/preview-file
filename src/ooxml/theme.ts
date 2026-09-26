/**
 * `theme/theme1.xml` — the shared Office design system.
 *
 * Every visual default in a Word, Excel or PowerPoint file is expressed as a
 * *reference* into the theme (a colour slot, a major/minor font, or one of the
 * three nine-entry style lists). Parsing the theme once and resolving those
 * references centrally is what lets a document change theme and repaint
 * correctly, and it is the largest single fidelity win available in this
 * layer: without it every shape falls back to hard-coded Office colours.
 */

import {
  BLACK,
  WHITE,
  colorChoiceIn,
  colorChoiceOf,
  hexToColor,
  parseColorElement,
  type OfficeColor,
  type SchemeColorResolver,
} from './color.js'
import { attr, attrNumber, attrInt, childOf, childrenOf, descendantsOf, relAttr } from './xml.js'

const EMU_PER_POINT = 12700
const SIXTY_THOUSANDTHS_PER_DEGREE = 60000
const ONE_HUNDRED_THOUSANDTHS_PER_PERCENT = 100000

export type ColorSlot =
  | 'dk1'
  | 'lt1'
  | 'dk2'
  | 'lt2'
  | 'accent1'
  | 'accent2'
  | 'accent3'
  | 'accent4'
  | 'accent5'
  | 'accent6'
  | 'hlink'
  | 'folHlink'

export interface ThemeFonts {
  /** Latin typeface, e.g. `Calibri Light`. */
  readonly latin: string
  readonly eastAsian: string
  readonly complexScript: string
  /** `script="Hans" -> "SimSun"` overrides, for CJK fallbacks. */
  readonly scripts: Readonly<Record<string, string>>
}

export interface GradientStop {
  /** 0..100000, as authored. */
  readonly position: number
  readonly color: OfficeColor
}

export interface ThemeFill {
  readonly type: 'none' | 'solid' | 'gradient' | 'pattern' | 'blip' | 'group'
  readonly color?: OfficeColor
  readonly stops?: readonly GradientStop[]
  /** Linear gradient angle in degrees, from `a:lin/@ang`. */
  readonly angle?: number
  /** `pattFill/@prst`, e.g. `ltUpDiag`. */
  readonly pattern?: string
  readonly patternColor?: OfficeColor
  readonly backgroundColor?: OfficeColor
  /** Embedded image relationship id, for `blipFill`. */
  readonly blipRelId?: string
  readonly stretch?: boolean
  readonly tileRect?: { l: number; t: number; r: number; b: number }
}

export type LineCap = 'flat' | 'round' | 'square'
export type LineCompound = 'single' | 'double' | 'thickThin' | 'thinThick' | 'tri'

export interface ThemeLine {
  readonly widthPt: number
  readonly cap: LineCap
  readonly dash: string
  readonly compound: LineCompound
  readonly align: 'ctr' | 'in' | undefined
  readonly color?: OfficeColor
  /** A line may also be a gradient; a solid line carries `color` only. */
  readonly fill?: ThemeFill
}

export interface ShadowEffect {
  readonly kind: 'outer' | 'inner'
  /** DrawingML `blurRad`, in points. */
  readonly blurPt: number
  readonly distancePt: number
  /** DrawingML `dir`, in 60000ths of a degree. */
  readonly direction: number
  readonly color: OfficeColor
  readonly sx?: number
  readonly sy?: number
  readonly kx?: number
  readonly ky?: number
  readonly align?: string
  readonly rotWithShape: boolean
}

export interface GlowEffect {
  readonly radiusPt: number
  readonly color: OfficeColor
}

export interface ReflectionEffect {
  readonly blurPt: number
  readonly startAlpha: number
  readonly startPosition: number
  readonly endAlpha: number
  readonly endPosition: number
  readonly distancePt: number
  readonly direction: number
  readonly fadeDirection: number
  readonly sx: number
  readonly sy: number
  readonly kx: number
  readonly ky: number
  readonly align: string
  readonly rotWithShape: boolean
}

export interface ThemeEffectStyle {
  readonly shadows: readonly ShadowEffect[]
  readonly glows: readonly GlowEffect[]
  readonly reflection?: ReflectionEffect
}

const DEFAULT_MAJOR_LATIN = 'Calibri Light'
const DEFAULT_MINOR_LATIN = 'Calibri'
/** Office's own fallbacks for an incomplete theme. */
const DEFAULT_DK2 = '44546A'
const DEFAULT_LT2 = 'E7E6E6'
const DEFAULT_ACCENT1 = '4472C4'

const is = (el: Element, localName: string): boolean => el.localName === localName
const degrees = (value: string | null | undefined): number => (value === null || value === undefined ? 0 : Number(value) / SIXTY_THOUSANDTHS_PER_DEGREE)
const percent = (value: string | null | undefined, fallback = 0): number =>
  value === null || value === undefined ? fallback : Number(value) / (ONE_HUNDRED_THOUSANDTHS_PER_PERCENT / 100)

function parseFonts(node: Element | null, fallback: string): ThemeFonts {
  if (!node) return { latin: fallback, eastAsian: '', complexScript: '', scripts: {} }
  const scripts: Record<string, string> = {}
  for (const font of childrenOf(node, 'font')) {
    const script = attr(font, 'script')
    const typeface = attr(font, 'typeface')
    if (script && typeface) scripts[script] = typeface
  }
  const latin = attr(childOf(node, 'latin'), 'typeface')
  return {
    latin: latin && latin !== '' ? latin : fallback,
    eastAsian: attr(childOf(node, 'ea'), 'typeface') ?? '',
    complexScript: attr(childOf(node, 'cs'), 'typeface') ?? '',
    scripts,
  }
}

function parseTile(src: Element | null): { l: number; t: number; r: number; b: number } | undefined {
  if (!src) return undefined
  return {
    l: attrInt(src, 'l') ?? 0,
    t: attrInt(src, 't') ?? 0,
    r: attrInt(src, 'r') ?? 0,
    b: attrInt(src, 'b') ?? 0,
  }
}

function parseFill(node: Element | null, resolve: SchemeColorResolver): ThemeFill | null {
  if (!node) return null
  if (is(node, 'noFill')) return { type: 'none' }
  if (is(node, 'solidFill')) {
    return { type: 'solid', color: parseColorElement(colorChoiceIn(node, 'solidFill'), resolve) ?? undefined }
  }
  if (is(node, 'gradFill')) {
    const stops: GradientStop[] = []
    const list = childOf(node, 'gsLst')
    for (const gs of childrenOf(list)) {
      const color = parseColorElement(gs.firstElementChild, resolve)
      if (color) stops.push({ position: attrInt(gs, 'pos') ?? 0, color })
    }
    const linear = childOf(node, 'lin')
    const path = childOf(node, 'path')
    return {
      type: 'gradient',
      stops,
      angle: linear ? degrees(attr(linear, 'ang')) : path ? 90 : undefined,
    }
  }
  if (is(node, 'pattFill')) {
    return {
      type: 'pattern',
      pattern: attr(node, 'prst') ?? 'pct5',
      patternColor: parseColorElement(colorChoiceIn(node, 'fgClr'), resolve) ?? undefined,
      backgroundColor: parseColorElement(colorChoiceIn(node, 'bgClr'), resolve) ?? undefined,
    }
  }
  if (is(node, 'blipFill')) {
    const blip = descendantsOf(node, 'blip')[0]
    return {
      type: 'blip',
      blipRelId: relAttr(blip, 'embed'),
      stretch: childOf(node, 'stretch') !== null,
      tileRect: parseTile(childOf(node, 'srcRect')),
    }
  }
  if (is(node, 'grpFill')) return { type: 'group' }
  return null
}

function parseLine(node: Element, resolve: SchemeColorResolver): ThemeLine | null {
  if (is(node, 'noFill')) return { widthPt: 0, cap: 'flat', dash: 'solid', compound: 'single', align: undefined }
  const width = attrNumber(node, 'w')
  const cap = attr(node, 'cap')
  const compound = attr(node, 'cmpd')
  const align = attr(node, 'algn')
  return {
    widthPt: width === undefined ? 0.75 : width / EMU_PER_POINT,
    cap: cap === 'rnd' ? 'round' : cap === 'sq' ? 'square' : 'flat',
    dash: attr(childOf(node, 'prstDash'), 'val') ?? 'solid',
    compound: (compound === 'dbl' || compound === 'thickThin' || compound === 'thinThick' || compound === 'tri'
      ? compound
      : 'single') as LineCompound,
    align: align === 'ctr' || align === 'in' ? align : undefined,
    color: parseColorElement(colorChoiceIn(node, 'solidFill'), resolve) ?? undefined,
    fill: parseFill(childOf(node, 'gradFill') ?? childOf(node, 'pattFill'), resolve) ?? undefined,
  }
}

function parseShadow(node: Element, kind: 'outer' | 'inner'): ShadowEffect | null {
  const color = parseColorElement(node.firstElementChild, () => BLACK)
  if (!color) return null
  return {
    kind,
    blurPt: (attrNumber(node, 'blurRad') ?? 0) / EMU_PER_POINT,
    distancePt: (attrNumber(node, 'dist') ?? 0) / EMU_PER_POINT,
    direction: attrNumber(node, 'dir') ?? 0,
    color,
    sx: attrNumber(node, 'sx') === undefined ? undefined : (attrNumber(node, 'sx') as number) / ONE_HUNDRED_THOUSANDTHS_PER_PERCENT,
    sy: attrNumber(node, 'sy') === undefined ? undefined : (attrNumber(node, 'sy') as number) / ONE_HUNDRED_THOUSANDTHS_PER_PERCENT,
    kx: attrNumber(node, 'kx') === undefined ? undefined : (attrNumber(node, 'kx') as number) / SIXTY_THOUSANDTHS_PER_DEGREE,
    ky: attrNumber(node, 'ky') === undefined ? undefined : (attrNumber(node, 'ky') as number) / SIXTY_THOUSANDTHS_PER_DEGREE,
    align: attr(node, 'algn'),
    rotWithShape: attr(node, 'rotWithShape') !== '0',
  }
}

function parseGlow(node: Element): GlowEffect | null {
  const color = parseColorElement(node.firstElementChild, () => BLACK)
  if (!color) return null
  return { radiusPt: (attrNumber(node, 'rad') ?? 0) / EMU_PER_POINT, color }
}

function parseReflection(node: Element): ReflectionEffect {
  return {
    blurPt: (attrNumber(node, 'blurRad') ?? 0) / EMU_PER_POINT,
    startAlpha: percent(attr(node, 'stA')),
    startPosition: percent(attr(node, 'stPos')),
    endAlpha: percent(attr(node, 'endA')),
    endPosition: percent(attr(node, 'endPos')),
    distancePt: (attrNumber(node, 'dist') ?? 0) / EMU_PER_POINT,
    direction: attrNumber(node, 'dir') ?? 0,
    fadeDirection: attrNumber(node, 'fadeDir') ?? 0,
    sx: percent(attr(node, 'sx'), 1),
    sy: percent(attr(node, 'sy'), 1),
    kx: (attrNumber(node, 'kx') ?? 0) / SIXTY_THOUSANDTHS_PER_DEGREE,
    ky: (attrNumber(node, 'ky') ?? 0) / SIXTY_THOUSANDTHS_PER_DEGREE,
    align: attr(node, 'algn') ?? 'bl',
    rotWithShape: attr(node, 'rotWithShape') !== '0',
  }
}

/**
 * A parsed theme. The three style lists are stored as plain arrays so a
 * `fillRef idx="1"` is a clamped index rather than a lookup with sentinel
 * cases: index 0 means "no theme reference", which callers treat as
 * "use the shape's own fill".
 */
export class Theme {
  readonly colors: Readonly<Record<string, OfficeColor>>
  readonly majorFonts: ThemeFonts
  readonly minorFonts: ThemeFonts
  readonly fills: readonly (ThemeFill | null)[]
  readonly lines: readonly (ThemeLine | null)[]
  readonly effects: readonly ThemeEffectStyle[]

  private constructor(init: {
    colors: Record<string, OfficeColor>
    majorFonts: ThemeFonts
    minorFonts: ThemeFonts
    fills: (ThemeFill | null)[]
    lines: (ThemeLine | null)[]
    effects: ThemeEffectStyle[]
  }) {
    this.colors = init.colors
    this.majorFonts = init.majorFonts
    this.minorFonts = init.minorFonts
    this.fills = init.fills
    this.lines = init.lines
    this.effects = init.effects
  }

  /** The Office 2013+ default theme, used when a document references none. */
  static empty(): Theme {
    return new Theme({
      colors: {
        dk1: BLACK,
        lt1: WHITE,
        dk2: hexToColor(DEFAULT_DK2) ?? BLACK,
        lt2: hexToColor(DEFAULT_LT2) ?? WHITE,
        accent1: hexToColor(DEFAULT_ACCENT1) ?? BLACK,
        accent2: hexToColor('ED7D31') ?? BLACK,
        accent3: hexToColor('A5A5A5') ?? BLACK,
        accent4: hexToColor('FFC000') ?? BLACK,
        accent5: hexToColor('5B9BD5') ?? BLACK,
        accent6: hexToColor('70AD47') ?? BLACK,
        hlink: hexToColor('0563C1') ?? BLACK,
        folHlink: hexToColor('954F72') ?? BLACK,
      },
      majorFonts: parseFonts(null, DEFAULT_MAJOR_LATIN),
      minorFonts: parseFonts(null, DEFAULT_MINOR_LATIN),
      fills: [{ type: 'solid', color: hexToColor(DEFAULT_ACCENT1) ?? BLACK }],
      lines: [{ widthPt: 0.75, cap: 'flat', dash: 'solid', compound: 'single', align: undefined, color: BLACK }],
      effects: [{ shadows: [], glows: [] }],
    })
  }

  static parse(root: Element | null | undefined): Theme {
    if (!root) return Theme.empty()
    const elements = childOf(root, 'themeElements') ?? root
    const clrScheme = childOf(elements, 'clrScheme')
    const fontScheme = childOf(elements, 'fontScheme')
    const fmtScheme = childOf(elements, 'fmtScheme')

    // Slots are resolved in document order so a `sysClr lastClr` is read
    // directly and a `schemeClr` inside a slot can still see its neighbours.
    const colors: Record<string, OfficeColor> = {}
    const resolve: SchemeColorResolver = (slot) => colors[slot] ?? null
    for (const slot of childrenOf(clrScheme)) {
      // A slot wraps its colour choice: `<a:dk1><a:sysClr lastClr="000000"/>`.
      const choice = colorChoiceOf(slot)
      // `lastClr` is the resolved sRGB; without it a `sysClr` is only a name.
      const color = choice && is(choice, 'sysClr') ? hexToColor(attr(choice, 'lastClr') ?? 'FFFFFF') : null
      const resolved = color ?? parseColorElement(choice, resolve)
      if (resolved) colors[slot.localName] = resolved
    }
    colors.dk1 ??= BLACK
    colors.lt1 ??= WHITE
    colors.dk2 ??= hexToColor(DEFAULT_DK2) ?? BLACK
    colors.lt2 ??= hexToColor(DEFAULT_LT2) ?? WHITE

    const fills: (ThemeFill | null)[] = []
    for (const node of childrenOf(childOf(fmtScheme, 'fillStyleLst'))) {
      fills.push(parseFill(node, resolve))
    }
    const lines: (ThemeLine | null)[] = []
    for (const node of childrenOf(childOf(fmtScheme, 'lnStyleLst'))) {
      lines.push(parseLine(node, resolve))
    }
    const effects: ThemeEffectStyle[] = []
    for (const node of childrenOf(childOf(fmtScheme, 'effectStyleLst'))) {
      const shadows: ShadowEffect[] = []
      const glows: GlowEffect[] = []
      let reflection: ReflectionEffect | undefined
      for (const effect of childrenOf(node)) {
        if (is(effect, 'outerShdw') || is(effect, 'innerShdw')) {
          const shadow = parseShadow(effect, is(effect, 'outerShdw') ? 'outer' : 'inner')
          if (shadow) shadows.push(shadow)
        } else if (is(effect, 'glow')) {
          const glow = parseGlow(effect)
          if (glow) glows.push(glow)
        } else if (is(effect, 'reflection')) {
          reflection = parseReflection(effect)
        }
      }
      effects.push({ shadows, glows, reflection })
    }

    return new Theme({
      colors,
      majorFonts: parseFonts(childOf(fontScheme, 'majorFont'), DEFAULT_MAJOR_LATIN),
      minorFonts: parseFonts(childOf(fontScheme, 'minorFont'), DEFAULT_MINOR_LATIN),
      fills,
      lines,
      effects,
    })
  }

  color(slot: string | null | undefined): OfficeColor | null {
    if (!slot) return null
    return this.colors[slot] ?? null
  }

  /**
   * A resolver for `schemeClr`, honouring the host colour map. The map
   * translates the mapped slots (`bg1`, `tx1`, `bg2`, `tx2`) into theme slots
   * and swaps the text/background pair for dark themes; without it a Word
   * document in a dark theme renders light-on-light.
   *
   * `phClr` deliberately resolves to `null`: only the consuming shape knows
   * which text colour it is standing in for, so the caller's default wins.
   */
  resolverFor(map: Readonly<Record<string, string>> | null | undefined): SchemeColorResolver {
    return (slot) => {
      if (slot === 'phClr') return null
      return this.colors[map?.[slot] ?? slot] ?? null
    }
  }

  font(kind: 'major' | 'minor'): ThemeFonts {
    return kind === 'major' ? this.majorFonts : this.minorFonts
  }

  /** Fill style by 1-based index (`fillRef idx="1"`); 0 means "no reference". */
  fill(index: number | null | undefined): ThemeFill | null {
    if (!index) return null
    return this.fills[Math.max(0, index - 1)] ?? null
  }

  /** Line style by 1-based index (`lnRef idx="2"`); 0 means "no reference". */
  line(index: number | null | undefined): ThemeLine | null {
    if (!index) return null
    return this.lines[Math.max(0, index - 1)] ?? null
  }

  /** Effect style by 1-based index (`effectRef idx="3"`); 0 means "no reference". */
  effect(index: number | null | undefined): ThemeEffectStyle | null {
    if (!index) return null
    return this.effects[Math.max(0, index - 1)] ?? null
  }
}
