/**
 * DrawingML shape, text and picture properties.
 *
 * This is the layer every host format shares: a PowerPoint `p:sp`, a Word
 * drawing, an Excel chart and a SmartArt node all describe themselves with
 * `a:xfrm`, `a:prstGeom`, a fill, a line, an effect list and a text body. The
 * two rules that separate a rough preview from a faithful one are implemented
 * here rather than per format:
 *
 * 1. **Reference resolution.** A shape's real appearance is the composition of
 *    its own `spPr` with the `fillRef`/`lnRef`/`effectRef` of its `a:style` and
 *    the theme those indices point into. Most PowerPoint shapes carry *no*
 *    explicit fill at all, so a reader that only looks at `spPr` paints them
 *    white. {@link resolveShapeProperties} does the composition in Office's
 *    precedence order.
 * 2. **Units are normalised once, here.** EMU, universal measures, half-points
 *    and 60000ths-of-a-degree all become points and degrees at the parse
 *    boundary, so no downstream stage repeats the arithmetic — and cannot get
 *    it subtly wrong in one host format but not another.
 */

import {
  BLACK,
  isColorChoice,
  colorChoiceIn,
  colorChoiceOf,
  hexToColor,
  parseColorElement,
  type OfficeColor,
  type SchemeColorResolver,
} from './color.js'
import {
  IDENTITY,
  applyTransform,
  composeTransform,
  flipTransform,
  isIdentity,
  rotateTransform,
  scaleTransform,
  translateTransform,
  type Point,
  type Rect,
  type Size,
  type Transform2D,
} from './geom.js'
import {
  isUnitBoxPath,
  parseCustomGeometry,
  presetGeometry,
  resolveAdjustValues,
  type CustomGeometry,
  type PresetGeometry,
} from './geometry.js'
import {
  Theme,
  type GlowEffect,
  type GradientStop,
  type LineCap,
  type LineCompound,
  type ReflectionEffect,
  type ShadowEffect,
  type ThemeFill,
  type ThemeLine,
} from './theme.js'
import { emuToPt, universalMeasureToPt } from './units.js'
import { attr, attrBool, attrNumber, childOf, childrenOf, descendantsOf, relAttr } from './xml.js'

const SIXTY_THOUSANDTHS_PER_DEGREE = 60000
const ONE_HUNDRED_THOUSANDTHS = 100000

/* -------------------------------------------------------------------------- */
/* Transforms                                                                  */
/* -------------------------------------------------------------------------- */

/** The child-space origin/extent a group declares, for `chOff`/`chExt`. */
export interface ChildSpace {
  readonly offset: { readonly x: number; readonly y: number }
  readonly extent: { readonly width: number; readonly height: number }
}

export interface ShapeTransform {
  readonly offset: { readonly x: number; readonly y: number }
  readonly extent: { readonly width: number; readonly height: number }
  /** Clockwise degrees about the shape's centre, the pivot DrawingML uses. */
  readonly rotation: number
  readonly flipH: boolean
  readonly flipV: boolean
  /**
   * Present when the XML declared `chOff`/`chExt`: a group that rescales its
   * children. Absent otherwise, and a zero extent is not a valid child space.
   */
  readonly childSpace: ChildSpace | null
  /** `true` when the XML omitted `a:xfrm` and the caller must supply one. */
  readonly inherited: boolean
}

export const IDENTITY_TRANSFORM: ShapeTransform = {
  offset: { x: 0, y: 0 },
  extent: { width: 0, height: 0 },
  rotation: 0,
  flipH: false,
  flipV: false,
  childSpace: null,
  inherited: true,
}

/**
 * Parse `a:xfrm` (or `p:xfrm` / `xdr:xfrm` — the same element in the three
 * namespaces). Offsets and extents may be EMU or a universal measure, and
 * rotation is in 60000ths of a degree, so all three are normalised here.
 */
export function parseTransform(xfrm: Element | null | undefined): ShapeTransform | null {
  if (!xfrm) return null
  const off = childOf(xfrm, 'off')
  const ext = childOf(xfrm, 'ext')
  const chOff = childOf(xfrm, 'chOff')
  const chExt = childOf(xfrm, 'chExt')

  const offset = {
    x: universalMeasureToPt(attr(off, 'x')) ?? 0,
    y: universalMeasureToPt(attr(off, 'y')) ?? 0,
  }
  const extent = {
    width: universalMeasureToPt(attr(ext, 'cx')) ?? 0,
    height: universalMeasureToPt(attr(ext, 'cy')) ?? 0,
  }

  let childSpace: ChildSpace | null = null
  if (chOff && chExt) {
    const childOffset = {
      x: universalMeasureToPt(attr(chOff, 'x')) ?? 0,
      y: universalMeasureToPt(attr(chOff, 'y')) ?? 0,
    }
    const childExtent = {
      width: universalMeasureToPt(attr(chExt, 'cx')) ?? 0,
      height: universalMeasureToPt(attr(chExt, 'cy')) ?? 0,
    }
    // A zero child extent cannot be rescaled onto anything; treat it as absent
    // rather than dividing by zero and destroying the whole subtree.
    if (childExtent.width > 0 && childExtent.height > 0) childSpace = { offset: childOffset, extent: childExtent }
  }

  return {
    offset,
    extent,
    rotation: normalizeDegrees((attrNumber(xfrm, 'rot') ?? 0) / SIXTY_THOUSANDTHS_PER_DEGREE),
    flipH: attrBool(xfrm, 'flipH') ?? false,
    flipV: attrBool(xfrm, 'flipV') ?? false,
    childSpace,
    inherited: false,
  }
}

function normalizeDegrees(degrees: number): number {
  if (!Number.isFinite(degrees)) return 0
  return ((degrees % 360) + 360) % 360
}

