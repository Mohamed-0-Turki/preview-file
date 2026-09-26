import { childOf } from './xml.js'

/**
 * Colour parsing and resolution shared by every host format.
 *
 * OOXML expresses colour in five interchangeable ways (`srgbClr`, `sysClr`,
 * `scrgbClr`, `hslClr`, `prstClr`) and — crucially — a `schemeClr` may name
 * either a theme colour slot (`accent1`) or a *mapped* slot (`bg1`, `tx2`) that
 * only resolves through the host's colour map. Getting that indirection right
 * is what makes a deck follow its theme instead of showing hard-coded
 * fallbacks, so it lives in one place for Word, Excel and PowerPoint.
 */

export interface OfficeColor {
  readonly r: number
  readonly g: number
  readonly b: number
  /** 0 = fully transparent, 1 = opaque. */
  readonly a: number
}

export interface ColorTransforms {
  readonly alpha?: number
  readonly tint?: number
  readonly shade?: number
  readonly lumMod?: number
  readonly lumOff?: number
  readonly satMod?: number
  readonly hueMod?: number
  readonly red?: number
  readonly green?: number
  readonly blue?: number
  readonly gamma?: number
  readonly inverse?: boolean
  readonly gray?: number
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value))
const clamp255 = (value: number): number => Math.min(255, Math.max(0, Math.round(value)))

/** `ST_PresetColorVal` → sRGB. Rare in modern documents but legal everywhere. */
export const PRESET_COLORS: Readonly<Record<string, string>> = {
  aliceBlue: 'F0F8FF',
  antiqueWhite: 'FAEBD7',
  aqua: '00FFFF',
  aquamarine: '7FFFD4',
  azure: 'F0FFFF',
  beige: 'F5F5DC',
  bisque: 'FFE4C4',
  black: '000000',
  blanchedAlmond: 'FFEBCD',
  blue: '0000FF',
  blueViolet: '8A2BE2',
  brown: 'A52A2A',
  burlyWood: 'DEB887',
  cadetBlue: '5F9EA0',
  chartreuse: '7FFF00',
  chocolate: 'D2691E',
  coral: 'FF7F50',
  cornflowerBlue: '6495ED',
  cornsilk: 'FFF8DC',
  crimson: 'DC143C',
  cyan: '00FFFF',
  darkBlue: '00008B',
  darkCyan: '008B8B',
  darkGoldenrod: 'B8860B',
  darkGray: 'A9A9A9',
  darkGreen: '006400',
  darkKhaki: 'BDB76B',
  darkMagenta: '8B008B',
  darkOliveGreen: '556B2F',
  darkOrange: 'FF8C00',
  darkOrchid: '9932CC',
  darkRed: '8B0000',
  darkSalmon: 'E9967A',
  darkSeaGreen: '8FBC8F',
  darkSlateBlue: '483D8B',
  darkSlateGray: '2F4F4F',
  darkTurquoise: '00CED1',
  darkViolet: '9400D3',
  deepPink: 'FF1493',
  deepSkyBlue: '00BFFF',
  dimGray: '696969',
  dodgerBlue: '1E90FF',
  firebrick: 'B22222',
  floralWhite: 'FFFAF0',
  forestGreen: '228B22',
  gainsboro: 'DCDCDC',
  ghostWhite: 'F8F8FF',
  gold: 'FFD700',
  goldenrod: 'DAA520',
  gray: '808080',
  green: '008000',
  greenYellow: 'ADFF2F',
  honeydew: 'F0FFF0',
  hotPink: 'FF69B4',
  indianRed: 'CD5C5C',
  indigo: '4B0082',
  ivory: 'FFFFF0',
  khaki: 'F0E68C',
  lavender: 'E6E6FA',
  lavenderBlush: 'FFF0F5',
  lawnGreen: '7CFC00',
  lemonChiffon: 'FFFACD',
  lightBlue: 'ADD8E6',
  lightCoral: 'F08080',
  lightCyan: 'E0FFFF',
  lightGoldenrodYellow: 'FAFAD2',
  lightGray: 'D3D3D3',
  lightGreen: '90EE90',
  lightPink: 'FFB6C1',
  lightSalmon: 'FFA07A',
  lightSeaGreen: '20B2AA',
  lightSkyBlue: '87CEFA',
  lightSlateGray: '778899',
  lightSteelBlue: 'B0C4DE',
  lightYellow: 'FFFFE0',
  lime: '00FF00',
  limeGreen: '32CD32',
  linen: 'FAF0E6',
  magenta: 'FF00FF',
  maroon: '800000',
  mediumAquamarine: '66CDAA',
  mediumBlue: '0000CD',
  mediumOrchid: 'BA55D3',
  mediumPurple: '9370DB',
  mediumSeaGreen: '3CB371',
  mediumSlateBlue: '7B68EE',
  mediumSpringGreen: '00FA9A',
  mediumTurquoise: '48D1CC',
  mediumVioletRed: 'C71585',
  midnightBlue: '191970',
  mintCream: 'F5FFFA',
  mistyRose: 'FFE4E1',
  moccasin: 'FFE4B5',
  navajoWhite: 'FFDEAD',
  navy: '000080',
  oldLace: 'FDF5E6',
  olive: '808000',
  oliveDrab: '6B8E23',
  orange: 'FFA500',
  orangered: 'FF4500',
  orchid: 'DA70D6',
  paleGoldenrod: 'EEE8AA',
  paleGreen: '98FB98',
  paleTurquoise: 'AFEEEE',
  paleVioletRed: 'DB7093',
  papayaWhip: 'FFEFD5',
  peachPuff: 'FFDAB9',
  peru: 'CD853F',
  pink: 'FFC0CB',
  plum: 'DDA0DD',
  powderBlue: 'B0E0E6',
  purple: '800080',
  red: 'FF0000',
  rosyBrown: 'BC8F8F',
  royalBlue: '4169E1',
  saddleBrown: '8B4513',
  salmon: 'FA8072',
  sandyBrown: 'F4A460',
  seaGreen: '2E8B57',
  seashell: 'FFF5EE',
  sienna: 'A0522D',
  silver: 'C0C0C0',
  skyBlue: '87CEEB',
  slateBlue: '6A5ACD',
  slateGray: '708090',
  snow: 'FFFAFA',
  springGreen: '00FF7F',
  steelBlue: '4682B4',
  tan: 'D2B48C',
  teal: '008080',
  thistle: 'D8BFD8',
  tomato: 'FF6347',
  turquoise: '40E0D0',
  violet: 'EE82EE',
  wheat: 'F5DEB3',
  white: 'FFFFFF',
  whiteSmoke: 'F5F5F5',
  yellow: 'FFFF00',
  yellowGreen: '9ACD32',
}

