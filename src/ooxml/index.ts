/**
 * The OOXML layer: OPC package access, guarded XML parsing, DrawingML property
 * resolution, themes, geometry, and the per-host-format parsers built on them.
 *
 * Nothing in here touches the DOM, creates object URLs, or knows how anything is
 * painted. It is the byte-to-model half of the engine, and it is shared by every
 * host format so that Word, Excel and PowerPoint agree on units, colours and
 * geometry instead of each re-deriving them.
 *
 * `renderers/office/` consumes this; nothing imports from `renderers/`.
 */

export { OfficePackage, isCompoundFile, normalizePartName, resolvePartName } from './package.js'
export type { OfficeKind, OfficePackagePart, OfficeRelationship } from './package.js'

export { OoxmlError, isOoxmlError } from './errors.js'
export type { OoxmlErrorCode } from './errors.js'

export {
  NS,
  attr,
  attrBool,
  attrEnum,
  attrInt,
  attrNumber,
  childOf,
  childrenOf,
  descendantsOf,
  parseXml,
  parseXmlOrNull,
  relAttr,
  resolveAlternateContent,
  textOf,
  unwrapAlternateContent,
  xmlSpace,
} from './xml.js'

export {
  EMU_PER_CM,
  EMU_PER_INCH,
  EMU_PER_PT,
  HALF_POINTS_PER_PT,
  PT_TO_PX,
  emuToPt,
  halfPointsToPt,
  ptToEmu,
  ptToPx,
  ptToTwips,
  twipsToPt,
  universalMeasureToPt,
} from './units.js'

export {
  BLACK,
  WHITE,
  applyColorTransforms,
  argbToColor,
  colorChoiceIn,
  colorChoiceOf,
  colorToCss,
  colorToHex,
  hexToColor,
  isBlack,
  isColorChoice,
  parseColorElement,
  parseColorTransforms,
} from './color.js'
export type { ColorTransforms, OfficeColor, SchemeColorResolver } from './color.js'

export { Theme } from './theme.js'
export type {
  ColorSlot,
  GradientStop,
  GlowEffect,
  LineCap,
  LineCompound,
  ReflectionEffect,
  ShadowEffect,
  ThemeEffectStyle,
  ThemeFill,
  ThemeFonts,
  ThemeLine,
} from './theme.js'

export {
  applyTransform,
  composeTransform,
  determinant,
  invertTransform,
  isIdentity,
  rectFromPoints,
  transformedBounds,
  translateTransform,
  unionRects,
} from './geom.js'
export type { FractionRect, Point, Rect, Size, Transform2D } from './geom.js'

export { isUnitBoxPath, parseCustomGeometry, presetGeometry, presetNames, scalePath, unitPathBounds } from './geometry.js'
export type { CustomGeometry, GeometryPath, PathCommand, PresetGeometry, PresetName } from './geometry.js'

export {
  DEFAULT_CHARACTER,
  DEFAULT_LINE,
  DEFAULT_TEXT_BODY,
  IDENTITY_TRANSFORM,
  NO_EFFECTS,
  childSpaceMatrix,
  mergeCharacterProperties,
  parseCharacterProperties,
  parseEffectList,
  parseFillChoice,
  isBoundingBoxShape,
  parseGeometry,
  parseLine,
  parseStyleMatrix,
  parseTextBody,
  parseTextDefaults,
  parseTransform,
  resolveShapeProperties,
  shapeBounds,
  themeFillToShapeFill,
  unitBoxMatrix,
} from './drawingml.js'
export type {
  Arrowhead,
  ArrowheadKind,
  BlipEffect,
  BlipFill,
  ChildSpace,
  PropertySources,
  ShapeEffects,
  ShapeFill,
  ShapeGeometry,
  ShapeLine,
  ShapeProperties,
  ShapeTransform,
  StyleMatrix,
  StyleRef,
  TextAutofit,
  TextBodyProperties,
  TextCharacterProperties,
  TextDefaults,
} from './drawingml.js'

export { parsePresentation, resolveTypeface } from './pptx/parse.js'
export type { TextBodyOptions } from './pptx/parse.js'
export { parseChart } from './pptx/chart.js'
export type {
  PptxChart,
  PptxChartAxis,
  PptxChartKind,
  PptxChartPoint,
  PptxChartSeries,
} from './pptx/chart.js'
export { walkPictures, walkShapes } from './pptx/model.js'
export type {
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
  PptxShapeKind,
  PptxSlide,
  PptxSlideSize,
  PptxTable,
  PptxTableCell,
  PptxTextBody,
} from './pptx/model.js'