/**
 * The matrix mapping a shape's **local unit box** (0..1, the space geometry
 * paths are defined in) into slide coordinates.
 *
 * Built as an explicit composition rather than a closed form, because the
 * order is the whole point: scale to the box, flip about the box centre, rotate
 * about the box centre, then translate to the shape's position. Rotation is
 * about the *centre* (PowerPoint's behaviour), not the origin, and getting
 * that wrong rotates every shape in the deck about the top-left corner.
 */
export function unitBoxMatrix(transform: ShapeTransform): Transform2D {
  const { x, y } = transform.offset
  const { width, height } = transform.extent
  const center: Point = { x: width / 2, y: height / 2 }
  const flip = flipTransform(transform.flipH, transform.flipV)
  // A flip is about the centre too, so it needs the centre's translation.
  const flipAboutCenter = composeTransform(translateTransform(center.x, center.y), composeTransform(flip, translateTransform(-center.x, -center.y)))
  const rotateAboutCenter = transform.rotation === 0
    ? IDENTITY
    : composeTransform(
        translateTransform(center.x, center.y),
        composeTransform(rotateTransform(transform.rotation), translateTransform(-center.x, -center.y))
      )
  return composeTransform(
    translateTransform(x, y),
    composeTransform(rotateAboutCenter, composeTransform(flipAboutCenter, scaleTransform(width, height)))
  )
}

/**
 * The matrix mapping a **child's own authored coordinates** into slide space,
 * honouring `chOff`/`chExt`. A group's children are positioned in the group's
 * child space, which is usually the slide's but is not always — decks built
 * from templates rescale groups, and a reader that ignores `chExt` drifts the
 * whole subtree off the slide.
 *
 * The child point is first normalised from child space into the parent's unit
 * box (`(cx - chOff.x) / chExt.cx`), and *then* handed to the parent's own
 * matrix. Composing the rescale the other way round double-counts the parent's
 * extent and scales the subtree by its square.
 */
export function childSpaceMatrix(transform: ShapeTransform): Transform2D {
  const own = unitBoxMatrix(transform)
  const childSpace = transform.childSpace
  if (!childSpace) return own
  const normalize = composeTransform(
    translateTransform(-childSpace.offset.x, -childSpace.offset.y),
    scaleTransform(1 / childSpace.extent.width, 1 / childSpace.extent.height)
  )
  return composeTransform(own, normalize)
}

/** The axis-aligned bounds of a shape in slide coordinates. */
export function shapeBounds(transform: ShapeTransform): Rect {
  const matrix = unitBoxMatrix(transform)
  const corners: Point[] = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
  ]
  const mapped = corners.map((corner) => applyTransform(corner, matrix))
  const minX = Math.min(...mapped.map((p) => p.x))
  const minY = Math.min(...mapped.map((p) => p.y))
  const maxX = Math.max(...mapped.map((p) => p.x))
  const maxY = Math.max(...mapped.map((p) => p.y))
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

/* -------------------------------------------------------------------------- */
/* Fills                                                                       */
/* -------------------------------------------------------------------------- */

export type ShapeFill =
  | { readonly type: 'none' }
  | { readonly type: 'solid'; readonly color: OfficeColor }
  | { readonly type: 'gradient'; readonly stops: readonly GradientStop[]; readonly angle: number; readonly scaled: boolean }
  | { readonly type: 'pattern'; readonly preset: string; readonly foreground: OfficeColor; readonly background: OfficeColor }
  | { readonly type: 'picture'; readonly blip: BlipFill }
  | { readonly type: 'group' }

export interface BlipFill {
  /** Relationship id of the image part; resolved to bytes by the asset layer. */
  readonly embedRelId: string
  readonly linkRelId?: string
  /** `a:srcRect` crop, in 1000ths of a percent. */
  readonly crop: { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number }
  readonly stretch: boolean
  /** Modulation children: `a:alphaModFix`, `a:duotone`, `a:grayscl`, `a:biLevel`. */
  readonly effects: readonly BlipEffect[]
  /** `a:ext/@dpi`, when the producer recorded the image's real resolution. */
  readonly dpi?: number
}

export interface BlipEffect {
  readonly kind: 'alphaModFix' | 'alphaMod' | 'duotone' | 'grayscl' | 'biLevel' | 'clrChange' | 'clrRepl'
  /** 0..1, normalised from the 1000ths-of-a-percent the XML uses. */
  readonly amount: number
  readonly color?: OfficeColor
  readonly color2?: OfficeColor
}

const NO_FILL: ShapeFill = { type: 'none' }
const FILL_CHOICES = ['noFill', 'solidFill', 'gradFill', 'blipFill', 'pattFill', 'grpFill'] as const

/**
 * Parse a fill from either shape of element: a container that *is* a fill
 * (`a:blipFill`, `a:solidFill`) or a parent that *lists* one (`a:spPr`,
 * `a:bgPr`). Both occur in the wild and forcing callers to know which they hold
 * is how fills silently go missing.
 */
export function parseFillChoice(parent: Element | null | undefined, resolve: SchemeColorResolver): ShapeFill | null {
  if (!parent) return null
  if (parent.localName === 'blipFill') return parseBlipFill(parent, resolve)
  // A caller may hand us the fill element itself rather than its container.
  // `a:ln` contains `a:noFill`/`a:solidFill`, but a blip can also be the fill of
  // a `p:spPr` reached through a style reference, so accept both shapes.
  if (FILL_CHOICES.includes(parent.localName as (typeof FILL_CHOICES)[number])) {
    return parseFill(parent, parent.localName, resolve)
  }
  for (const name of FILL_CHOICES) {
    const node = childOf(parent, name)
    if (!node) continue
    return parseFill(node, name, resolve)
  }
  return null
}

