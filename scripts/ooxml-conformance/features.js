import { OfficePackage, parsePresentation } from '../../dist/ooxml/index.js'
import { renderSlide } from '../../dist/renderers/ooxml/render.js'
import { reporter } from './harness.js'

/**
 * XML → DOM conformance for the properties real decks lean on.
 *
 * A deck declares a fill, a stroke or an effect in XML; this reads the same file and
 * asks whether the painted node actually reflects it. That is a stricter and more
 * useful question than "does it look right", because it does not depend on the
 * substituted font, the viewport or the reference renderer — the declaration and the
 * computed style either correspond or they do not.
 *
 * The census that motivated it, over four real-world decks, was: 485 alpha
 * expressions, 278 `a:prstDash`, 97 shadow effects, 30 `a:lnSpc`, 27 `a:buChar`,
 * 7 gradient fills. Those counts, not intuition, set the priority order.
 */
export async function runFeatures(lines, corpus) {
  const { say, ok, section, state } = reporter(lines)
  // The committed fixture guards these features on every run; the corpus is extra
  // evidence, so the default here matches the audit's rather than being empty when
  // nobody passes a corpus.
  const names = corpus.length > 0 ? corpus : ['chart-deck.pptx']
  const tally = { alpha: [0, 0], dash: [0, 0], shadow: [0, 0], gradient: [0, 0], bullet: [0, 0], lineSpacing: [0, 0] }

  for (const name of names) {
   try {
    const url = name.startsWith('/') ? name : new URL(`./${name}`, import.meta.url).href
    const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer())
    const pkg = await OfficePackage.open(bytes, 'probe.pptx')
    const pres = await parsePresentation(pkg, 'probe.pptx')
    const xml = await xmlOf(pkg, pres)

    section(`${name}: declared properties reach the DOM`)
    const host = document.createElement('div')
    host.style.cssText = 'position:relative;width:960px;height:540px'
    document.body.appendChild(host)
    pres.slides.forEach((slide, i) => {
      const cover = document.createElement('div')
      cover.style.cssText = 'position:relative;width:960px;height:540px;overflow:hidden'
      host.appendChild(cover)
      renderSlide(slide, cover, {})
      cover.dataset['slide'] = String(i + 1)
    })

    const alpha = declared(xml, /<a:alpha val="(\d+)"/g)
    // `solid` is an explicit request for a continuous line, so counting it would
    // report a gap that does not exist: the corpus declares 276 `solid` and 2 real
    // patterns, and mistaking the first for the second is how a tally of "278 dashes"
    // turns into a feature nobody needed.
    const dashes = (xml.match(/<a:prstDash val="(?!solid)(\w+)"/g) ?? []).length
    const shadows = declared(xml, /<a:outerShdw/g)
    const gradients = declared(xml, /<a:gradFill/g)

    if (alpha > 0) {
      const translucent = [...host.querySelectorAll('*')].filter((el) => {
        const bg = getComputedStyle(el).backgroundColor
        const m = /rgba?\([^)]*?([\d.]+)\)$/.exec(bg)
        return m && Number(m[1]) < 0.999
      }).length
      tally.alpha[0] += alpha
      tally.alpha[1] += translucent
      ok(translucent > 0, `${name}: ${alpha} alpha expressions produce translucent paint`, `${translucent} nodes`)
    }
    if (dashes > 0) {
      // A preset reaches the DOM as `stroke-dasharray` on a path or as a dashed
      // border style, depending on which painter owns the shape, so both count.
      const dashed = [...host.querySelectorAll('*')].filter((el) => {
        if (el.getAttribute('stroke-dasharray')) return true
        const s = getComputedStyle(el)
        return s.borderTopStyle !== 'solid' && s.borderTopWidth !== '0px'
      }).length
      tally.dash[0] += dashes
      tally.dash[1] += dashed
      ok(dashed > 0, `${name}: ${dashes} non-solid dash presets reach the DOM`, `${dashed} nodes`)
    }
    if (shadows > 0) {
      const shadowed = [...host.querySelectorAll('*')].filter((el) => {
        const s = getComputedStyle(el)
        return s.boxShadow !== 'none' || s.filter !== 'none'
      }).length
      tally.shadow[0] += shadows
      tally.shadow[1] += shadowed
      ok(shadowed > 0, `${name}: ${shadows} outerShdw effects are painted`, `${shadowed} nodes`)
    }
    if (gradients > 0) {
      const grads = [...host.querySelectorAll('*')].filter((el) => {
        const bg = getComputedStyle(el).backgroundImage
        return bg.includes('gradient')
      }).length
      tally.gradient[0] += gradients
      tally.gradient[1] += grads
      ok(grads > 0, `${name}: ${gradients} gradient fills are painted`, `${grads} nodes`)
    }
    /* A declared `a:lnSpc` has to become an explicit `line-height` on the row,
     * because the alternative is inheriting whatever the host page sets — which is
     * the bug this suite exists to catch. Counting the declarations is therefore
     * the same question as counting the rows that carry an explicit one. */
    const spacingDeclared = declared(xml, /<a:lnSpc>/g)
    const spacingPainted = [...host.querySelectorAll('.py-ooxml-text > div > div')]
      .filter((row) => row.style.lineHeight && row.style.lineHeight !== '').length
    tally.lineSpacing[0] += spacingDeclared
    tally.lineSpacing[1] += spacingPainted
    if (spacingDeclared > 0) {
      ok(spacingPainted > 0, `${name}: ${spacingDeclared} a:lnSpc become an explicit line-height`,
        `${spacingPainted} rows`)
    }

    const bulletsDeclared = declared(xml, /<a:bu(?:Char|AutoNum) /g) + declared(xml, /<a:bu(?:Char|AutoNum)>/g)
    const bulletsPainted = [...host.querySelectorAll('.py-ooxml-text span[style*="user-select"]')].length
    tally.bullet[0] += bulletsDeclared
    tally.bullet[1] += bulletsPainted
    if (bulletsDeclared > 0) {
      ok(bulletsPainted > 0, `${name}: ${bulletsDeclared} bullet declarations produce a marker`,
        `${bulletsPainted} markers`)
    }

    host.remove()
   } catch (error) {
    ok(false, `${name}: feature census completed`, String(error && error.message ? error.message : error))
   }
  }

    section('corpus totals')
  for (const [key, [declaredCount, painted]] of Object.entries(tally)) {
    say(`  \u00b7 ${key.padEnd(12)} ${painted} painted / ${declaredCount} declared`)
  }
  return state.checks
}

function declared(xml, pattern) {
  pattern.lastIndex = 0
  return (xml.match(pattern) ?? []).length
}

/** Every slide's XML, concatenated, for counting declarations. */
async function xmlOf(pkg, pres) {
  const parts = []
  for (const slide of pres.slides) parts.push((await pkg.text(slide.part)) ?? '')
  return parts.join('\n')
}
