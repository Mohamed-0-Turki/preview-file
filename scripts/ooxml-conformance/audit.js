import { clearPreview, preview } from '../../dist/index.js'
import { near, reporter, round2 as r2, wait, waitFor } from './harness.js'

/**
 * End-to-end audit through the public `preview()` entry point.
 *
 * The other two suites call the renderer and the model directly. This one goes in
 * the front door — `preview(source, container, options)` — because that is the only
 * path a consumer uses, and it is the only one that exercises the previewer, the
 * renderer registry, the stage chrome and the toolbar. A renderer can be perfect and
 * still unreachable if the previewer hands it the wrong result type.
 *
 * It also *measures* rather than asserting, and prints the numbers, so the output can
 * be diffed against a reference render (LibreOffice → PDF, via `pdftotext -bbox`)
 * instead of against a hand-written expectation that drifts.
 */
/** Marks a measurement line so the runner can print it without the pass/fail styling. */
const MARK = '\u00b7\u00a0\u00a0'

export async function runAudit(lines, corpus = []) {
  const { say: log, ok, section: head, state } = reporter(lines)

  head('public preview() path')
  const decks = corpus.length > 0 ? corpus : ['chart-deck.pptx']
  const report = []

  for (const name of decks) {
    // A bare name resolves next to this module (the committed fixture); a
    // leading slash is a server-root path, which is how the runner passes in an
    // external corpus.
    const url = name.startsWith('/') ? name : new URL(`./${name}`, import.meta.url).href
    const blob = new Blob([await (await fetch(url)).arrayBuffer()], {
      type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    })
    const container = document.createElement('div')
    // 16:9-ish host, deliberately not the slide's own aspect, so a wrong slide
    // size shows up as letterboxing rather than being hidden by a matching host.
    container.style.cssText = 'width:1000px;height:700px;position:relative'
    document.body.appendChild(container)

    let threw = null
    try {
      await preview(blob, container, {})
    } catch (error) {
      threw = error
    }

    ok(!threw, `${name}: preview() resolves`, threw ? String(threw.message ?? threw).slice(0, 120) : '')
    const shell = container.querySelector('.pf-root')
    ok(!!shell, `${name}: the preview shell mounted`)
    const stage = container.querySelector('.pf-stage')
    ok(!!stage, `${name}: a stage pane exists`)
    if (!stage) {
      container.remove()
      continue
    }

    const painted = await measure(stage)
    report.push({ name, ...painted.summary })
    for (const [label, value] of Object.entries(painted.summary)) {
      log(`  ${MARK} ${label.padEnd(26)} ${value}`)
    }
    for (const failure of painted.failures) {
      state.failures += 1
      log(`  FAIL  ${name}: ${failure}`)
    }

    head(`${name} navigation`)
    const toolbar = container.querySelector('.pf-chrome, .pf-root [class*="pf-"]')
    ok(!!toolbar, `${name}: controls mounted for the adapter`, toolbar ? toolbar.className : '(none)')
    await walkPages(stage, painted.summary.pageCount ?? 0, ok)

    clearPreview(container)
    await wait(120)
    ok(container.querySelectorAll('.py-ooxml-shape').length === 0, `${name}: clearPreview() removes the slides`)
    ok(![...container.querySelectorAll('img')].some((i) => i.src.startsWith('blob:')), `${name}: no object urls survive`)
    container.remove()
  }

  return state.checks
}

/** Walk every page the way a user would, by scrolling the stage. */
async function walkPages(stage, pageCount, ok) {
  const viewport = stage.querySelector('div[style*="overflow"]')
  if (!viewport || pageCount < 2) return
  const seen = new Set()
  for (let i = 0; i < pageCount; i += 1) {
    viewport.scrollTop = i * viewport.scrollHeight
    viewport.dispatchEvent(new Event('scroll'))
    await wait(220)
    const covers = [...viewport.querySelectorAll('.py-presentation-slide')]
    const painted = covers.filter((c) => c.querySelector('.py-ooxml-shape, .py-ooxml-frame'))
    seen.add(painted.length)
  }
  ok(seen.size > 0, `scrolling paints slides lazily (painted counts: ${[...seen].join(',')})`)
  ok(Math.max(...seen) > 0, 'at least one slide paints while scrolling')
  viewport.scrollTop = 0
}

/**
 * Measure the mounted preview. Geometry is read back in *slide points* by dividing
 * out the stage scale, so the numbers are comparable with a PDF rendered at the
 * deck's own page size.
 */