function parseFill(node: Element, name: string, resolve: SchemeColorResolver): ShapeFill | null {
  {
    const parent = node.parentElement
    switch (name) {
      case 'noFill':
        return NO_FILL
      case 'solidFill':
        return { type: 'solid', color: parseColorElement(colorChoiceIn(parent, 'solidFill'), resolve) ?? BLACK }
      case 'gradFill':
        return { type: 'gradient', ...parseGradient(node, resolve) }
      case 'pattFill':
        return {
          type: 'pattern',
          preset: attr(node, 'prst') ?? 'pct5',
          foreground: parseColorElement(colorChoiceIn(node, 'fgClr'), resolve) ?? BLACK,
          background: parseColorElement(colorChoiceIn(node, 'bgClr'), resolve) ?? BLACK,
        }
      case 'blipFill':
        return parseBlipFill(node, resolve)
      case 'grpFill':
        return { type: 'group' }
    }
  }
  return null
}

function parseGradient(node: Element, resolve: SchemeColorResolver): {
  stops: GradientStop[]
  angle: number
  scaled: boolean
} {
  const stops: GradientStop[] = []
  for (const gs of childrenOf(childOf(node, 'gsLst'))) {
    const color = parseColorElement(colorChoiceOf(gs), resolve)
    if (color) stops.push({ position: attrNumber(gs, 'pos') ?? 0, color })
  }
  const linear = childOf(node, 'lin')
  const scaled = attrBool(node, 'scaled') ?? false
  // `a:path` gradients run along a rectangle or a circle; 90° is the closest
  // linear stand-in and is what most viewers ship.
  const angle = linear ? (attrNumber(linear, 'ang') ?? 0) / SIXTY_THOUSANDTHS_PER_DEGREE : 90
  return { stops, angle: normalizeDegrees(angle), scaled }
}

function parseBlipFill(node: Element, resolve: SchemeColorResolver): ShapeFill | null {
  const blip = descendantsOf(node, 'blip')[0]
  if (!blip) return null
  const embedRelId = relAttr(blip, 'embed')
  const linkRelId = relAttr(blip, 'link')
  if (!embedRelId && !linkRelId) return null
  const effects: BlipEffect[] = []
  for (const effect of childrenOf(blip)) {
    const amount = (attrNumber(effect, 'amt') ?? ONE_HUNDRED_THOUSANDTHS) / ONE_HUNDRED_THOUSANDTHS
    if (effect.localName === 'alphaModFix' || effect.localName === 'alphaMod') {
      effects.push({ kind: effect.localName, amount })
    } else if (effect.localName === 'duotone') {
      // `<a:duotone>` lists its two colours as direct `a:*Clr` children, so
      // they are read as children rather than through a `colorChoiceIn` name
      // lookup — asking for `srgbClr` alone would miss a `schemeClr` pair.
      const colors = childrenOf(effect).filter(isColorChoice)
      effects.push({
        kind: 'duotone',
        amount: 1,
        color: parseColorElement(colors[0] ?? null, resolve) ?? undefined,
        color2: parseColorElement(colors[1] ?? null, resolve) ?? undefined,
      })
    } else if (effect.localName === 'grayscl' || effect.localName === 'biLevel') {
      effects.push({ kind: effect.localName, amount: 1 })
    }
  }
  const srcRect = childOf(node, 'srcRect')
  return {
    type: 'picture',
    blip: {
      embedRelId: embedRelId ?? (linkRelId as string),
      linkRelId,
      crop: {
        left: attrNumber(srcRect, 'l') ?? 0,
        top: attrNumber(srcRect, 't') ?? 0,
        right: attrNumber(srcRect, 'r') ?? 0,
        bottom: attrNumber(srcRect, 'b') ?? 0,
      },
      stretch: childOf(node, 'stretch') !== null,
      effects,
      dpi: attrNumber(descendantsOf(blip, 'dpi')[0], 'val'),
    },
  }
}

/* -------------------------------------------------------------------------- */
/* Lines                                                                       */
/* -------------------------------------------------------------------------- */

export type ArrowheadKind = 'none' | 'triangle' | 'arrow' | 'stealth' | 'diamond' | 'oval' | 'stealthSmall' | 'diamondThin'

export interface Arrowhead {
  readonly kind: ArrowheadKind
  readonly size: 'sm' | 'med' | 'lg'
  /** `w` in points; `sm`/`med`/`lg` map to 1/3/2 line widths. */
  readonly widthPt: number
  readonly lengthPt: number
}

export interface ShapeLine {
  readonly fill: ShapeFill
  readonly widthPt: number
  readonly cap: LineCap
  readonly compound: LineCompound
  readonly dash: string
  readonly headEnd?: Arrowhead
  readonly tailEnd?: Arrowhead
}

export const DEFAULT_LINE: ShapeLine = {
  fill: { type: 'solid', color: BLACK },
  widthPt: 0.75,
  cap: 'flat',
  compound: 'single',
  dash: 'solid',
}

const ARROW_KINDS: ReadonlySet<string> = new Set([
  'none',
  'triangle',
  'arrow',
  'stealth',
  'diamond',
  'oval',
  'stealthSmall',
  'diamondThin',
])
const ARROW_SIZES: ReadonlySet<string> = new Set(['sm', 'med', 'lg'])

/**
 * `a:headEnd`/`a:tailEnd`. A missing `w`/`len` means "one line width" / "two
 * line widths" (ECMA-376 §20.1.10.36), which is why the line width is needed
 * here and the values are resolved against it by the renderer.
 */