/** Windows system colours Word writes for `dk1`/`lt1` when no theme is present. */
const SYSTEM_COLORS: Readonly<Record<string, string>> = {
  window: 'FFFFFF',
  windowtext: '000000',
  windowText: '000000',
  background: 'FFFFFF',
  captiontext: '000000',
  graytext: '808080',
  highlight: '3399FF',
  highlighttext: 'FFFFFF',
  btnface: 'F0F0F0',
  btntext: '000000',
  menutext: '000000',
  infotext: '000000',
  '3ddkshadow': '696969',
  '3dlight': 'E3E3E3',
  '3dhighlight': 'FFFFFF',
  activeborder: 'B4B4B4',
  activecaption: '99B4D1',
  appworkspace: 'ABABAB',
  btnshadow: 'A0A0A0',
  gradientactivecaption: 'B9D1EA',
  gradientinactivecaption: 'D7E4F2',
  inactiveborder: 'F4F7FC',
  inactivecaption: 'BFCDDB',
  inactivecaptiontext: '434E54',
  infobk: 'FFFFE1',
  menu: 'F0F0F0',
  menubar: 'F0F0F0',
  scrollbar: 'C8C8C8',
}

export function hexToColor(hex: string, alpha = 1): OfficeColor | null {
  let value = hex.trim()
  if (value.startsWith('#')) value = value.slice(1)
  if (value.length === 3) {
    value = value[0] + value[0] + value[1] + value[1] + value[2] + value[2]
  }
  if (value.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(value)) return null
  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16),
    a: clamp01(alpha),
  }
}

/** SpreadsheetML writes colours as `FFRRGGBB`; the leading byte is alpha. */
export function argbToColor(value: string): OfficeColor | null {
  let raw = value.trim()
  if (raw.startsWith('#')) raw = raw.slice(1)
  if (raw.length === 6) return hexToColor(raw)
  if (raw.length === 8) {
    const alpha = Number.parseInt(raw.slice(0, 2), 16) / 255
    return hexToColor(raw.slice(2, 8), alpha)
  }
  return null
}

export function colorToHex(color: OfficeColor): string {
  const hex = (value: number): string => clamp255(value).toString(16).padStart(2, '0')
  return `${hex(color.r)}${hex(color.g)}${hex(color.b)}`.toUpperCase()
}

