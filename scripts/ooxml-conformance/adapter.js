import { PresentationRenderer } from '../../dist/renderers/index.js'
import { near, reporter, round2 as r2, wait } from './harness.js'

/**
 * The renderer adapter as the rest of the app uses it: a `Renderer` that is
 * handed a `PreviewResult` and a container, returning a `PreviewAdapter`.
 *
 * The parser suite proves the model and the painting are right; this one proves
 * the deck still gets onto the screen, at the right scale, in the right order,
 * and that the object URLs and the DOM are handed back on teardown.
 */
export async function runAdapter(lines) {
  const { say: log, ok, section: head, state } = reporter(lines)

  const blob = new Blob([await (await fetch(new URL('./chart-deck.pptx', import.meta.url))).arrayBuffer()])
  const host = document.createElement('div')
  host.style.cssText = 'width:960px;height:540px;position:relative'
  document.body.appendChild(host)

  const renderer = new PresentationRenderer()
  const mime = 'application/vnd.presentation'
  head('adapter registration')
  ok(renderer.supportedTypes.join() === mime, 'supportedTypes is the presentation mime', renderer.supportedTypes.join())
  ok(renderer.canRender(mime), 'canRender accepts a presentation')
  ok(!renderer.canRender('application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
    'canRender rejects a word document')

  const adapter = await renderer.render(host, {
    data: { format: 'pptx', blob },
    name: 'chart-deck.pptx',
    size: blob.size,
    type: mime,
  })
  await wait(500)

  head('stage and scaling')
  const viewport = host.querySelector('div[style*="overflow: auto"]')
  const stage = viewport?.querySelector('div[style*="will-change"]')
  const content = stage?.firstElementChild
  ok(!!viewport, 'a scrolling viewport exists')
  ok(!!stage, 'the stage is a single element', stage?.getAttribute('style')?.slice(0, 90) ?? '(none)')
  // A 540pt slide in a 540px box has to shrink to fit; the content keeps the
  // unscaled point geometry so nothing reflows when the scale changes.
  const scale = Number(/scale\(([\d.]+)\)/.exec(content?.style.transform ?? '')?.[1] ?? 0)
  ok(scale > 0.5 && scale < 1, 'fit-page scale is under 1 for a 540pt slide in a 540px box', `scale=${r2(scale)}`)
  ok(near(parseFloat(stage.style.width), 960 * scale, 1.5), 'the stage box is the scaled slide width',
    `${stage.style.width} vs ${r2(960 * scale)}`)
  ok(near(parseFloat(content.style.width), 960, 0.5), 'the content keeps the unscaled point geometry', content.style.width)

  head('lazy painting and navigation')
  const covers = [...host.querySelectorAll('.py-presentation-slide')]
  const painted = () => [...host.querySelectorAll('.py-presentation-slide')].filter((c) => c.querySelector('.py-ooxml-shape'))
  ok(covers.length === 4, 'every slide has a cover in the DOM', `${covers.length}`)
  ok(painted().length < 4, 'slides are painted lazily, not all up front', `${painted().length} of 4`)
  ok(painted()[0] === covers[0], 'the first visible slide is painted')

  /* Every slide's absolutely positioned children need a positioned ancestor inside
   * that slide. Without one they resolve against the deck-level content box and all
   * the slides stack at the top of the deck. A check that only counts elements
   * cannot see that, because every element is still present — so the containing
   * block itself is what gets asserted here. */
  const staticCovers = covers.filter((c) => getComputedStyle(c).position === 'static')
  ok(staticCovers.length === 0, 'every slide cover is a containing block',
    `${staticCovers.length} of ${covers.length} are static`)

  /* And the consequence: a shape on the second slide must sit inside that slide's
   * box, not inside the first slide's. */
  const second = covers[1]?.querySelector('.py-ooxml-shape')
  if (second) {
    const coverRect = covers[1].getBoundingClientRect()
    const shapeRect = second.getBoundingClientRect()
    ok(shapeRect.top >= coverRect.top - 1,
      'a shape on slide 2 is positioned inside slide 2',
      `${r2(shapeRect.top - coverRect.top)}px from the cover top`)
  }

  adapter.pages.nextPage()
  await wait(400)
  ok(painted().includes(covers[1]), 'nextPage paints the slide it reveals', `${painted().length} painted`)
  ok(adapter.pages.pageCount === 4, 'pageCount matches the slide count', `${adapter.pages.pageCount}`)
  ok(adapter.pages.page === 2, 'the current page advances', `${adapter.pages.page}`)

  head('zoom and fit')
  const before = content.style.transform
  const percent = adapter.zoomPercent
  adapter.zoomIn()
  await wait(200)
  ok(content.style.transform !== before, 'zoomIn changes the stage transform',
    `${before.slice(0, 22)} -> ${content.style.transform.slice(0, 22)}`)
  ok(adapter.zoomPercent > percent, 'zoomIn raises the reported percent', `${percent} -> ${adapter.zoomPercent}`)
  adapter.resetZoom()
  await wait(200)
  // `resetZoom` is the shared docview contract: back to fit-width, not the
  // initial fit-page. Both are fits, so both must keep the slide in view.
  const fitWidth = Number(/scale\(([\d.]+)\)/.exec(content.style.transform)?.[1] ?? 0)
  ok(fitWidth > 0.9 && fitWidth < 1.1, 'resetZoom returns to a fit that shows the whole slide',
    content.style.transform.slice(0, 24))
  adapter.fit.fitPage()
  await wait(200)
  ok(content.style.transform === before, 'fitPage restores the original fit',
    `${content.style.transform.slice(0, 22)} vs ${before.slice(0, 22)}`)
  adapter.fit.actualSize()
  await wait(200)
  ok(/scale\(1\)/.test(content.style.transform), 'actualSize pins the scale to 1', content.style.transform.slice(0, 24))

  head('painted content')
  const images = [...host.querySelectorAll('img')]
  ok(images.some((image) => image.src.startsWith('blob:')), 'a picture resolves to an object url',
    images.map((image) => image.src.slice(0, 18)).join(' '))
  ok(images.every((image) => image.complete && image.naturalWidth > 0), 'every picture decoded',
    images.map((image) => `${image.naturalWidth}x${image.naturalHeight}`).join(' '))
  const chartLabels = [...host.querySelectorAll('.py-ooxml-chart')].reduce((n, c) => n + c.querySelectorAll('text').length, 0)
  ok(chartLabels > 0, 'a chart slide paints its labels', `${chartLabels} labels`)
  const bars = [...host.querySelectorAll('.py-ooxml-bar')]
  // Bars encode value as height, so their tops differ; the baseline they grow
  // from must not.
  const baselines = new Set(bars.map((bar) => near(parseFloat(bar.getAttribute('y')) + parseFloat(bar.getAttribute('height')), 0, 0.6)))
  ok(bars.length >= 12 && baselines.size === 1, 'every bar grows from one baseline', `${bars.length} bars, ${baselines.size} baselines`)
  adapter.pages.goToPage(4)
  await wait(500)
  ok(host.querySelectorAll('.py-presentation-slide')[3].querySelectorAll('img').length > 0,
    'the last slide paints its picture')

  head('teardown')
  renderer.destroy(host)
  await wait(200)
  ok(host.querySelectorAll('.py-presentation-slide').length === 0, 'destroy empties the container')
  ok(![...host.querySelectorAll('img')].some((image) => image.src.startsWith('blob:')), 'destroy revokes the object urls')

  head('unsupported formats')
  const legacy = document.createElement('div')
  document.body.appendChild(legacy)
  await renderer.render(legacy, { data: { format: 'odp', blob: new Blob(['x']) }, name: 'a.odp', size: 1, type: mime })
  ok(/not supported/i.test(legacy.textContent), 'an unsupported .odp falls back with an explanation',
    legacy.textContent.trim().slice(0, 52))
  renderer.destroy(legacy)
  host.remove()

  void log
  return state.checks
}