function parseArrowhead(parent: Element, name: 'headEnd' | 'tailEnd', lineWidthPt: number): Arrowhead | undefined {
  const node = childOf(parent, name)
  if (!node) return undefined
  const type = attr(node, 'type') ?? 'none'
  const size = attr(node, 'w') ?? 'med'
  const width = attrNumber(node, 'w')
  const length = attrNumber(node, 'len')
  const scale = size === 'sm' ? 1 / 3 : size === 'lg' ? 2 : 1
  return {
    kind: (ARROW_KINDS.has(type) ? type : 'none') as ArrowheadKind,
    size: (ARROW_SIZES.has(size) ? size : 'med') as Arrowhead['size'],
    widthPt: width === undefined ? lineWidthPt * scale : emuToPt(width),
    lengthPt: length === undefined ? lineWidthPt * 2 * scale : emuToPt(length),
  }
}

/** Parse the `a:ln` child of a shape's `spPr`, or a theme line style. */
export function parseLine(node: Element | null | undefined, resolve: SchemeColorResolver): ShapeLine | null {
  if (!node) return null
  if (childOf(node, 'noFill') !== null) return { ...DEFAULT_LINE, fill: NO_FILL }
  const fill = parseFillChoice(node, resolve)
  if (!fill) return null
  const width = attrNumber(node, 'w')
  const widthPt = width === undefined ? 0.75 : emuToPt(width)
  const cap = attr(node, 'cap')
  const compound = attr(node, 'cmpd')
  return {
    fill,
    widthPt,
    cap: cap === 'rnd' ? 'round' : cap === 'sq' ? 'square' : 'flat',
    compound: (compound === 'dbl' || compound === 'thickThin' || compound === 'thinThick' || compound === 'tri'
      ? compound
      : 'single') as LineCompound,
    dash: attr(childOf(node, 'prstDash'), 'val') ?? 'solid',
    headEnd: parseArrowhead(node, 'headEnd', widthPt),
    tailEnd: parseArrowhead(node, 'tailEnd', widthPt),
  }
}

/* -------------------------------------------------------------------------- */
/* Effects                                                                     */
/* -------------------------------------------------------------------------- */

export interface ShapeEffects {
  readonly shadows: readonly ShadowEffect[]
  readonly glows: readonly GlowEffect[]
  readonly softEdgePt?: number
  readonly reflection?: ReflectionEffect
}

export const NO_EFFECTS: ShapeEffects = { shadows: [], glows: [] }

/** Parse `a:effectLst` / `a:effectDag` from a shape or a style reference. */
export function parseEffectList(node: Element | null | undefined, resolve: SchemeColorResolver): ShapeEffects {
  if (!node) return NO_EFFECTS
  const shadows: ShadowEffect[] = []
  const glows: GlowEffect[] = []
  let softEdgePt: number | undefined
  let reflection: ReflectionEffect | undefined
  for (const effect of childrenOf(node)) {
    switch (effect.localName) {
      case 'outerShdw':
      case 'innerShdw': {
        const color = parseColorElement(colorChoiceOf(effect), resolve)
        if (!color) break
        shadows.push({
          kind: effect.localName === 'outerShdw' ? 'outer' : 'inner',
          blurPt: emuToPt(attrNumber(effect, 'blurRad') ?? 0),
          distancePt: emuToPt(attrNumber(effect, 'dist') ?? 0),
          direction: attrNumber(effect, 'dir') ?? 0,
          color,
          sx: ratio(attrNumber(effect, 'sx')),
          sy: ratio(attrNumber(effect, 'sy')),
          kx: angle(attrNumber(effect, 'kx')),
          ky: angle(attrNumber(effect, 'ky')),
          align: attr(effect, 'algn'),
          rotWithShape: attrBool(effect, 'rotWithShape') ?? true,
        })
        break
      }
      case 'glow': {
        const color = parseColorElement(colorChoiceOf(effect), resolve)
        if (color) glows.push({ radiusPt: emuToPt(attrNumber(effect, 'rad') ?? 0), color })
        break
      }
      case 'softEdge': {
        softEdgePt = emuToPt(attrNumber(effect, 'rad') ?? 0)
        break
      }
      case 'reflection': {
        reflection = {
          blurPt: emuToPt(attrNumber(effect, 'blurRad') ?? 0),
          startAlpha: percent(attrNumber(effect, 'stA')),
          startPosition: percent(attrNumber(effect, 'stPos')),
          endAlpha: percent(attrNumber(effect, 'endA')),
          endPosition: percent(attrNumber(effect, 'endPos')),
          distancePt: emuToPt(attrNumber(effect, 'dist') ?? 0),
          direction: attrNumber(effect, 'dir') ?? 0,
          fadeDirection: attrNumber(effect, 'fadeDir') ?? 0,
          sx: percent(attrNumber(effect, 'sx'), 1),
          sy: percent(attrNumber(effect, 'sy'), 1),
          kx: angle(attrNumber(effect, 'kx')) ?? 0,
          ky: angle(attrNumber(effect, 'ky')) ?? 0,
          align: attr(effect, 'algn') ?? 'bl',
          rotWithShape: attrBool(effect, 'rotWithShape') ?? true,
        }
        break
      }
      default:
        break
    }
  }
  return { shadows, glows, softEdgePt, reflection }
}

const ratio = (value: number | undefined): number | undefined =>
  value === undefined ? undefined : value / ONE_HUNDRED_THOUSANDTHS
const percent = (value: number | undefined, fallback = 0): number =>
  value === undefined ? fallback : value / ONE_HUNDRED_THOUSANDTHS
const angle = (value: number | undefined): number | undefined =>
  value === undefined ? undefined : value / SIXTY_THOUSANDTHS_PER_DEGREE

