/**
 * Text layout.
 *
 * DrawingML text is laid out by Office, not by the browser, so the goal here is
 * not a reimplementation of its line breaker. It is to produce boxes that look
 * right for the shapes that dominate real decks — left/centre/right text,
 * bullets, vertical anchoring, and `normAutofit` shrinkage — and to stay out of
 * the way otherwise, letting the browser break lines.
 *
 * The important consequence: **insets, anchoring and autofit are done here, but
 * line breaking is the browser's**. A shape whose text overflows will overflow
 * visibly rather than being silently reflowed at a different font metric, which
 * is the failure mode a hand-rolled breaker produces.
 */

import { colorToCss } from '../../ooxml/color.js'
import type { TextCharacterProperties } from '../../ooxml/drawingml.js'
import type {
  PptxBullet,
  PptxParagraph,
  PptxParagraphAlign,
  PptxRun,
  PptxTextBody,
} from '../../ooxml/pptx/model.js'
import { el, setStyle, type StyleMap } from './dom.js'

const ALIGN: Readonly<Record<PptxParagraphAlign, string>> = {
  left: 'left',
  center: 'center',
  right: 'right',
  justify: 'justify',
  // `distribute` evens the inter-character gaps, which CSS can only approximate;
  // it is visually closest to justified with a wide tolerance.
  distribute: 'justify',
}

const JUSTIFY_ALL = 'justify'

function runStyle(run: PptxRun): StyleMap {
  const p: TextCharacterProperties = run.properties
  const style: StyleMap = {
    fontSize: p.sizePt,
    fontWeight: p.bold ? 700 : 400,
    fontStyle: p.italic ? 'italic' : 'normal',
    color: p.color ? colorToCss(p.color) : null,
    fontFamily: run.fontFamily || null,
    letterSpacing: p.spacingPt === 0 ? null : p.spacingPt,
  }
  if (p.underline !== 'none') style.textDecoration = 'underline'
  if (p.strike !== 'noStrike') {
    style.textDecoration = style.textDecoration ? `${style.textDecoration} line-through` : 'line-through'
  }
  if (p.caps === 'all') style.textTransform = 'uppercase'
  if (p.caps === 'small') style.textTransform = 'lowercase'
  if (p.caps === 'smallCaps') style.fontVariantCaps = 'small-caps'
  if (p.baselinePercent !== 0) {
    // CSS has no baseline shift, so the run is sized and offset instead.
    style.verticalAlign = p.baselinePercent > 0 ? 'super' : 'sub'
    style.fontSize = p.sizePt * (p.baselinePercent > 0 ? 0.66 : 0.66)
  }
  if (p.highlight) style.backgroundColor = colorToCss(p.highlight)
  if (p.underlineColor) style.textDecorationColor = colorToCss(p.underlineColor)
  if (p.kerningPt > 0) style.fontKerning = 'normal'
  else style.fontKerning = 'none'
  if (p.language) style.lang = p.language
  return style
}

function bulletGlyph(bullet: PptxBullet): string | null {
  if (bullet.kind === 'none') return null
  if (bullet.kind === 'picture') return '▦'
  if (bullet.kind === 'autoNumber') {
    // `char` is the resolved format — `1.`, `(1)`, `a.` — so the ordinal goes in
    // front of it. A list that renders every item as the same glyph is not a list.
    const ordinal = bullet.ordinal ?? 1
    return bullet.char ? `${ordinal}${bullet.char.slice(1)}` : `${ordinal}.`
  }
  return bullet.char || '•'
}

function bulletStyle(bullet: PptxBullet): StyleMap {
  return {
    color: bullet.color ? colorToCss(bullet.color) : null,
    fontSize: bullet.sizePercent > 0 ? `${bullet.sizePercent}%` : null,
    fontFamily: bullet.fontFamily || null,
  }
}

function paragraphStyle(paragraph: PptxParagraph, isLast: boolean): StyleMap {
  const spacing = paragraph.lineSpacing
  const style: StyleMap = {
    textAlign: ALIGN[paragraph.align] ?? 'left',
    marginLeft: paragraph.marginLeftPt,
    // A negative `indent` is the hanging bullet: the glyph sits in the margin
    // and the text starts at `marginLeft`, so it is expressed as a negative
    // text-indent rather than as a negative margin.
    textIndent: paragraph.indentPt,
    marginTop: isLast ? 0 : paragraph.spaceBeforePt,
    marginBottom: isLast ? 0 : paragraph.spaceAfterPt,
  }
  if (spacing.percent !== null) {
    style.lineHeight = spacing.percent
  } else if (spacing.points !== null) {
    // Point-authored leading is absolute, so it becomes a fixed line height.
    style.lineHeight = `${spacing.points}pt`
  }
  if (paragraph.align === 'distribute' && !paragraph.runs.some((run) => run.text.length > 0)) {
    style.textAlign = JUSTIFY_ALL
  }
  return style
}

const BULLET_GLYPHS: Readonly<Record<string, string>> = {
  arrow: '➢',
  check: '✓',
  o: '○',
  '●': '●',
}

/** The `fontFamily` a Symbol/Wingdings bullet needs, kept beside the glyph. */
function bulletFont(bullet: PptxBullet): string {
  if (bullet.fontFamily) return bullet.fontFamily
  return 'inherit'
}

export interface TextLayoutOptions {
  /** Shape width and height in points, used to size the text box. */
  readonly widthPt: number
  readonly heightPt: number
  /** Shape rotation in degrees, applied to the text block like Office does. */
  readonly rotation: number
  /** `fontScale` from `a:normAutofit`, already normalised to 0..1. */
  readonly fontScale: number
}

