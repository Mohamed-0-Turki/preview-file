import type { OfficeColor } from '../color.js'
import type {
  BlipFill,
  ShapeEffects,
  ShapeFill,
  ShapeGeometry,
  ShapeLine,
  ShapeTransform,
  TextAutofit,
  TextCharacterProperties,
} from '../drawingml.js'
import type { Theme } from '../theme.js'
import type { PptxChart } from './chart.js'

/**
 * The resolved PowerPoint document.
 *
 * This is a *semantic* model, not a paint list: theme colours and fonts are
 * already substituted, placeholder geometry has already been inherited from
 * the layout and master, and the shape tree keeps its authored grouping and
 * order. Nothing here knows about SVG, CSS or the DOM, so a different backend
 * (or an editing surface) can consume exactly the same tree.
 *
 * Every coordinate is in points. EMU, universal measures and half-points are
 * converted at the parse boundary, which is the only place in the pipeline
 * where those units exist.
 */

/** Where a slide inherits its colour semantics from. */
export interface PptxColorMapContext {
  /** The master's `p:clrMap` — `bg1`→`lt1`, `tx1`→`dk1`, … */
  readonly colorMap: Readonly<Record<string, string>>
  /** `p:sld`/`p:sldLayout` `clrMapOvr`; `null` means "use the master's". */
  readonly override: Readonly<Record<string, string>> | null
}

export interface PptxBullet {
  readonly kind: 'none' | 'character' | 'autoNumber' | 'picture'
  /** The bullet glyph for `character`; already mapped from Symbol/Wingdings. */
  readonly char: string
  /** The typeface the glyph needs — Symbol bullets are not Unicode. */
  readonly fontFamily: string
  readonly color: OfficeColor | null
  readonly sizePercent: number
  /** Baseline offset of the glyph in percent, for `buClrTx`-style overrides. */
  readonly hangingPercent: number
  /**
   * A one-based position within the list, for `autoNumber`.
   *
   * The ordinal is model-level knowledge: it depends on which paragraphs above this
   * one share its list level and whether the run was interrupted, so the painter
   * cannot recover it from a single bullet. `null` for every other kind.
   */
  readonly ordinal: number | null
}

export type PptxParagraphAlign = 'left' | 'center' | 'right' | 'justify' | 'distribute'

export interface PptxLineSpacing {
  /** `a:lnSpc/a:spcPct` as a multiple, or `null` when authored in points. */
  readonly percent: number | null
  readonly points: number | null
}

export interface PptxRun {
  readonly text: string
  readonly properties: TextCharacterProperties
  /**
   * `properties.latinTypeface` with `+mj-lt`/`+mn-lt` resolved against the
   * theme, ready to become a CSS `font-family`.
   */
  readonly fontFamily: string
  /** A `<a:br/>` preceded this run, so the layout must break the line here. */
  readonly breakBefore: boolean
  /** `<a:fld>`: the cached result is rendered, never re-evaluated. */
  readonly field: boolean
}

export interface PptxParagraph {
  readonly level: number
  readonly align: PptxParagraphAlign
  readonly bullet: PptxBullet
  /** `a:pPr/@marL` in points, already including the list-level default. */
  readonly marginLeftPt: number
  /** `a:pPr/@indent` in points; negative for a hanging bullet. */
  readonly indentPt: number
  readonly spaceBeforePt: number
  readonly spaceAfterPt: number
  readonly lineSpacing: PptxLineSpacing
  readonly runs: readonly PptxRun[]
  /** `a:endParaRPr`, used for the height of a trailing empty paragraph. */
  readonly endProperties: TextCharacterProperties | null
}

export interface PptxTextBody {
  /** `a:bodyPr` merged with the inherited `lstStyle` body defaults. */
  readonly insets: { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number }
  readonly anchor: 'top' | 'center' | 'bottom'
  readonly vertical: 'horz' | 'vert' | 'vert270' | 'wordArt' | 'eaVert'
  readonly wrap: 'square' | 'none'
  readonly autofit: TextAutofit
  /** Rotation of the text block within the shape, in degrees. */
  readonly rotation: number
  readonly columns: number
  readonly columnSpacingPt: number
  readonly paragraphs: readonly PptxParagraph[]
}

export interface PptxPlaceholderRef {
  /** `p:ph/@type`, defaulting to `body` as the schema specifies. */
  readonly type: string
  /** `p:ph/@idx`; omitted placeholders match on type alone. */
  readonly index: number | null
  readonly orientation: string | null
  readonly size: string | null
}

export type PptxFrameContent =
  | { readonly kind: 'table'; readonly table: PptxTable }
  | { readonly kind: 'chart'; readonly chart: PptxChart }
  | { readonly kind: 'diagram'; readonly dataPart: string | null; readonly layoutPart: string | null }
  | { readonly kind: 'ole'; readonly preview: BlipFill | null }
  | { readonly kind: 'unsupported'; readonly uri: string }