/* -------------------------------------------------------------------------- */
/* Geometry                                                                    */
/* -------------------------------------------------------------------------- */

export type ShapeGeometry =
  | { readonly kind: 'preset'; readonly name: string; readonly preset: PresetGeometry; readonly adjustValues: readonly number[] }
  | { readonly kind: 'custom'; readonly custom: CustomGeometry }
  | { readonly kind: 'none' }

/**
 * `a:prstGeom` or `a:custGeom`. An unrecognised preset resolves to `none`
 * rather than throwing, and the caller draws the bounding box — a visibly plain
 * shape is recoverable, a missing one is not.
 */
/**
 * Whether a shape's outline is exactly its own bounding box.
 *
 * A painter that has already laid a CSS background over the shape's box does not
 * need to fill the path again, and skipping the fill is what lets a `roundRect`
 * or an `ellipse` keep a transparent margin outside its silhouette.
 */
export function isBoundingBoxShape(geometry: ShapeGeometry): boolean {
  // A compound custom outline is never just the box, whatever its first
  // sub-path happens to be.
  if (geometry.kind === 'custom') {
    const [first, ...rest] = geometry.custom.paths
    return rest.length === 0 && isUnitBoxPath(first)
  }
  if (geometry.kind !== 'preset') return true
  return isUnitBoxPath(geometry.preset.path)
}

export function parseGeometry(spPr: Element | null | undefined): ShapeGeometry {
  if (!spPr) return { kind: 'none' }
  const custGeom = childOf(spPr, 'custGeom')
  if (custGeom) {
    const custom = parseCustomGeometry(custGeom)
    if (custom) return { kind: 'custom', custom }
  }
  const prstGeom = childOf(spPr, 'prstGeom')
  const prst = attr(prstGeom, 'prst')
  if (prst) {
    const preset = presetGeometry(prst)
    if (preset) {
      const authored: number[] = []
      for (const gd of childrenOf(childOf(prstGeom, 'avLst'), 'gd')) {
        const value = Number(attr(gd, 'fmla')?.split(/\s+/)[1])
        if (Number.isFinite(value)) authored.push(value)
      }
      return { kind: 'preset', name: prst, preset, adjustValues: resolveAdjustValues(preset, authored) }
    }
  }
  return { kind: 'none' }
}

/* -------------------------------------------------------------------------- */
/* Style matrix (`a:style`)                                                    */
/* -------------------------------------------------------------------------- */

export interface StyleRef {
  /** 1-based index into the theme's style list; 0 means "no reference". */
  readonly index: number
  /** The colour authored on the reference, which overrides the theme's. */
  readonly color: OfficeColor | null
}

export interface StyleMatrix {
  readonly fillRef: StyleRef
  readonly lineRef: StyleRef
  readonly effectRef: StyleRef
  readonly fontRef: StyleRef
}

const NO_REF: StyleRef = { index: 0, color: null }

function parseStyleRef(parent: Element | null | undefined, name: string, resolve: SchemeColorResolver): StyleRef {
  const node = childOf(parent, name)
  if (!node) return NO_REF
  const colorNode = colorChoiceOf(node)
  const color = parseColorElement(colorNode, resolve)
  // `<a:alpha>` inside the reference colour is a transparency multiplier on
  // the style's colour, which is how PowerPoint renders a "transparent accent1".
  const alpha = attrNumber(childOf(colorNode, 'alpha'), 'val')
  return { index: attrNumber(node, 'idx') ?? 0, color: color ? applyReferenceAlpha(color, alpha) : null }
}

function applyReferenceAlpha(color: OfficeColor, alpha: number | undefined): OfficeColor {
  if (alpha === undefined) return color
  return { ...color, a: (color.a * alpha) / ONE_HUNDRED_THOUSANDTHS }
}

/**
 * `a:style` — the reference matrix nearly every PowerPoint shape carries, and
 * the only source of fill/line/effect for most of them.
 */
export function parseStyleMatrix(style: Element | null | undefined, resolve: SchemeColorResolver): StyleMatrix | null {
  if (!style) return null
  return {
    fillRef: parseStyleRef(style, 'fillRef', resolve),
    lineRef: parseStyleRef(style, 'lnRef', resolve),
    effectRef: parseStyleRef(style, 'effectRef', resolve),
    fontRef: parseStyleRef(style, 'fontRef', resolve),
  }
}

/* -------------------------------------------------------------------------- */
/* Composition                                                                 */
/* -------------------------------------------------------------------------- */

export interface PropertySources {
  readonly fill: 'explicit' | 'styleRef' | 'theme' | 'default'
  readonly line: 'explicit' | 'styleRef' | 'theme' | 'default'
  readonly effects: 'explicit' | 'theme' | 'default'
}

export interface ShapeProperties {
  readonly transform: ShapeTransform
  readonly geometry: ShapeGeometry
  readonly fill: ShapeFill
  readonly line: ShapeLine
  readonly effects: ShapeEffects
  /**
   * Which layer supplied each property. Kept because "why is this shape blue"
   * is otherwise unanswerable, and because the layout stage must know whether a
   * fill is inherited — and may therefore be overridden by a placeholder's own
   * list style — or explicit.
   */
  readonly sources: PropertySources
}

/**
 * Compose a shape's `spPr` with its `a:style` and the theme.
 *
 * Precedence, highest first, as Office applies it:
 * 1. the shape's own `spPr` — including an explicit `noFill`, which *removes*
 *    the style reference rather than deferring to it;
 * 2. the `a:style` reference plus the colour authored on that reference;
 * 3. the theme's style list at the referenced index;
 * 4. the host default.
 */