/** `rgb()` / `rgba()` string ready for a style attribute. */
export function colorToCss(color: OfficeColor): string {
  if (color.a >= 1) return `#${colorToHex(color)}`
  const alpha = Math.round(color.a * 1000) / 1000
  return `rgba(${clamp255(color.r)},${clamp255(color.g)},${clamp255(color.b)},${alpha})`
}

function rgbToHsl(color: OfficeColor): { h: number; s: number; l: number } {
  const r = color.r / 255
  const g = color.g / 255
  const b = color.b / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l }
  const delta = max - min
  const s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min)
  let h: number
  if (max === r) h = ((g - b) / delta + (g < b ? 6 : 0)) / 6
  else if (max === g) h = ((b - r) / delta + 2) / 6
  else h = ((r - g) / delta + 4) / 6
  return { h: h * 360, s, l }
}

function hslToRgb(h: number, s: number, l: number, a: number): OfficeColor {
  const hue = ((h % 360) + 360) % 360
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1))
  const m = l - c / 2
  let rgb: [number, number, number]
  if (hue < 60) rgb = [c, x, 0]
  else if (hue < 120) rgb = [x, c, 0]
  else if (hue < 180) rgb = [0, c, x]
  else if (hue < 240) rgb = [0, x, c]
  else if (hue < 300) rgb = [x, 0, c]
  else rgb = [c, 0, x]
  return {
    r: clamp255((rgb[0] + m) * 255),
    g: clamp255((rgb[1] + m) * 255),
    b: clamp255((rgb[2] + m) * 255),
    a: clamp01(a),
  }
}

/**
 * Apply the DrawingML colour transform list. `tint`, `lumMod`/`lumOff` and
 * `satMod` are defined in HSL space and applied in document order, which is
 * why the list is walked rather than folded into a formula.
 */
export function applyColorTransforms(color: OfficeColor, transforms: ColorTransforms): OfficeColor {
  let out = color
  const hsl = rgbToHsl(out)
  let { h, s, l } = hsl

  if (transforms.tint !== undefined) {
    const tint = clamp01(transforms.tint / 100000)
    l = tint < 0.5 ? l * (tint / 0.5) : l + (1 - l) * ((tint - 0.5) / 0.5)
  }
  if (transforms.satMod !== undefined) {
    s = clamp01(s * (transforms.satMod / 100000))
  }
  if (transforms.lumMod !== undefined) {
    l = l * (transforms.lumMod / 100000)
  }
  if (transforms.lumOff !== undefined) {
    l = l + transforms.lumOff / 100000
  }
  if (transforms.shade !== undefined) {
    const shade = clamp01(transforms.shade / 100000)
    return { r: clamp255(out.r * shade), g: clamp255(out.g * shade), b: clamp255(out.b * shade), a: out.a }
  }
  if (transforms.hueMod !== undefined) {
    h = h * (transforms.hueMod / 60000)
  }

  out = hslToRgb(h, s, clamp01(l), out.a)

  if (transforms.red !== undefined) out = { ...out, r: clamp255(transforms.red / 100000 * 255) }
  if (transforms.green !== undefined) out = { ...out, g: clamp255(transforms.green / 100000 * 255) }
  if (transforms.blue !== undefined) out = { ...out, b: clamp255(transforms.blue / 100000 * 255) }
  if (transforms.inverse) {
    out = { ...out, r: 255 - out.r, g: 255 - out.g, b: 255 - out.b }
  }
  if (transforms.gray !== undefined) {
    // `a:gray` desaturates toward luminance by `val` percent of the way.
    const gray = 0.299 * out.r + 0.587 * out.g + 0.114 * out.b
    out = { ...out, r: clamp255(gray), g: clamp255(gray), b: clamp255(gray) }
  }
  if (transforms.alpha !== undefined) {
    out = { ...out, a: clamp01(out.a * (transforms.alpha / 100000)) }
  }
  return out
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] }

