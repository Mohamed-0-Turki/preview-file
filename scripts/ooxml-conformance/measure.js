import { clearPreview, preview } from '../../dist/index.js'
import { waitFor } from './harness.js'

/**
 * Word-level measurement of a deck rendered through the public `preview()` API.
 *
 * This is the browser half of the fidelity comparison. The other half is a PDF
 * rendered by LibreOffice from the same file and read with `pdftotext -bbox`,
 * which reports one box per word in page coordinates. Both sides are in slide
 * points, so the two sets of boxes can be differenced directly — which is how a
 * "looks about right" impression becomes a number.
 *
 * Coordinates are taken from the *visual* rect and divided by the stage scale.
 * Group scaling and rotation therefore come out already applied, matching what
 * the PDF shows, which is the thing being compared.
 */
export async function measureCorpus(names) {
  const decks = []
  for (const name of names) {
    const url = name.startsWith('/') ? name : new URL(`./${name}`, import.meta.url).href
    const blob = new Blob([await (await fetch(url)).arrayBuffer()], {
      type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    })
    const container = document.createElement('div')
    container.style.cssText = 'width:1000px;height:700px;position:relative'
    document.body.appendChild(container)
    await preview(blob, container, {})
    const stage = container.querySelector('.pf-stage')
    const viewport = stage?.querySelector('div[style*="overflow: auto"]')
    const covers = [...(stage?.querySelectorAll('.py-presentation-slide') ?? [])]
    const pages = []
    /* Measure each page while it is the scrolled-to page. Capturing the cover's
       origin and the word boxes in different scroll positions offsets every box by
       the scroll delta — a whole page pitch, which reads as a layout error rather
       than a measurement one. */
    for (const [i, cover] of covers.entries()) {
      if (viewport) {
        viewport.scrollTop = i * viewport.clientHeight
        viewport.dispatchEvent(new Event('scroll'))
      }
      await waitFor(() => cover.childElementCount > 0, { label: `slide ${i + 1} of ${name}` })
      const origin = cover.getBoundingClientRect()
      pages.push({
        width: cover.offsetWidth,
        height: cover.offsetHeight,
        words: words(cover, origin),
      })
    }
    decks.push({ deck: name.split('/').pop(), pages })
    clearPreview(container)
    container.remove()
  }
  return decks
}

/** Every visible word in a slide, with the resolved run style it was painted with. */
function words(cover, origin) {
  const scale = scaleOf(cover)
  const out = []
  for (const box of cover.querySelectorAll('.py-ooxml-text')) {
    for (const node of box.querySelectorAll('span, div')) {
      for (const text of node.childNodes) {
        if (text.nodeType !== 3) continue
        const style = getComputedStyle(node)
        const parts = text.textContent.split(/(\s+)/)
        let offset = 0
        for (const part of parts) {
          offset += part.length
          if (part.trim() === '') continue
          // Locate the word inside the text node by walking its characters.
          const start = offset - part.length
          const range = document.createRange()
          range.setStart(text, start)
          range.setEnd(text, start + part.length)
          const rect = range.getBoundingClientRect()
          if (rect.width === 0 && rect.height === 0) continue
          out.push({
            t: part,
            x: round((rect.x - origin.x) / scale),
            y: round((rect.y - origin.y) / scale),
            w: round(rect.width / scale),
            h: round(rect.height / scale),
            size: Math.round(parseFloat(style.fontSize) * 10) / 10,
            weight: style.fontWeight,
            color: style.color,
            align: style.textAlign,
            lineHeight: style.lineHeight,
          })
        }
      }
    }
  }
  return out
}

/** The stage scale, read from the transform on the slide container. */
function scaleOf(cover) {
  let node = cover.parentElement
  while (node) {
    const m = /scale\(([\d.]+)\)/.exec(node.style.transform ?? '')
    if (m) return Number(m[1]) || 1
    node = node.parentElement
  }
  return 1
}

const round = (n) => Math.round(n * 10) / 10