/**
 * Resolve a shape's visual properties.
 *
 * `spPr` is the `a:spPr`/`p:spPr` element that carries fill, line, effects and
 * — for ordinary shapes — the transform. `p:graphicFrame` and `p:cxnSp` are
 * exceptions: they put `p:xfrm` directly under the element, so callers pass it
 * as `xfrm` when one is present. Without that the frame lands at the origin
 * with no size, which is where a chart silently disappears.
 */
export function resolveShapeProperties(
  spPr: Element | null | undefined,
  style: Element | null | undefined,
  theme: Theme,
  colorMap: Readonly<Record<string, string>> | null | undefined,
  xfrm?: Element | null
): ShapeProperties {
  const resolve = theme.resolverFor(colorMap)
  const styleMatrix = parseStyleMatrix(style, resolve)
  const geometry = parseGeometry(spPr)
  const transform = parseTransform(xfrm ?? childOf(spPr, 'xfrm')) ?? IDENTITY_TRANSFORM

  const { fill, fillSource } = composeFill(spPr, styleMatrix?.fillRef ?? NO_REF, theme, resolve)
  const { line, lineSource } = composeLine(spPr, styleMatrix?.lineRef ?? NO_REF, theme, resolve)
  const { effects, effectSource } = composeEffects(spPr, styleMatrix?.effectRef ?? NO_REF, theme, resolve)

  return { transform, geometry, fill, line, effects, sources: { fill: fillSource, line: lineSource, effects: effectSource } }
}

function composeFill(
  spPr: Element | null | undefined,
  ref: StyleRef,
  theme: Theme,
  resolve: SchemeColorResolver
): { fill: ShapeFill; fillSource: PropertySources['fill'] } {
  const explicit = parseFillChoice(spPr, resolve)
  if (explicit) {
    return { fill: explicit, fillSource: explicit.type === 'none' ? 'default' : 'explicit' }
  }
  const themeFill = theme.fill(ref.index)
  if (ref.color && themeFill && themeFill.type === 'solid') {
    return { fill: { type: 'solid', color: ref.color }, fillSource: 'styleRef' }
  }
  if (themeFill) return { fill: themeFillToShapeFill(themeFill), fillSource: 'theme' }
  if (ref.color) return { fill: { type: 'solid', color: ref.color }, fillSource: 'styleRef' }
  return { fill: NO_FILL, fillSource: 'default' }
}

function composeLine(
  spPr: Element | null | undefined,
  ref: StyleRef,
  theme: Theme,
  resolve: SchemeColorResolver
): { line: ShapeLine; lineSource: PropertySources['line'] } {
  const explicit = parseLine(childOf(spPr, 'ln'), resolve)
  if (explicit) {
    return { line: explicit, lineSource: explicit.fill.type === 'none' ? 'default' : 'explicit' }
  }
  const themeLine = theme.line(ref.index)
  if (themeLine) {
    const line = themeLineToShapeLine(themeLine, resolve)
    if (ref.color) return { line: { ...line, fill: { type: 'solid', color: ref.color } }, lineSource: 'styleRef' }
    return { line, lineSource: 'theme' }
  }
  if (ref.color) {
    return { line: { ...DEFAULT_LINE, fill: { type: 'solid', color: ref.color } }, lineSource: 'styleRef' }
  }
  /* Nothing declared a line, and there is nothing to inherit, so the shape has
   * no outline — which is what an absent `a:ln` means. `DEFAULT_LINE` is a
   * *basis* for the other cases (a width with a colour, or a width with no
   * fill), not a line in its own right: handing it back here painted a 0.75pt
   * black border on every shape, picture and text box that never asked for one.
   * The `'default'` source label is the same one an explicit
   * `<a:ln><a:noFill/></a:ln>` already reports, so the fallback is that same
   * value: a default width and cap that nothing paints. */
  return { line: { ...DEFAULT_LINE, fill: NO_FILL }, lineSource: 'default' }
}

function composeEffects(
  spPr: Element | null | undefined,
  ref: StyleRef,
  theme: Theme,
  resolve: SchemeColorResolver
): { effects: ShapeEffects; effectSource: PropertySources['effects'] } {
  const explicit = parseEffectList(childOf(spPr, 'effectLst') ?? childOf(spPr, 'effectDag'), resolve)
  if (explicit.shadows.length > 0 || explicit.glows.length > 0 || explicit.softEdgePt !== undefined || explicit.reflection) {
    return { effects: explicit, effectSource: 'explicit' }
  }
  const themeEffect = theme.effect(ref.index)
  if (themeEffect) return { effects: themeEffect, effectSource: 'theme' }
  return { effects: NO_EFFECTS, effectSource: 'default' }
}

/** Re-express a theme fill in the shape vocabulary. */
export function themeFillToShapeFill(fill: ThemeFill): ShapeFill {
  switch (fill.type) {
    case 'none':
      return NO_FILL
    case 'solid':
      return { type: 'solid', color: fill.color ?? BLACK }
    case 'gradient':
      return { type: 'gradient', stops: fill.stops ?? [], angle: fill.angle ?? 90, scaled: false }
    case 'pattern':
      return {
        type: 'pattern',
        preset: fill.pattern ?? 'pct5',
        foreground: fill.patternColor ?? BLACK,
        background: fill.backgroundColor ?? BLACK,
      }
    case 'blip':
      return fill.blipRelId
        ? {
            type: 'picture',
            blip: {
              embedRelId: fill.blipRelId,
              crop: { left: 0, top: 0, right: 0, bottom: 0 },
              stretch: fill.stretch ?? true,
              effects: [],
            },
          }
        : NO_FILL
    case 'group':
      return { type: 'group' }
  }
}

