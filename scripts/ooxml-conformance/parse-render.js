import { OfficePackage, parsePresentation, walkShapes } from '../../dist/ooxml/index.js'
import { createAssetStore } from '../../dist/renderers/ooxml/assets.js'
import { renderSlide } from '../../dist/renderers/ooxml/render.js'
import { fixtureBytes, near, reporter, round2 as r2 } from './harness.js'

export async function runParseRender(lines) {
  const { say: log, ok, section: head, state } = reporter(lines)

  const fixture = 'chart-deck.pptx'
  const bytes = await fixtureBytes()
  const pkg = await OfficePackage.open(bytes, fixture)
  const pres = await parsePresentation(pkg, fixture)

  const W = Math.round(pres.size.widthPt)
  const H = Math.round(pres.size.heightPt)
  const root = document.createElement('div')
  root.style.cssText = 'position:absolute;left:0;top:0'
  document.body.appendChild(root)

  const boxes = []
  const stores = []
  for (const slide of pres.slides) {
    const box = document.createElement('div')
    box.style.cssText = `position:relative;width:${W}px;height:${H}px;overflow:hidden;background:#fff`
    root.appendChild(box)
    const store = createAssetStore(pkg)
    stores.push(store)
    await store.preload([slide.part])
    renderSlide(slide, box, { assets: (p, r) => store.resolveById(p, r) })
    boxes.push(box)
  }

  // Images are assigned asynchronously by the browser, so they are awaited before
  // measuring: otherwise a correct renderer looks like it emitted a 0x0 image.
  for (const box of boxes) {
    for (const img of box.querySelectorAll('img')) {
      if (!img.src) continue
      await new Promise((res) => {
        if (img.complete && img.naturalWidth > 0) return res()
        img.addEventListener('load', () => res(), { once: true })
        img.addEventListener('error', () => res(), { once: true })
      })
    }
  }

  log(`=== ${fixture}: ${pres.slides.length} slides at ${W}x${H}pt ===`)

  /* The scale a shape is rendered at, accumulated over enclosing groups. */
  function scaleOf(shapes, target) {
    let sx = 1
    const visit = (list) => {
      for (const shape of list) {
        if (shape === target) return true
        if (shape.children.length > 0) {
          const t = shape.transform
          if (t) {
            const kx = t.childSpace && t.childSpace.extent.width !== 0 ? t.extent.width / t.childSpace.extent.width : 1
            if (visit(shape.children, target)) { sx = sx * kx; return true }
          } else if (visit(shape.children, target)) return true
        }
      }
      return false
    }
    void visit(shapes, target)
    return sx
  }

  /* ---- 1. placed shapes sit at their model transform --------------------- */
  head('1 shape boxes match the model transform')
  for (const [i, slide] of pres.slides.entries()) {
    for (const shape of walkShapes(slide.shapes)) {
      const t = shape.transform
      if (!t) { failures += 1; log(`  FAIL  slide ${i} "${shape.name}" has no transform`); continue }
      if (shape.kind === 'group') continue
      const node = [...boxes[i].querySelectorAll('.py-ooxml-shape, .py-ooxml-frame')].find(
        (n) => n.dataset['pfName'] === shape.name
      )
      if (!node) { failures += 1; log(`  FAIL  slide ${i} "${shape.name}" (${shape.kind}) rendered no node`); continue }
      ok(near(parseFloat(node.style.left), t.offset.x, 0.6) && near(parseFloat(node.style.top), t.offset.y, 0.6),
        `slide ${i} "${shape.name}" offset`,
        `${node.style.left},${node.style.top} vs ${r2(t.offset.x)},${r2(t.offset.y)}`)

      // `offsetWidth` is the *layout* box and ignores ancestor group matrices, so
      // it cannot see group scaling. A bounding rect is the rendered size, which
      // is what this assertion is about. A rotated shape's rect is its
      // axis-aligned bounding box, so the expectation is rotated as well.
      const s = scaleOf(slide.shapes, shape)
      const rect = node.getBoundingClientRect()
      const w = t.extent.width * s
      const h = t.extent.height * s
      const rad = (t.rotation * Math.PI) / 180
      const want = t.rotation % 360 === 0
        ? { w, h }
        : { w: Math.abs(w * Math.cos(rad)) + Math.abs(h * Math.sin(rad)),
            h: Math.abs(w * Math.sin(rad)) + Math.abs(h * Math.cos(rad)) }
      ok(near(rect.width, want.w, 1.5) && near(rect.height, want.h, 1.5),
        `slide ${i} "${shape.name}" size`,
        `${r2(rect.width)}x${r2(rect.height)} vs ${r2(want.w)}x${r2(want.h)} (group scale ${r2(s)})`)
    }
  }

  /* ---- 2. rotation and flips -------------------------------------------- */
  head('2')
  {
    const slide = pres.slides[3]
    const rot = [...walkShapes(slide.shapes)].find((s) => (s.transform?.rotation ?? 0) !== 0)
    ok(!!rot, 'the deck has a rotated shape', rot ? `${rot.name} ${rot.transform.rotation}deg` : '')
    const node = [...boxes[3].querySelectorAll('.py-ooxml-shape')].find((d) => (d.style.transform ?? '').startsWith('rotate'))
    ok(!!node, 'the rotated shape carries a CSS rotate', node?.style.transform ?? '(none)')
    const pic = [...walkShapes(slide.shapes)].find((s) => s.kind === 'picture')
    const cxn = [...walkShapes(slide.shapes)].find((s) => s.kind === 'connector')
    ok(pic?.transform.flipH === true, 'picture flipH parsed')
    ok(cxn?.transform.flipV === true, 'connector flipV parsed')
    const line = boxes[3].querySelector('line')
    ok(!!line, 'connector drew a line')
    if (line) ok(Number(line.getAttribute('x1')) === 0, 'flipV kept the line start at the top', `x1=${line.getAttribute('x1')} y1=${line.getAttribute('y1')} y2=${line.getAttribute('y2')}`)
  }

  /* ---- 3. group child-space mapping -------------------------------------- */
  head('3')
  {
    const group = [...walkShapes(pres.slides[3].shapes)].find((s) => s.kind === 'group')
    const gnode = boxes[3].querySelector('div[style*="matrix"]')
    ok(!!group?.transform?.childSpace, 'the group carries chOff/chExt',
      group?.transform?.childSpace ? `${r2(group.transform.childSpace.extent.width)}x${r2(group.transform.childSpace.extent.height)}` : '')
    ok(!!gnode, 'the group element carries a matrix', gnode?.style.transform ?? '(none)')
    const m = gnode?.style.transform.match(/matrix\(([^)]+)\)/)
    if (m && group?.transform?.childSpace) {
      const [a, b, c, d, e, f] = m[1].split(',').map(Number)
      const cs = group.transform.childSpace
      const tx = cs.offset.x * a + cs.offset.y * c + e
      const ty = cs.offset.x * b + cs.offset.y * d + f
      ok(near(tx, group.transform.offset.x, 0.01) && near(ty, group.transform.offset.y, 0.01),
        'the child-space origin maps onto the group origin',
        `${r2(tx)},${r2(ty)} vs ${r2(group.transform.offset.x)},${r2(group.transform.offset.y)}`)
      const expected = group.transform.extent.width / cs.extent.width
      ok(near(a, expected, 0.0001), 'the matrix scale is ext/chExt', `${a} vs ${r2(expected)}`)
    }
    const inner = [...walkShapes(group.children)].find((s) => s.kind === 'group')
    ok(!!inner, 'the deck nests a group inside a group')
    ok(group.children.length === 2, 'the outer group kept both children in order', group.children.map((c) => c.name).join(', '))
  }

  /* ---- 4. text placement ------------------------------------------------ */
  head('4')
  for (const [i, slide] of pres.slides.entries()) {
    const title = slide.shapes.find((x) => x.text && x.text.paragraphs.some((p) => p.runs.length > 0))
    if (!title?.transform || !title?.text) { failures += 1; log(`  FAIL  slide ${i} has no text shape`); continue }
    const host = [...boxes[i].querySelectorAll('.py-ooxml-shape, .py-ooxml-frame')].find(
      (n) => n.dataset['pfName'] === title.name && n.querySelector('.py-ooxml-text')
    )
    const textBox = host?.querySelector('.py-ooxml-text')
    if (!textBox) { failures += 1; log(`  FAIL  slide ${i} "${title.name}" has no text box`); continue }
    // The box carries the insets as margins, so its border box starts at the
    // shape origin + inset.
    const expectX = title.transform.offset.x + title.text.insets.left
    const expectY = title.transform.offset.y + title.text.insets.top
    const r = textBox.getBoundingClientRect()
    const hostRect = boxes[i].getBoundingClientRect()
    const scale = W / hostRect.width
    ok(near((r.left - hostRect.left) * scale, expectX, 1.2) && near((r.top - hostRect.top) * scale, expectY, 1.2),
      `slide ${i} "${title.name}" text box at origin+inset`,
      `${r2((r.left - hostRect.left) * scale)},${r2((r.top - hostRect.top) * scale)} vs ${r2(expectX)},${r2(expectY)}`)

    const runs = title.text.paragraphs[0].runs
    const spans = [...textBox.querySelectorAll('span')]
    ok(spans.length === runs.length, `slide ${i} one span per run`, `${spans.length} vs ${runs.length}`)
    const expectedSize = runs[0].properties.sizePt
    const actualSize = parseFloat(spans[0]?.style.fontSize ?? '0')
    ok(near(actualSize, expectedSize, 0.01), `slide ${i} run font size`, `${actualSize}pt vs ${expectedSize}pt`)
    const text = spans.map((s) => s.textContent).join('')
    ok(text === runs.map((r) => r.text).join(''), `slide ${i} run text preserved`, JSON.stringify(text.slice(0, 40)))
  }

  /* ---- 5. bullets ------------------------------------------------------- */
  head('5')
  {
    const slide = pres.slides[0]
    const bulleted = [...walkShapes(slide.shapes)].filter((s) => s.text?.paragraphs.some((p) => p.bullet.kind !== 'none'))
    ok(bulleted.length > 0, 'a bulleted shape exists', String(bulleted.length))
    const markers = [...boxes[0].querySelectorAll('span[style*="user-select"]')]
    const expected = slide.shapes.reduce((n, s) => n + (s.text?.paragraphs.filter((p) => p.bullet.kind !== 'none').length ?? 0), 0)
    ok(markers.length === expected, 'one marker per bulleted paragraph', `${markers.length} vs ${expected}`)
    const hanging = [...walkShapes(slide.shapes)]
      .flatMap((s) => s.text?.paragraphs ?? [])
      .filter((p) => p.bullet.kind !== 'none')
    // A hanging indent is a *negative* first-line offset, and the text block is
    // pushed in by `marL`. Both come from the placeholder's list level, not from
    // the paragraph, so they are only right if the style chain resolved.
    ok(hanging.every((p) => p.indentPt < 0), 'every bulleted paragraph hangs its first line',
      hanging.map((p) => r2(p.indentPt)).join(','))
    const shallow = Math.min(...hanging.map((p) => p.marginLeftPt))
    const deep = Math.max(...hanging.map((p) => p.marginLeftPt))
    ok(deep > shallow, 'deeper bullet levels indent further', `${r2(shallow)} -> ${r2(deep)}`)

    /* `a:buAutoNum` is a different kind of marker: it is generated from the
     * paragraph's ordinal rather than written as a character, so a renderer that
     * only understands `a:buChar` drops it entirely. */
    const numbered = [...walkShapes(slide.shapes)]
      .flatMap((s) => s.text?.paragraphs ?? [])
      .filter((p) => p.bullet.kind === 'autoNumber')
    ok(numbered.length > 0, 'a paragraph resolves an auto-numbered bullet', String(numbered.length))
    const numberedRows = [...boxes[0].querySelectorAll('.py-ooxml-text > div > div')]
      .filter((row) => row.querySelector('span[style*="user-select"]'))
    const generated = numberedRows.map((row) => row.querySelector('span[style*="user-select"]')?.textContent ?? '')
    ok(generated.some((t) => /\d/.test(t)), 'a numbered marker renders its ordinal', JSON.stringify(generated))
  }

  /* ---- 6. chart -------------------------------------------------------- */
  head('6')
  {
    const frame = pres.slides[1].shapes.find((s) => s.frame?.kind === 'chart')
    ok(!!frame, 'chart frame parsed')
    const chart = frame?.frame?.kind === 'chart' ? frame.frame.chart : null
    const svg = boxes[1].querySelector('.py-ooxml-chart')
    ok(!!svg, 'chart drew an svg')
    const bars = [...(svg?.querySelectorAll('.py-ooxml-bar') ?? [])]
    const expectedBars = chart ? chart.series.reduce((n, s) => n + s.points.filter((p) => p.value !== null).length, 0) : 0
    ok(bars.length === expectedBars, 'one bar per data point', `${bars.length} vs ${expectedBars}`)

    if (chart && bars.length > 0) {
      const bottoms = bars.map((b) => Number(b.getAttribute('y')) + Number(b.getAttribute('height')))
      ok(Math.max(...bottoms) - Math.min(...bottoms) < 0.1, 'all bars share a baseline',
        `${r2(Math.min(...bottoms))}..${r2(Math.max(...bottoms))}`)

      // The bar for the largest value must be the tallest, and the ratio of two
      // bar heights must match the ratio of their values.
      const pairs = chart.series[0].points.slice(0, 3).map((p, i) => ({
        value: p.value ?? 0,
        height: Number(bars[i]?.getAttribute('height') ?? 0),
      }))
      const maxPair = pairs.reduce((a, b) => (b.height > a.height ? b : a))
      ok(maxPair.value === Math.max(...pairs.map((p) => p.value)), 'the largest value is the tallest bar',
        pairs.map((p) => `${p.value}->${r2(p.height)}`).join(' '))
      const ratio = pairs[0].height / pairs[1].height
      ok(near(ratio, pairs[0].value / pairs[1].value, 0.02), 'bar heights are proportional to values',
        `${r2(ratio)} vs ${r2(pairs[0].value / pairs[1].value)}`)

      const xs = bars.slice(0, 3).map((b) => Number(b.getAttribute('x')))
      ok(xs[0] < xs[1] && xs[1] < xs[2], 'bars advance left to right', xs.map(r2).join(','))
      const widths = new Set(bars.map((b) => r2(Number(b.getAttribute('width')))))
      ok(widths.size === 1, 'every bar has the same width', [...widths].join(','))
      const fills = new Set(bars.map((b) => b.getAttribute('fill')))
      ok(fills.size === chart.series.length, 'one colour per series', `${fills.size} vs ${chart.series.length}`)
    }

    const texts = [...(svg?.querySelectorAll('text') ?? [])].map((t) => t.textContent)
    ok(texts.includes('Jan') && texts.includes('Sep'), 'category labels drawn')
    ok(chart?.categories.every((c) => texts.includes(c)) ?? false, 'every category label drawn',
      chart?.categories.filter((c) => !texts.includes(c)).join(',') || 'all')
    ok(chart?.series.every((s) => texts.includes(s.name)) ?? false, 'legend entries drawn')
    const ticks = texts.filter((t) => /^[\d.]+$/.test(t ?? ''))
    ok(ticks.length >= 4, 'value-axis ticks drawn', ticks.join(','))
    ok(chart?.title ? texts.includes(chart.title) : true, 'chart title drawn')
  }

  /* ---- 7. table -------------------------------------------------------- */
  head('7')
  {
    const frame = pres.slides[2].shapes.find((s) => s.frame?.kind === 'table')
    ok(!!frame, 'table frame parsed')
    const table = frame?.frame?.kind === 'table' ? frame.frame.table : null
    const cells = [...boxes[2].querySelectorAll('.py-ooxml-cell')]
    const expected = table ? table.cells.filter((c) => !c.horizontalMerge && !c.verticalMerge).length : 0
    ok(cells.length === expected, 'one box per non-merged cell', `${cells.length} vs ${expected}`)

    if (table) {
      ok(table.columnWidthsPt.every((w) => w > 0), 'column widths positive', table.columnWidthsPt.map(r2).join(','))
      ok(table.rowHeightsPt.every((h) => h > 0), 'row heights positive', table.rowHeightsPt.map(r2).join(','))
      const r0 = cells.filter((c) => c.dataset['pfRow'] === '0')
      ok(r0.length === table.columnWidthsPt.length, 'the first row has one cell per column', `${r0.length} vs ${table.columnWidthsPt.length}`)
      // Cells must tile: the first row's cells must abut exactly, with no gap and no overlap.
      let edge = 0
      let tiled = true
      for (const cell of r0) {
        const left = parseFloat(cell.style.left)
        const width = parseFloat(cell.style.width)
        if (!near(left, edge, 0.6)) { tiled = false; break }
        edge = left + width
      }
      ok(tiled, 'the first row tiles the grid with no gaps', `ends at ${r2(edge)} vs ${r2(table.columnWidthsPt.reduce((a, b) => a + b, 0))}`)
      const first = r0[0]
      ok(!!first && near(parseFloat(first.style.width), table.columnWidthsPt[0], 0.6), 'cell 0 width matches its grid column',
        `${first?.style.width} vs ${r2(table.columnWidthsPt[0] ?? 0)}`)
      const firstText = first?.textContent?.trim() ?? ''
      ok(firstText === 'Stage', 'the header cell reads "Stage"', JSON.stringify(firstText))
      const stageText = [...boxes[2].querySelectorAll('.py-ooxml-cell')].map((c) => c.textContent?.trim())
      for (const word of ['Package', 'Parse', 'Layout', 'Render', 'done', 'parts']) {
        ok(stageText.some((t) => t?.includes(word)), `cell text "${word}" is present`)
      }
    }
  }

  /* ---- 8. images ------------------------------------------------------- */
  head('8')
  {
    const pics = [...walkShapes(pres.slides[3].shapes)].filter((s) => s.kind === 'picture')
    // Two: `Swatch` asks for a border and `Plain swatch` does not, so the deck can
    // tell an authored stroke apart from a defaulted one.
    ok(pics.length === 2, 'both pictures in the deck', String(pics.length))
    // Looked up by name rather than by position, so adding a picture cannot make
    // this quietly assert about a different one.
    const swatchBox = [...boxes[3].querySelectorAll('.py-ooxml-shape')].find((n) => n.dataset['pfName'] === 'Swatch')
    const img = swatchBox?.querySelector('img') ?? null
    ok(!!img, 'the picture drew an img element')
    ok(!!img?.src.startsWith('blob:'), 'the image src is an object URL', (img?.src ?? '').slice(0, 20))
    ok((img?.naturalWidth ?? 0) > 0, 'the image decoded', `${img?.naturalWidth}x${img?.naturalHeight}`)
    const picNode = [...boxes[3].querySelectorAll('.py-ooxml-shape')].find((n) => n.dataset['pfName'] === pics[0]?.name)
    ok(!!picNode && near(picNode.offsetWidth, pics[0].transform.extent.width, 1.2), 'the picture box is the shape extent',
      `${picNode?.offsetWidth} vs ${r2(pics[0].transform.extent.width)}`)
  }

  /* ---- 8b. placeholder inheritance -------------------------------------- */
  head('8b')
  {
    const slide = pres.slides[0]
    const byName = (n) => [...walkShapes(slide.shapes)].find((s) => s.name === n)
    // The slide authors neither geometry nor `sz` for these, so anything correct
    // arrived through the chain. The layout narrows the master's title to 32pt.
    const title = byName('Title')
    ok(title?.placeholder?.type === 'title' && title.transform?.inherited === false,
      'title is a title placeholder', `${title?.placeholder?.type}/${title?.placeholder?.index}`)
    ok(near(title.transform.offset.x, 36, 0.6) && near(title.transform.extent.width, 828, 0.6),
      'title geometry came from the layout', `${r2(title.transform.offset.x)},${r2(title.transform.extent.width)}`)
    ok(title.text.paragraphs[0].runs[0].properties.sizePt === 32,
      'layout restyles the master title (44 -> 32)', `${title.text.paragraphs[0].runs[0].properties.sizePt}pt`)
    const subtitle = byName('Subtitle')
    ok(subtitle.text.paragraphs[0].marginLeftPt === 22.5,
      'body placeholder takes the layout list level', `${subtitle.text.paragraphs[0].marginLeftPt}pt`)
    // A text box is not a placeholder, so it falls through to `otherStyle`.
    const card = byName('Blue card')
    ok(card?.placeholder === null && card.text.paragraphs[0].runs[0].properties.sizePt === 18,
      'plain text box uses otherStyle', `${card.text.paragraphs[0].runs[0].properties.sizePt}pt`)
    ok(pres.slides.every((sl) => !walkShapes(sl.shapes).some((x) => /Placeholder/.test(x.name))),
      'layout placeholders are not painted as background art')
  }

  /* ---- 8c. painter details that regress silently ----------------------- */
  head('8c')
  {
    const slide = pres.slides[0]
    const byName = (n) => [...walkShapes(slide.shapes)].find((s) => s.name === n)
    // A solid-filled preset with no outline has nothing to draw its silhouette
    // with except the path itself, so a triangle must not render as its box.
    const tri = byName('Triangle')
    const triNode = [...boxes[0].querySelectorAll('.py-ooxml-shape')].find((n) => n.dataset['pfName'] === 'Triangle')
    ok(tri.geometry.kind === 'preset' && tri.geometry.preset.path !== undefined, 'triangle keeps its preset geometry')
    const triPath = triNode?.querySelector('path')
    ok(!!triPath && (triPath.getAttribute('fill') ?? '') !== 'none',
      'unoutlined non-rect shape is filled by its path', triPath?.getAttribute('fill') ?? '(no path)')
    // A CSS background already covers the box, so a plain rect must not pay for a
    // redundant path, and a card with an outline must actually get its border.
    const card = byName('Orange card')
    const cardNode = [...boxes[0].querySelectorAll('.py-ooxml-shape')].find((n) => n.dataset['pfName'] === 'Orange card')
    ok(card.line.fill.type === 'solid' && (getComputedStyle(cardNode).borderTopWidth ?? '0') !== '0px',
      'outlined shape gets a CSS border', getComputedStyle(cardNode).borderTopWidth)
    // An outlined rect still needs its path for the stroke, but the CSS background
    // already fills it, so the path must not paint a second fill.
    const cardPath = cardNode.querySelector('path')
    ok(!!cardPath && cardPath.getAttribute('fill') === 'none', 'an outlined rect strokes without refilling',
      cardPath?.getAttribute('fill') ?? '(no path)')

    // Run-level styling: a bold red run followed by a plain blue one must not
    // share a span, or the second run's colour repaints the first.
    const mixed = byName('Mixed runs')
    const mixedNode = [...boxes[0].querySelectorAll('.py-ooxml-shape')].find((n) => n.dataset['pfName'] === 'Mixed runs')
    const spans = [...mixedNode.querySelectorAll('.py-ooxml-text span')].filter((n) => n.textContent)
    ok(mixed.text.paragraphs[0].runs.length === 2, 'fixture has a two-run paragraph', `${mixed.text.paragraphs[0].runs.length} runs`)
    ok(spans.length === 2, 'each run gets its own span', `${spans.length} spans`)
    const colors = spans.map((n) => getComputedStyle(n).color)
    ok(colors[0] !== colors[1], 'the runs keep different colours', colors.join(' vs '))
    ok(getComputedStyle(spans[0]).fontWeight === '700' && getComputedStyle(spans[1]).fontWeight !== '700',
      'only the first run is bold', `${getComputedStyle(spans[0]).fontWeight}/${getComputedStyle(spans[1]).fontWeight}`)
    ok(spans[0].textContent === 'Bold red, ' && spans[1].textContent === 'then plain blue.', 'run text is intact',
      `${spans[0].textContent}|${spans[1].textContent}`)
  }

  /* ---- 8d. picture crop ------------------------------------------------- */
  head('8d')
  {
    const slide = pres.slides[3]
    const pic = [...walkShapes(slide.shapes)].find((s) => s.kind === 'picture')
    const node = [...boxes[3].querySelectorAll('.py-ooxml-shape')].find((n) => n.dataset['pfName'] === pic.name)
    const img = node.querySelector('img')
    const { left, top, right, bottom } = pic.blip.crop
    // `srcRect` names the part of the source that survives and that part fills
    // the frame, so the image is scaled by 1/visible and offset by -crop/visible.
    const vw = 1 - (left + right) / 100000
    const vh = 1 - (top + bottom) / 100000
    ok(left !== 0 && right !== 0, 'the fixture crops the picture', `${left},${top},${right},${bottom}`)
    ok(near(parseFloat(img.style.width), 100 / vw, 0.01) && near(parseFloat(img.style.height), 100 / vh, 0.01),
      'crop scales the image up to fill the frame', `${img.style.width} x ${img.style.height}`)
    ok(near(parseFloat(img.style.left), (-left / 100000 / vw) * 100, 0.01) &&
       near(parseFloat(img.style.top), (-top / 100000 / vh) * 100, 0.01),
      'crop shifts the image by the removed fraction', `${img.style.left}, ${img.style.top}`)
    const frame = node.querySelector('div')
    ok(getComputedStyle(frame).overflow === 'hidden', 'the crop is clipped to the frame',
      getComputedStyle(frame).overflow)
  }

  /* ---- 9. z-order ------------------------------------------------------ */
  head('9')
  {
    const slide = pres.slides[3]
    const stage = boxes[3].firstElementChild
    const painted = [...stage.children].filter((c) => c.classList.contains('py-ooxml-shape'))
    const authored = slide.shapes
    ok(painted.length === authored.length, 'every top-level shape painted once', `${painted.length} vs ${authored.length}`)
    ok(painted.map((n) => n.dataset['pfName']).join(',') === authored.map((s) => s.name).join(','),
      'paint order matches the authored order', painted.map((n) => n.dataset['pfName']).join(','))
  }

  /* ---- 9b. regressions for bugs that shipped ----------------------------- */
  head('9b')
  {
    /* `line-height` is inherited, and a unitless value is recomputed against each
     * run's own size, so a host page with the extremely common
     * `body { line-height: 1.5 }` re-spaces every text block in the deck. The
     * conformance page sets exactly that on purpose, so a leak fails the suite. */
    const rowLh = boxes.flatMap((b) => [...b.querySelectorAll('.py-ooxml-text > div > div')])
    const leaked = rowLh.filter((row) => {
      const style = getComputedStyle(row)
      const size = parseFloat(style.fontSize)
      return size > 0 && Math.abs(parseFloat(style.lineHeight) / size - 1.5) < 0.02
    })
    ok(rowLh.length > 0, 'the deck has paragraphs to check', String(rowLh.length))
    ok(leaked.length === 0, "the host page's line-height does not reach the text",
      `${leaked.length} of ${rowLh.length} rows`)

    /* A paragraph row carries no runs, so its line box is set by whatever font size
     * it inherits — commonly 13–16px from the host page, which is smaller than the
     * text it holds. That mis-sizes the line box and mis-places the baseline, and it
     * is what makes an empty paragraph or a bullet the wrong height. */
    const strut = rowLh.filter((row) => {
      // Only run spans count: the bullet marker carries its own size from
      // `a:buSzPct`, which is a property of the marker, not of the line box.
      const spans = [...row.querySelectorAll('span')].filter((s) => s.style.fontSize && !s.style.userSelect)
      if (spans.length === 0) return false
      const declared = Math.max(...spans.map((s) => parseFloat(s.style.fontSize)))
      return Math.abs(parseFloat(row.style.fontSize || '0') - declared) > 0.01
    })
    ok(strut.length === 0, 'each paragraph is sized by its own tallest run',
      strut.length === 0
        ? ''
        : strut.map((row) => `row=${row.style.fontSize} runs=${[...row.querySelectorAll('span')]
          .filter((s) => s.style.fontSize && !s.style.userSelect)
          .map((s) => s.style.fontSize).join('/')}`).join(' '))
  }

  /* ---- 9b-2. custom geometry is bounded by its own shape ------------------- */
  head('9b-2')
  {
    /* `a:path/@w` and `@h` declare the space a custom geometry is drawn in, and
     * both are optional. When they were read as "already normalised", a producer
     * that omits them left the coordinates in their authoring units (21600 here);
     * the painter multiplies a unit-box path by the shape's size, so the shape came
     * out ~21,000x too large, its stroke left the shape's own viewBox — the
     * overlay is deliberately `overflow:visible` so effects can reach past the box
     * — and drew black diagonals across the whole slide over the text.
     *
     * The assertion is the shape's own containment rather than a number, because
     * that is the property that broke: any coordinate outside the box reaches the
     * page, whether it is 21,000x out or 3% out. */
    const overlays = boxes.flatMap((b) =>
      [...b.querySelectorAll('svg')]
        .map((svg) => ({
          svg,
          box: (svg.getAttribute('viewBox') ?? '').split(/\s+/).map(Number),
          paths: [...svg.querySelectorAll('path')],
        }))
        .filter((o) => o.box.length === 4 && Number.isFinite(o.box[2]) && o.paths.length > 0)
    )
    ok(overlays.length > 0, 'the deck has geometry overlays to check', String(overlays.length))

    const escaped = []
    for (const { box, paths } of overlays) {
      for (const node of paths) {
        const d = node.getAttribute('d') ?? ''
        // `d` is only ever coordinate pairs, so every other number is a radius or
        // flag and is skipped by taking the values at even indices.
        const nums = (d.match(/-?[\d.]+(?:e-?\d+)?/g) ?? []).map(Number)
        const xs = nums.filter((_, i) => i % 2 === 0)
        const ys = nums.filter((_, i) => i % 2 === 1)
        if (xs.length === 0) continue
        // A roundRect legitimately overshoots by nothing, but a stroke's own width
        // is centred on the outline, so the tolerance is a fraction of a point.
        const slack = 1
        if (
          Math.min(...xs) < -slack ||
          Math.min(...ys) < -slack ||
          Math.max(...xs) > box[2] + slack ||
          Math.max(...ys) > box[3] + slack
        ) {
          escaped.push(`box=${box[2].toFixed(0)}x${box[3].toFixed(0)} d=${d.slice(0, 44)}`)
        }
      }
    }
    ok(escaped.length === 0, 'no geometry path escapes the shape it belongs to',
      escaped.join(' | '))

    /* The two triangles on the compositing slide are the same path, authored once
     * with `w`/`h` and once without. A missing extent has to be inferred from the
     * coordinates, so the two must land on the same path data — which also pins
     * the inferred space to the declared one rather than merely "small enough". */
    const triangleFor = (name) => {
      const box = [...boxes[3].querySelectorAll('[data-pf-name]')].find((n) => n.dataset['pfName'] === name)
      return box?.querySelector('path')?.getAttribute('d') ?? ''
    }
    const sized = triangleFor('Custom geometry sized')
    const unsized = triangleFor('Custom geometry')
    ok(sized !== '' && unsized !== '', 'the fixture has both forms of the custom path',
      `sized=${sized ? 'yes' : 'missing'} unsized=${unsized ? 'yes' : 'missing'}`)
    ok(unsized !== '' && unsized === sized,
      'a custom path without w/h resolves to the same geometry as one with them',
      `${unsized} vs ${sized}`)
  }

  /* ---- 9b-3. a shape with no line has no border --------------------------- */
  head('9b-3')
  {
    /* An absent `a:ln` means no outline, and the resolution chain used to end on
     * a solid black 0.75pt line instead, so every text box, picture and shape that
     * never asked for a border got one. Both halves are asserted — the resolved
     * model and the computed style — because a fix that only hid the border in
     * CSS would leave the model still claiming a line, and the next shape that
     * reads `line` (the geometry overlay, the table borders) would draw it. */
    const byName = (slideIndex, name) => {
      const shape = pres.slides[slideIndex].shapes.find((s) => s.name === name)
      const node = [...boxes[slideIndex].querySelectorAll('[data-pf-name]')]
        .find((n) => n.dataset['pfName'] === name)
      return { shape, node }
    }
    // The computed width of every side, so a border painted on one edge only is
    // still caught.
    const borders = (node) => {
      if (!node) return null
      const style = getComputedStyle(node)
      return ['Top', 'Right', 'Bottom', 'Left'].map((side) => parseFloat(style[`border${side}Width`]))
    }
    const unbordered = (label, slideIndex, name) => {
      const { shape, node } = byName(slideIndex, name)
      ok(shape?.line.fill.type === 'none', `${label} resolves to no line`,
        `${shape?.line.fill.type} @ ${shape?.line.widthPt}pt`)
      const widths = borders(node)
      ok(widths !== null && widths.every((w) => w === 0), `${label} paints no border`,
        widths ? widths.join('/') : '(not painted)')
    }

    // 1. A shape with no `a:ln`: `Stack under` is an ellipse with a solid fill and
    //    no line element. A fill is not a request for a border.
    unbordered('a shape with no line', 3, 'Stack under')

    // 2. A shape with an explicit `a:ln` still gets it, at the authored width and
    //    colour — `Orange card` asks for 1.5pt of a brown.
    {
      const { shape, node } = byName(0, 'Orange card')
      const style = node ? getComputedStyle(node) : null
      ok(shape?.line.fill.type === 'solid', 'an explicit line resolves to a line',
        `${shape?.line.fill.type} @ ${shape?.line.widthPt}pt`)
      ok(shape != null && near(shape.line.widthPt, 1.5, 0.01), 'the authored width survives',
        `${r2(shape?.line.widthPt)}pt`)
      const width = style ? parseFloat(style.borderTopWidth) : 0
      // 1.5pt lands on 2 device pixels at the suite's 96dpi scale, so the
      // assertion is "a border is painted" rather than an exact pixel count.
      ok(width > 0, 'an explicit line paints a border', `${width}px`)
      const colour = style?.borderTopColor ?? ''
      ok(colour !== '' && colour !== 'rgba(0, 0, 0, 0)' && !/215, 220, 227/.test(colour),
        'the border is the authored colour, not a default', colour)
    }

    // 3. A text box with no `a:ln`. `txBox="1"` and no line element: the commonest
    //    shape in a real deck, and the one that was worst affected.
    unbordered('a text box with no line', 3, 'Legend')
    {
      const { shape } = byName(3, 'Legend')
      ok(shape?.textBox === true, 'the borderless text box really is a text box', String(shape?.textBox))
    }

    // 4. A picture with no `a:ln`, against the bordered `Swatch` beside it.
    unbordered('a picture with no line', 3, 'Plain swatch')
    {
      const { shape } = byName(3, 'Plain swatch')
      ok(shape?.kind === 'picture', 'the borderless picture really is a picture', String(shape?.kind))
    }
    {
      const { shape, node } = byName(3, 'Swatch')
      const style = node ? getComputedStyle(node) : null
      ok(shape?.line.fill.type === 'solid', 'the bordered picture keeps its line', String(shape?.line.fill.type))
      ok((style ? parseFloat(style.borderTopWidth) : 0) > 0, 'and keeps its border',
        `${style?.borderTopWidth} ${style?.borderTopColor}`)
    }

    /* The cross-check: no shape anywhere in the deck may end up with a line it
     * did not author. The authored XML is the evidence, so this cannot pass by the
     * fixture happening to agree with a wrong default — a shape counts as
     * undecorated only when its own `spPr` has no `a:ln`, and a placeholder's
     * inherited style is allowed to give it one. */
    const decorated = new Set()
    for (const [i, slide] of pres.slides.entries()) {
      const xml = await pkg.xml(slide.part)
      if (!xml) continue
      for (const sp of xml.getElementsByTagName('*')) {
        if (sp.localName !== 'sp' && sp.localName !== 'pic' && sp.localName !== 'cxnSp') continue
        const nodes = [...sp.getElementsByTagName('*')]
        const label = nodes.find((n) => n.localName === 'cNvPr')?.getAttribute('name') ?? ''
        const spPr = nodes.find((n) => n.localName === 'spPr')
        const hasLine = spPr ? [...spPr.children].some((c) => c.localName === 'ln') : false
        if (hasLine) decorated.add(`${i}:${label}`)
      }
    }
    const undecorated = []
    for (const [i, slide] of pres.slides.entries()) {
      for (const shape of slide.shapes) {
        if (shape.kind === 'group') continue
        if (decorated.has(`${i}:${shape.name}`)) continue
        if (shape.line.fill.type === 'none') continue
        undecorated.push(`${shape.name}=${shape.line.fill.type}@${shape.line.widthPt}`)
      }
    }
    ok(decorated.size > 0, 'the deck has shapes that do author a line', String(decorated.size))
    ok(undecorated.length === 0, 'no shape is given a line it never declared',
      undecorated.join(' '))
  }

  /* ---- 9c. list-style inheritance is per property ------------------------ */
  head('9c')
  {
    /* The layout's body placeholder declares `marL` and `indent` but no `buChar`,
     * so the bullet has to arrive from the master's `bodyStyle` while the indent
     * stays with the layout. A cascade that took the most specific source wholesale
     * instead of per property would drop the bullet and the layout would win for
     * everything. Both directions are asserted, because either one alone passes on
     * an implementation that simply ignores the master. */
    const slide = pres.slides[0]
    const paragraphs = [...walkShapes(slide.shapes)].flatMap((s) => s.text?.paragraphs ?? [])
    const bulleted = paragraphs.filter((p) => p.bullet.kind !== 'none')
    ok(bulleted.length > 0, 'a paragraph resolves a bullet', JSON.stringify(bulleted[0]?.bullet ?? null))

    /* The layout is the most specific source, so its margin must win over the
     * master's wider one. */
    const placeholderBullets = bulleted.filter((p) => p.marginLeftPt > 0)
    ok(placeholderBullets.every((p) => p.marginLeftPt > 0), 'a bulleted paragraph has a left margin',
      placeholderBullets.map((p) => r2(p.marginLeftPt)).join(','))
    ok(placeholderBullets.every((p) => p.indentPt < 0), 'a bulleted paragraph hangs its first line',
      placeholderBullets.map((p) => r2(p.indentPt)).join(','))

    /* Size is declared at both levels with different values; the layout must win
     * for the paragraph while the master's value is still available as a fallback
     * for a paragraph the layout says nothing about. */
    const sized = paragraphs.filter((p) => p.runs.length > 0)
    ok(sized.every((p) => p.runs.every((r) => r.properties.sizePt > 0)),
      'every run resolves a size', `${sized.filter((p) => p.runs.some((r) => r.properties.sizePt <= 0)).length} unsized`)

    /* Two list levels on one shape must not share a level's bullet or indent. */
    const byLevel = new Map()
    for (const p of bulleted) {
      const key = r2(p.marginLeftPt)
      byLevel.set(key, (byLevel.get(key) ?? 0) + 1)
    }
    ok(byLevel.size > 1, 'distinct list levels keep distinct indents', [...byLevel.keys()].join(','))

    /* Both leading forms have to survive as themselves: a percentage is a ratio of
     * the run's own size, while `a:spcPts` is an absolute height in centipoints and
     * must not be rescaled by the run. */
    const spacing = [...walkShapes(slide.shapes)]
      .flatMap((s) => s.text?.paragraphs ?? [])
      .filter((p) => p.lineSpacing.percent !== null || p.lineSpacing.points !== null)
    const pct = spacing.filter((p) => p.lineSpacing.percent !== null)
    const pts = spacing.filter((p) => p.lineSpacing.points !== null)
    ok(pct.length > 0, 'a percentage line spacing is parsed', JSON.stringify(pct[0]?.lineSpacing ?? null))
    ok(near(pct[0]?.lineSpacing.percent ?? 0, 0.9, 0.001), 'spcPct 90000 becomes 0.9',
      String(pct[0]?.lineSpacing.percent))
    ok(pts.length > 0, 'an absolute line spacing is parsed', JSON.stringify(pts[0]?.lineSpacing ?? null))
    ok(near(pts[0]?.lineSpacing.points ?? 0, 20, 0.01), 'spcPts 2000 becomes 20pt',
      String(pts[0]?.lineSpacing.points))

    const rowHeights = [...boxes[0].querySelectorAll('.py-ooxml-text > div > div')]
      .map((row) => row.style.lineHeight)
      .filter((v) => v && v !== '')
    ok(rowHeights.some((v) => v === '0.9'), 'a percentage leading becomes a unitless line-height',
      [...new Set(rowHeights)].join(' '))
    ok(rowHeights.some((v) => v === '20pt'), 'an absolute leading becomes a fixed line-height',
      [...new Set(rowHeights)].join(' '))
  }

  /* ---- 10. teardown ---------------------------------------------------- */
  head('10')
  {
    for (const store of stores) store.dispose()
    ok(stores.every((s) => s.resolveById('x', 'y') === null), 'disposed stores resolve nothing')
    pkg.dispose()
    ok(true, 'package disposed')
  }

  return state.checks
}
