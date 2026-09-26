/**
 * Unit conversion for the OOXML parsing layer.
 *
 * The internal document model is expressed in **points**, the unit every
 * OOXML host ultimately agrees on: Word stores twips and half-points, Excel
 * stores maximum-digit-width column units, PowerPoint stores EMU, and
 * DrawingML stores either EMU or a universal measure. Converting everything to
 * points once, here, keeps the rest of the engine free of per-format
 * arithmetic and makes the layout stage work in the same space as typography
 * (font sizes, indents and line heights are all natively points).
 *
 * CSS pixels appear exactly once, at paint time (`ptToPx`), so a renderer can
 * be swapped (DOM, canvas) without touching the model.
 */

/** ECMA-376 Part 1 §17.18.47: EMU per inch. */
export const EMU_PER_INCH = 914400
/** ECMA-376: EMU per point (914400 / 72). */
export const EMU_PER_PT = 12700
export const EMU_PER_CM = 360000
export const EMU_PER_MM = 36000
/** EMU per CSS pixel at 96 DPI (914400 / 96). */
export const EMU_PER_PX = 9525
/** Twips per point (a twip is 1/1440 inch, a point 1/72). */
export const TWIPS_PER_PT = 20
export const TWIPS_PER_INCH = 1440
/** Font sizes are stored in half-points. */
export const HALF_POINTS_PER_PT = 2
/** Border widths and table spacing are stored in eighths of a point. */
export const EIGHTH_POINTS_PER_PT = 8
/** Excel stores some metrics in hundredths of a millimetre / 1/100 mm. */
export const HUNDREDTH_MM_PER_PT = 2540 / 72
/** CSS pixels per point at 96 DPI (96 / 72). */
export const PT_TO_PX = 4 / 3

export function emuToPt(emu: number): number {
  return emu / EMU_PER_PT
}

export function ptToEmu(pt: number): number {
  return Math.round(pt * EMU_PER_PT)
}

export function emuToPx(emu: number): number {
  return emu / EMU_PER_PX
}

export function twipsToPt(twips: number): number {
  return twips / TWIPS_PER_PT
}

export function ptToTwips(pt: number): number {
  return Math.round(pt * TWIPS_PER_PT)
}

export function halfPointsToPt(halfPoints: number): number {
  return halfPoints / HALF_POINTS_PER_PT
}

export function ptToHalfPoints(pt: number): number {
  return Math.round(pt * HALF_POINTS_PER_PT)
}

export function eighthPointsToPt(eighths: number): number {
  return eighths / EIGHTH_POINTS_PER_PT
}

export function hundredthMmToPt(value: number): number {
  return value / HUNDREDTH_MM_PER_PT
}

export function ptToPx(pt: number): number {
  return pt * PT_TO_PX
}

export function pxToPt(px: number): number {
  return px / PT_TO_PX
}

const UNIVERSAL_MEASURE = /^\s*(-?[0-9]*\.?[0-9]+)\s*(mm|cm|in|pt|pc|pi|px)?\s*$/i

/**
 * Parse an `ST_Position`/`ST_PositiveUniversalMeasure` value: either a plain
 * EMU integer or a universal measure such as `1.5in`, `12pt`, `2.5cm`. A
 * trailing `f` suffix (legacy) and a percentage sign are not absolute measures
 * and are rejected so callers can fall back to their own default.
 */
export function universalMeasureToPt(value: string | null | undefined): number | undefined {
  if (value === null || value === undefined) return undefined
  const raw = value.trim()
  if (raw === '' || raw.endsWith('%')) return undefined
  const match = UNIVERSAL_MEASURE.exec(raw.endsWith('f') ? raw.slice(0, -1) : raw)
  if (!match) return undefined
  const amount = Number(match[1])
  if (!Number.isFinite(amount)) return undefined
  switch ((match[2] ?? '').toLowerCase()) {
    case 'mm':
      return (amount * EMU_PER_MM) / EMU_PER_PT
    case 'cm':
      return (amount * EMU_PER_CM) / EMU_PER_PT
    case 'in':
      return amount * 72
    case 'pt':
      return amount
    case 'pc':
      return amount * 12
    case 'pi':
      return amount * 15
    case 'px':
      return emuToPx(amount * EMU_PER_PX)
    default:
      /* Unitless values in ST_PositiveUniversalMeasure are EMU. */
      return emuToPt(amount)
  }
}

/** Resolve an EMU-or-universal-measure attribute to points, with a fallback. */
export function positionToPt(value: string | null | undefined, fallbackPt: number): number {
  const universal = universalMeasureToPt(value)
  if (universal !== undefined) return universal
  return fallbackPt
}

/**
 * ECMA-376 §18.3.1.13 / §18.3.1.81: a column width is expressed in units of the
 * maximum digit width of the Normal style font. `mdw` is that digit width in
 * pixels at 96 DPI; 8 is the fallback when the workbook's default font is
 * unavailable. Excel's own formula, kept verbatim so widths match the app.
 */
export const MDW_FALLBACK = 8

export function colWidthToPx(width: number, mdw: number = MDW_FALLBACK): number {
  return Math.trunc(((256 * width + Math.trunc(128 / mdw)) / 256) * mdw)
}

export function colWidthToPt(width: number, mdw: number = MDW_FALLBACK): number {
  return pxToPt(colWidthToPx(width, mdw))
}

/** Row heights are already points; the helper exists so the intent is explicit. */
export function rowHeightToPt(heightPt: number): number {
  return heightPt
}