function themeLineToShapeLine(line: ThemeLine, resolve: SchemeColorResolver): ShapeLine {
  const fill: ShapeFill = line.fill
    ? themeFillToShapeFill(line.fill)
    : line.color
      ? { type: 'solid', color: line.color }
      : NO_FILL
  void resolve
  return { fill, widthPt: line.widthPt, cap: line.cap, compound: line.compound, dash: line.dash }
}

/* -------------------------------------------------------------------------- */
/* Text body                                                                   */
/* -------------------------------------------------------------------------- */

export type TextAutofit = 'none' | 'shrink' | 'resize' | { readonly fontScale: number; readonly lineScale: number }

export interface TextBodyProperties {
  readonly insets: { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number }
  readonly anchor: 'top' | 'center' | 'bottom'
  readonly vertical: 'horz' | 'vert' | 'vert270' | 'wordArt' | 'eaVert'
  readonly wrap: 'square' | 'none'
  readonly autofit: TextAutofit
  /** Rotation of the text block inside the shape, in degrees. */
  readonly rotation: number
  readonly columns: number
  readonly columnSpacingPt: number
}

const DEFAULT_INSETS = { left: 7.2, top: 3.6, right: 7.2, bottom: 3.6 }

export const DEFAULT_TEXT_BODY: TextBodyProperties = {
  insets: DEFAULT_INSETS,
  anchor: 'top',
  vertical: 'horz',
  wrap: 'square',
  autofit: 'none',
  rotation: 0,
  columns: 1,
  columnSpacingPt: 0,
}

const ANCHORS: Readonly<Record<string, TextBodyProperties['anchor']>> = {
  t: 'top',
  ctr: 'center',
  b: 'bottom',
}
const VERTICALS: ReadonlySet<string> = new Set(['horz', 'vert', 'vert270', 'wordArt', 'eaVert'])

/**
 * `a:bodyPr`. The insets default to 0.1in/0.05in left-right/top-bottom, which
 * is what makes a text box's text sit slightly inside its border in Office.
 */
export function parseTextBody(bodyPr: Element | null | undefined): TextBodyProperties {
  if (!bodyPr) return DEFAULT_TEXT_BODY
  const normAutofit = childOf(bodyPr, 'normAutofit')
  const anchorAttr = attr(bodyPr, 'anchor')
  const verticalAttr = attr(bodyPr, 'vert')
  return {
    insets: {
      left: universalMeasureToPt(attr(bodyPr, 'lIns')) ?? DEFAULT_INSETS.left,
      top: universalMeasureToPt(attr(bodyPr, 'tIns')) ?? DEFAULT_INSETS.top,
      right: universalMeasureToPt(attr(bodyPr, 'rIns')) ?? DEFAULT_INSETS.right,
      bottom: universalMeasureToPt(attr(bodyPr, 'bIns')) ?? DEFAULT_INSETS.bottom,
    },
    anchor: ANCHORS[anchorAttr ?? ''] ?? 'top',
    vertical: verticalAttr && VERTICALS.has(verticalAttr) ? (verticalAttr as TextBodyProperties['vertical']) : 'horz',
    wrap: attr(bodyPr, 'wrap') === 'none' ? 'none' : 'square',
    autofit: normAutofit
      ? {
          fontScale: percent(attrNumber(normAutofit, 'fontScale'), 1),
          lineScale: 1 - percent(attrNumber(normAutofit, 'lnSpcReduction')),
        }
      : childOf(bodyPr, 'spAutoFit')
        ? 'resize'
        : 'none',
    rotation: normalizeDegrees((attrNumber(bodyPr, 'rot') ?? 0) / SIXTY_THOUSANDTHS_PER_DEGREE),
    columns: Math.max(1, attrNumber(bodyPr, 'numCol') ?? 1),
    columnSpacingPt: universalMeasureToPt(attr(bodyPr, 'spcCol')) ?? 0,
  }
}

export interface TextCharacterProperties {
  readonly sizePt: number
  readonly bold: boolean
  readonly italic: boolean
  readonly underline: string
  readonly strike: string
  readonly caps: string
  /** Letter spacing in points (`a:rPr/@spc`, 100ths of a point). */
  readonly spacingPt: number
  /** Superscript/subscript offset in percent (`a:rPr/@baseline`). */
  readonly baselinePercent: number
  readonly color: OfficeColor | null
  readonly highlight: OfficeColor | null
  readonly underlineColor: OfficeColor | null
  readonly latinTypeface: string
  readonly eastAsianTypeface: string
  readonly complexScriptTypeface: string
  /** Kerning threshold in points; 0 disables kerning. */
  readonly kerningPt: number
  readonly language: string
  readonly hyperlinkRelId: string | undefined
}

export const DEFAULT_CHARACTER: TextCharacterProperties = {
  sizePt: 18,
  bold: false,
  italic: false,
  underline: 'none',
  strike: 'noStrike',
  caps: 'none',
  spacingPt: 0,
  baselinePercent: 0,
  color: null,
  highlight: null,
  underlineColor: null,
  latinTypeface: '',
  eastAsianTypeface: '',
  complexScriptTypeface: '',
  kerningPt: 0,
  language: '',
  hyperlinkRelId: undefined,
}

/**
 * Parse `a:rPr` / `a:defRPr` / `a:endParaRPr`.
 *
 * Font size defaults to 18pt and the typeface to the theme's minor font,
 * because those are PowerPoint's own defaults for a shape that specifies
 * nothing. An `a:rPr` that also carries `dirty="0"` and nothing else is
 * extremely common, and a reader that treats the missing font as "inherit
 * nothing" renders a deck in Times New Roman.
 */