/** The transform children of a colour element, in authored order. */
export function parseColorTransforms(el: Element): ColorTransforms {
  const transforms: Mutable<ColorTransforms> = {}
  for (let node = el.firstElementChild; node; node = node.nextElementSibling) {
    const raw = node.getAttribute('val')
    const value = raw === null ? Number.NaN : Number(raw)
    switch (node.localName) {
      case 'alpha':
        transforms.alpha = value
        break
      case 'tint':
        transforms.tint = value
        break
      case 'shade':
        transforms.shade = value
        break
      case 'lumMod':
        transforms.lumMod = value
        break
      case 'lumOff':
        transforms.lumOff = value
        break
      case 'satMod':
        transforms.satMod = value
        break
      case 'hueMod':
        transforms.hueMod = value
        break
      case 'red':
        transforms.red = value
        break
      case 'green':
        transforms.green = value
        break
      case 'blue':
        transforms.blue = value
        break
      case 'gamma':
        transforms.gamma = value
        break
      case 'inv':
        transforms.inverse = true
        break
      case 'gray':
        transforms.gray = value
        break
      default:
        break
    }
  }
  return transforms
}

/** Resolves a `schemeClr` slot name (`accent1`, `bg1`, `tx2`, `phClr`, …). */
export type SchemeColorResolver = (slot: string) => OfficeColor | null

/**
 * Read one DrawingML colour choice element (`srgbClr`, `sysClr`, `schemeClr`,
 * `prstClr`, `scrgbClr`, `hslClr`) and resolve it to a concrete colour.
 * Returns `null` for anything unrecognised so the caller keeps its default
 * instead of painting a wrong colour.
 */
export function parseColorElement(el: Element | null | undefined, resolve: SchemeColorResolver): OfficeColor | null {
  if (!el) return null
  const transforms = parseColorTransforms(el)
  const val = el.getAttribute('val') ?? ''

  switch (el.localName) {
    case 'srgbClr': {
      const base = hexToColor(val)
      return base ? applyColorTransforms(base, transforms) : null
    }
    case 'sysClr': {
      const base = hexToColor(SYSTEM_COLORS[val] ?? val) ?? hexToColor(val)
      return base ? applyColorTransforms(base, transforms) : null
    }
    case 'prstClr': {
      const base = hexToColor(PRESET_COLORS[val] ?? '')
      return base ? applyColorTransforms(base, transforms) : null
    }
    case 'scrgbClr': {
      const r = Number(el.getAttribute('r') ?? '0')
      const g = Number(el.getAttribute('g') ?? '0')
      const b = Number(el.getAttribute('b') ?? '0')
      return applyColorTransforms({ r, g, b, a: 1 }, transforms)
    }
    case 'hslClr': {
      const h = Number(el.getAttribute('hue') ?? '0')
      const s = Number(el.getAttribute('sat') ?? '0') / 100000
      const l = Number(el.getAttribute('lum') ?? '0') / 100000
      return applyColorTransforms(hslToRgb(h, s, l, 1), transforms)
    }
    case 'schemeClr': {
      const base = resolve(val)
      return base ? applyColorTransforms(base, transforms) : null
    }
    default:
      return null
  }
}

export const BLACK: OfficeColor = { r: 0, g: 0, b: 0, a: 1 }
export const WHITE: OfficeColor = { r: 255, g: 255, b: 255, a: 1 }

/**
 * The colour choice element inside a container. Colours are always a two-level
 * structure — `<a:solidFill><a:srgbClr/></a:solidFill>`, or a theme slot
 * `<a:accent1><a:sysClr/></a:accent1>` — so every caller that has a container
 * reaches for this rather than guessing which level it is holding.
 */
export function colorChoiceIn(parent: Element | null | undefined, container: string): Element | null {
  return childOf(parent, container)?.firstElementChild ?? null
}

/** The six colour choice element names (`a:srgbClr` and friends). */
const COLOR_CHOICE_NAMES: ReadonlySet<string> = new Set([
  'srgbClr',
  'sysClr',
  'scrgbClr',
  'hslClr',
  'prstClr',
  'schemeClr',
])

export function isColorChoice(el: Element | null | undefined): boolean {
  return Boolean(el) && COLOR_CHOICE_NAMES.has((el as Element).localName)
}

/**
 * The colour choice inside `parent`, whether `parent` *is* the wrapper (a
 * theme slot, an `a:gs` gradient stop) or merely *contains* one (an `a:rPr`
 * with an `a:solidFill`). Accepting both shapes at one call site is what keeps
 * the parsers free of "am I holding the container or the colour?" branches.
 */
export function colorChoiceOf(parent: Element | null | undefined): Element | null {
  const first = parent?.firstElementChild ?? null
  if (!first) return null
  return isColorChoice(first) ? first : colorChoiceIn(parent, first.localName)
}

export function isBlack(color: OfficeColor | null | undefined): boolean {
  return Boolean(color) && (color as OfficeColor).r < 8 && (color as OfficeColor).g < 8 && (color as OfficeColor).b < 8
}