/**
 * Build the text box for a shape.
 *
 * The returned element is absolutely positioned and sized to the shape's
 * *content* box (the box minus its insets), so the caller only has to place it.
 * An empty text body yields `null` so the caller can skip the node entirely
 * rather than leaving an empty, still-hittable layer in the tree.
 */
export function buildText(text: PptxTextBody, options: TextLayoutOptions): HTMLDivElement | null {
  if (text.paragraphs.length === 0) return null;

  const scale = options.fontScale > 0 ? options.fontScale : 1
  const box = el('div', 'py-ooxml-text', {
    position: 'absolute',
    left: 0,
    top: 0,
    width: Math.max(0, options.widthPt - text.insets.left - text.insets.right),
    height: Math.max(0, options.heightPt - text.insets.top - text.insets.bottom),
    boxSizing: 'border-box',
    overflow: 'visible',
    display: 'flex',
    flexDirection: 'column',
    // `line-height` is inherited, and a unitless value from the host page is
    // recomputed against each run's own size — so a page with the very common
    // `body { line-height: 1.5 }` would silently re-space every text block in the
    // deck. PowerPoint's default is single spacing, which is the font's own
    // leading, so `normal` is both the correct value and a reset. A paragraph
    // that declares `a:lnSpc` still overrides this.
    lineHeight: 'normal',
    // The insets are applied to the block itself, so the block can be shifted
    // and rotated as a unit without the text inside it shifting twice.
    marginLeft: text.insets.left,
    marginTop: text.insets.top,
    marginRight: text.insets.right,
    marginBottom: text.insets.bottom,
  })

  if (options.rotation !== 0) {
    box.style.transform = `rotate(${options.rotation}deg)`
  }
  if (text.vertical !== 'horz') {
    box.style.writingMode = text.vertical === 'vert' || text.vertical === 'eaVert' ? 'vertical-rl' : 'vertical-rl'
    if (text.vertical === 'vert270') box.style.transform = 'rotate(180deg)'
  }
  if (text.columns > 1) {
    box.style.columnCount = String(text.columns)
    box.style.columnGap = `${text.columnSpacingPt}pt`
  }

  const inner = el('div', undefined, {
    flexGrow: 1,
    display: 'flex',
    flexDirection: 'column',
    justifyContent:
      text.anchor === 'center' ? 'center' : text.anchor === 'bottom' ? 'flex-end' : 'flex-start',
    minHeight: 0,
  })
  if (scale !== 1) inner.style.fontSize = `${scale * 100}%`

  text.paragraphs.forEach((paragraph, index) => {
    inner.appendChild(buildParagraph(paragraph, index === text.paragraphs.length - 1))
  })

  box.appendChild(inner)
  return box
}

/**
 * The size that governs a paragraph's line box: the largest run in it.
 *
 * Office sizes a line by its tallest run, so a paragraph mixing 12pt labels with a
 * 20pt headline gets the headline's leading. Falls back to `endParaRPr` for a
 * paragraph with no runs, and to `null` — meaning "inherit" — when neither declares
 * a size, which is the only case where the surrounding context is the right answer.
 */
function paragraphBaseSize(paragraph: PptxParagraph): number | null {
  let size = 0
  for (const run of paragraph.runs) size = Math.max(size, run.properties.sizePt)
  if (size > 0) return size
  return paragraph.endProperties && paragraph.endProperties.sizePt > 0
    ? paragraph.endProperties.sizePt
    : null
}

function buildParagraph(paragraph: PptxParagraph, isLast: boolean): HTMLDivElement {
  const row = el('div', undefined, paragraphStyle(paragraph, isLast))
  /* The row carries no runs of its own, so without an explicit size its strut is
     whatever the host page inherits — commonly 13–16px, which is smaller than the
     text it contains. That mis-sizes the line box, mis-places the baseline, and
     makes an empty paragraph or a bullet render at the wrong height. Sizing the
     row from its own runs keeps the strut honest. */
  const strut = paragraphBaseSize(paragraph)
  if (strut !== null) row.style.fontSize = `${strut}px`
  if (paragraph.align === 'justify') row.style.textAlignLast = 'left'
  if (paragraph.align === 'distribute') row.style.textAlignLast = 'justify'

  const glyph = bulletGlyph(paragraph.bullet)
  if (glyph) {
    const marker = el('span', undefined, {
      ...bulletStyle(paragraph.bullet),
      fontFamily: bulletFont(paragraph.bullet),
      display: 'inline-block',
      // The bullet occupies the hanging indent, so it is pulled back into it.
      marginLeft: `${-Math.abs(paragraph.indentPt || 0)}pt`,
      marginRight: '0.25em',
      userSelect: 'none',
    })
    marker.textContent = BULLET_GLYPHS[glyph] ?? glyph
    row.appendChild(marker)
  }

  // One span per run: PowerPoint styles text per run, so a span has to be
  // closed at every run boundary or the later run's colour, weight or size
  // silently repaints the earlier words.
  let current: HTMLSpanElement | null = null
  for (const run of paragraph.runs) {
    if (run.breakBefore && current) {
      current.appendChild(document.createElement('br'))
      current = null
    }
    const span = el('span')
    setStyle(span, runStyle(run))
    span.appendChild(document.createTextNode(run.text))
    row.appendChild(span)
    current = span
  }

  // A paragraph with no runs still occupies a line, sized by its endParaRPr.
  if (!current && paragraph.endProperties) {
    const spacer = el('span', undefined, {
      fontSize: paragraph.endProperties.sizePt,
      display: 'inline-block',
    })
    row.appendChild(spacer)
  }

  return row
}