export function parseCharacterProperties(
  rPr: Element | null | undefined,
  resolve: SchemeColorResolver,
  theme: Theme,
  sizePt = 18
): TextCharacterProperties {
  const font = theme.font('minor')
  const size = attrNumber(rPr, 'sz')
  const kern = attrNumber(rPr, 'kern')
  return {
    sizePt: size === undefined ? sizePt : size / 100,
    bold: attrBool(rPr, 'b') ?? false,
    italic: attrBool(rPr, 'i') ?? false,
    underline: attr(rPr, 'u') ?? 'none',
    strike: attr(rPr, 'strike') ?? 'noStrike',
    caps: attr(rPr, 'cap') ?? 'none',
    spacingPt: (attrNumber(rPr, 'spc') ?? 0) / 100,
    baselinePercent: (attrNumber(rPr, 'baseline') ?? 0) / 1000,
    color: parseColorElement(colorChoiceOf(childOf(rPr, 'solidFill') ?? rPr), resolve),
    highlight: parseColorElement(colorChoiceOf(childOf(rPr, 'highlight')), resolve),
    underlineColor: parseColorElement(colorChoiceOf(childOf(rPr, 'uFill')), resolve),
    latinTypeface: attr(childOf(rPr, 'latin'), 'typeface') ?? font.latin,
    eastAsianTypeface: attr(childOf(rPr, 'ea'), 'typeface') ?? font.eastAsian,
    complexScriptTypeface: attr(childOf(rPr, 'cs'), 'typeface') ?? font.complexScript,
    kerningPt: kern === undefined ? 0 : kern / 100,
    language: attr(childOf(rPr, 'lang'), 'val') ?? '',
    hyperlinkRelId: relAttr(childOf(rPr, 'hlinkClick'), 'id'),
  }
}

/**
 * Overlay an `a:rPr` / `a:defRPr` onto inherited run properties, honouring
 * *presence* rather than value.
 *
 * {@link parseCharacterProperties} fills every field, so a run that only sets
 * `b="1"` is indistinguishable from one that sets `b="1"` and happens to share
 * the inherited size. Applying the parsed result wholesale therefore resets
 * inherited size, colour and typeface on every run — which is why inheritance
 * has to be applied here, from the element, one attribute at a time.
 *
 * The order is the DrawingML one: the most specific element wins, and anything
 * it leaves unspecified falls through to `base`.
 */
export function mergeCharacterProperties(
  base: TextCharacterProperties,
  el: Element | null | undefined,
  resolve: SchemeColorResolver,
  theme: Theme
): TextCharacterProperties {
  if (!el) return base
  const font = theme.font('minor')
  const size = attrNumber(el, 'sz')
  const kern = attrNumber(el, 'kern')
  const latin = attr(childOf(el, 'latin'), 'typeface')
  const eastAsian = attr(childOf(el, 'ea'), 'typeface')
  const complexScript = attr(childOf(el, 'cs'), 'typeface')
  const bold = attrBool(el, 'b')
  const italic = attrBool(el, 'i')
  const underline = attr(el, 'u')
  const strike = attr(el, 'strike')
  const caps = attr(el, 'cap')
  const spacing = attrNumber(el, 'spc')
  const baseline = attrNumber(el, 'baseline')
  const language = attr(el, 'lang')
  const color = parseColorElement(colorChoiceOf(childOf(el, 'solidFill') ?? el), resolve)
  const highlight = parseColorElement(colorChoiceOf(childOf(el, 'highlight')), resolve)
  const underlineColor = parseColorElement(colorChoiceOf(childOf(el, 'uFill')), resolve)
  const hyperlink = relAttr(childOf(el, 'hlinkClick'), 'id')

  return {
    sizePt: size === undefined ? base.sizePt : size / 100,
    bold: bold ?? base.bold,
    italic: italic ?? base.italic,
    underline: underline ?? base.underline,
    strike: strike ?? base.strike,
    caps: caps ?? base.caps,
    spacingPt: spacing === undefined ? base.spacingPt : spacing / 100,
    baselinePercent: baseline === undefined ? base.baselinePercent : baseline / 1000,
    color: color ?? base.color,
    highlight: highlight ?? base.highlight,
    underlineColor: underlineColor ?? base.underlineColor,
    latinTypeface: latin && latin !== '' ? latin : base.latinTypeface || font.latin,
    eastAsianTypeface: eastAsian && eastAsian !== '' ? eastAsian : base.eastAsianTypeface || font.eastAsian,
    complexScriptTypeface:
      complexScript && complexScript !== '' ? complexScript : base.complexScriptTypeface || font.complexScript,
    kerningPt: kern === undefined ? base.kerningPt : kern / 100,
    language: language ?? base.language,
    hyperlinkRelId: hyperlink ?? base.hyperlinkRelId,
  }
}

/** The text defaults a shape or a placeholder inherits (its `lstStyle`). */
export interface TextDefaults {
  readonly body: TextBodyProperties
  readonly level1: TextCharacterProperties
  /** Levels 2..9, as authored. */
  readonly levels: readonly TextCharacterProperties[]
}

export function parseTextDefaults(lstStyle: Element | null | undefined, resolve: SchemeColorResolver, theme: Theme): TextDefaults | null {
  if (!lstStyle) return null
  const levels: TextCharacterProperties[] = []
  for (const lvl of childrenOf(lstStyle, 'lvl1pPr').concat(childrenOf(lstStyle, 'lvl2pPr'), childrenOf(lstStyle, 'lvl3pPr'))) {
    levels.push(parseCharacterProperties(childOf(lvl, 'defRPr'), resolve, theme))
  }
  return { body: parseTextBody(childOf(lstStyle, 'bodyPr')), level1: levels[0] ?? parseCharacterProperties(null, resolve, theme), levels }
}

export { IDENTITY, isIdentity, applyTransform, composeTransform, type Point, type Rect, type Size, type Transform2D, hexToColor }