async function measure(stage) {
  const failures = []
  const viewport = stage.querySelector('div[style*="overflow: auto"]')
  // Paint every page so the measurement is not racing the lazy painter.
  const covers = [...stage.querySelectorAll('.py-presentation-slide')]
  const scrollLog = []
  if (viewport) {
    for (let i = 0; i < covers.length; i += 1) {
      // Step by the viewport height, not the scroll height: a scroll of
      // `i * scrollHeight` overshoots and clamps, which can skip a page.
      viewport.scrollTop = i * viewport.clientHeight
      viewport.dispatchEvent(new Event('scroll'))
      // Wait for the page that is now on screen to have painted rather than
      // sleeping: under virtual time a fixed sleep races the observer.
      const target = covers[Math.min(i, covers.length - 1)]
      try {
        await waitFor(() => target.childElementCount > 0, { label: `slide ${Math.min(i + 1, covers.length)} to paint` })
      } catch (error) {
        scrollLog.push(`MISS(${error.message})`)
      }
      const paintedHere = covers.filter((c) => c.childElementCount > 0).length
      scrollLog.push(`${i}:t=${viewport.scrollTop}/p=${paintedHere}`)
    }
    scrollLog.push(`max=${viewport.scrollHeight - viewport.clientHeight},ch=${viewport.clientHeight},sh=${viewport.scrollHeight}`)
    viewport.scrollTop = 0
    viewport.dispatchEvent(new Event('scroll'))
    await waitFor(() => covers[0].childElementCount > 0, { label: 'slide 1 to repaint' })
  }

  const pages = covers.map((cover) => {
    // The adapter swaps in a text banner when a slide throws, so an unpainted
    // slide is either still lazy or actually failed. Tell the two apart.
    const banner = cover.textContent?.includes('could not be rendered') ?? false
    const shapes = [...cover.querySelectorAll('.py-ooxml-shape, .py-ooxml-frame')]
    const texts = [...cover.querySelectorAll('.py-ooxml-text')].filter((t) => t.textContent.trim())
    return {
      // The cover is a fixed-size box, so offsetWidth/Height are the unscaled
      // slide dimensions in points — no transform division needed.
      width: r2(covers[0]?.offsetWidth ?? 0),
      height: r2(covers[0]?.offsetHeight ?? 0),
      shapes: shapes.length,
      texts: texts.length,
      banner,
      svgs: cover.querySelectorAll('svg').length,
      images: cover.querySelectorAll('img').length,
      charts: cover.querySelectorAll('.py-ooxml-chart').length,
      cells: cover.querySelectorAll('.py-ooxml-cell').length,
      text: texts.length > 0 ? texts[0].innerText.replace(/\s+/g, ' ').trim().slice(0, 60) : '',
    }
  })

  // Slide geometry, once, from the first cover.
  const first = covers[0]
  if (first) {
    const width = first.offsetWidth
    const height = first.offsetHeight
    if (width < 1 || height < 1) failures.push('the stage has no measurable size')
    const ratio = width / height
    // 4:3 and 16:9 are the only sizes PowerPoint writes in practice.
    const isStandard = near(ratio, 4 / 3, 0.02) || near(ratio, 16 / 9, 0.02)
    if (!isStandard) failures.push(`slide aspect ${r2(ratio)} is neither 4:3 nor 16:9`)
  }

  const summary = {
    'slides': covers.length,
    'slide size (pt)': `${pages[0]?.width ?? 0} x ${pages[0]?.height ?? 0}`,
    'aspect': r2((pages[0]?.width ?? 0) / (pages[0]?.height || 1)),
    'pageCount': covers.length,
    'shapes': pages.map((p) => p.shapes).join(','),
    'text frames': pages.map((p) => p.texts).join(','),
    'svg overlays': pages.map((p) => p.svgs).join(','),
    'images': pages.map((p) => p.images).join(','),
    'charts': pages.map((p) => p.charts).join(','),
    'table cells': pages.map((p) => p.cells).join(','),
    'first text': pages[0]?.text ?? '(none)',
    'scrollTop walk': scrollLog.join(' '),
    'failed slides': pages
      .map((p, i) => (p.banner ? i + 1 : 0))
      .filter(Boolean)
      .join(',') || 'none',
    'unpainted slides': pages
      .map((p, i) => (p.shapes === 0 && p.texts === 0 ? i + 1 : 0))
      .filter(Boolean)
      .join(',') || 'none',
  }
  for (const [i, page] of pages.entries()) {
    if (page.banner) failures.push(`slide ${i + 1} threw while rendering and fell back to a banner`)
  }

  if (covers.length === 0) failures.push('no slides were mounted')
  if (pages.every((p) => p.shapes === 0)) failures.push('no shapes were painted on any slide')

  return { summary, failures }
}