/**
 * `a:tcBorders`. Each side is a resolved line rather than a colour, because a
 * cell border carries width, dash and compound attributes exactly like a shape
 * outline does.
 */
export interface PptxTableBorders {
  readonly left: ShapeLine | null
  readonly right: ShapeLine | null
  readonly top: ShapeLine | null
  readonly bottom: ShapeLine | null
}

export const NO_CELL_BORDERS: PptxTableBorders = { left: null, right: null, top: null, bottom: null }

export interface PptxTableCell {
  readonly row: number
  readonly column: number
  readonly rowSpan: number
  readonly columnSpan: number
  readonly horizontalMerge: boolean
  readonly verticalMerge: boolean
  readonly anchor: 'top' | 'center' | 'bottom'
  readonly insets: { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number }
  readonly fill: ShapeFill
  readonly borders: PptxTableBorders
  readonly text: PptxTextBody | null
}

export interface PptxTable {
  readonly columnWidthsPt: readonly number[]
  readonly rowHeightsPt: readonly number[]
  /** `a:tblPr/@firstRow`, `bandRow`, … */
  readonly firstRow: boolean
  readonly bandRow: boolean
  readonly firstColumn: boolean
  readonly lastRow: boolean
  readonly lastColumn: boolean
  readonly bandColumn: boolean
  readonly cells: readonly PptxTableCell[]
}

export type PptxShapeKind =
  | 'shape'
  | 'picture'
  | 'connector'
  | 'group'
  | 'graphicFrame'
  | 'content'
  | 'unknown'

export interface PptxShape {
  readonly kind: PptxShapeKind
  /** `p:cNvPr/@id`, kept so a future editing surface can address shapes. */
  readonly id: string
  readonly name: string
  /** The part whose relationships resolve this shape's images and links. */
  readonly ownerPart: string
  readonly hidden: boolean
  readonly placeholder: PptxPlaceholderRef | null
  /** `null` when the shape has no transform and none could be inherited. */
  readonly transform: ShapeTransform | null
  readonly geometry: ShapeGeometry | null
  readonly fill: ShapeFill
  readonly line: ShapeLine
  readonly effects: ShapeEffects
  /** True when a `a:style` reference or the theme supplied the fill/line. */
  readonly styledByReference: boolean
  readonly text: PptxTextBody | null
  /** Group members, in authored order. */
  readonly children: readonly PptxShape[]
  /** Picture fill, for `p:pic` and for shapes filled with a blip. */
  readonly blip: BlipFill | null
  readonly frame: PptxFrameContent | null
  /**
   * `p:sp/@txBox`. A text box has no fill and no line by default, which is the
   * only structural difference from an auto shape.
   */
  readonly textBox: boolean
}

export type PptxBackground =
  | { readonly kind: 'none' }
  | { readonly kind: 'solid'; readonly color: OfficeColor }
  | { readonly kind: 'gradient'; readonly stops: readonly { readonly position: number; readonly color: OfficeColor }[]; readonly angle: number }
  | { readonly kind: 'picture'; readonly blip: BlipFill }

export interface PptxSlide {
  readonly index: number
  /** The slide part, e.g. `ppt/slides/slide2.xml`. */
  readonly part: string
  readonly layoutPart: string | null
  readonly masterPart: string | null
  readonly name: string
  /** `p:sld/@showMasterSp`, default `true`. */
  readonly showMasterShapes: boolean
  /** True when the slide hides the master's background graphics. */
  readonly showMasterBackground: boolean
  readonly background: PptxBackground
  /**
   * Master shapes, then layout shapes, then slide shapes — the order Office
   * paints them in. Kept flat at the top level but groups keep their nesting.
   */
  readonly shapes: readonly PptxShape[]
  readonly notesPart: string | null
}

export interface PptxSlideSize {
  readonly widthPt: number
  readonly heightPt: number
  /** `p:sldSz/@type`, e.g. `screen4x3`; informational. */
  readonly type: string | null
}

export interface PptxNotesSize {
  readonly widthPt: number
  readonly heightPt: number
}

export interface PptxPresentation {
  readonly name: string
  readonly size: PptxSlideSize
  readonly notesSize: PptxNotesSize | null
  readonly slides: readonly PptxSlide[]
  /** The theme of the first slide's master, used for deck-level defaults. */
  readonly theme: Theme
  /** `p:presentation/@firstSlideNum` / `showSpecialPlsOnTitleSld`. */
  readonly firstSlideNumber: number
}

/** Walk a slide's shape tree depth-first, parents before children. */
export function* walkShapes(shapes: readonly PptxShape[]): Generator<PptxShape> {
  for (const shape of shapes) {
    yield shape
    if (shape.children.length > 0) yield* walkShapes(shape.children)
  }
}

/** Every shape that paints a picture, including blip-filled shapes. */
export function* walkPictures(shapes: readonly PptxShape[]): Generator<PptxShape> {
  for (const shape of walkShapes(shapes)) {
    if (shape.kind === 'picture' || shape.blip) yield shape
  }
}
