import type { PreviewActions } from './types.js'
import { ICONS as LUCIDE } from '../icons/icons.js'
import { ensureGlassStyles } from './glass-styles.js'
import type { SegmentedResult } from './ui.js'
import { iconEl, makeButton, makeDivider, makeGroup, makeSegmented } from './ui.js'

/*
 * The preview control surface.
 *
 * Design: a Liquid Glass chrome distributed around the content — every control
 * is always visible and intentionally placed on the side where it belongs:
 *
 *   - Top bar (.pf-top): the document context — file info + format badge on the
 *     left, view-mode / text actions beside it, and the download action on the
 *     right. Pinned document-level actions.
 *   - Left rail (.pf-rail--left): content-side auxiliary navigation (e.g. a
 *     thumbnail/sidebar toggle) — things that sit next to the content.
 *   - Right rail (.pf-rail--right): zoom, fit, rotate, single/continuous and
 *     fullscreen — everything that changes how the content is seen.
 *   - Bottom bar (.pf-bottom): content-specific navigation and tools — page
 *     navigation, spreadsheet sheet tabs, and the image magnifier/zoom
 *     controller — placed where the user's hands already are.
 *
 * Every surface is in normal flow — chrome is never an overlay and never uses
 * sticky positioning or z-index. Content scrolls inside the stage that sits
 * between the rails, and renderers can nest a full second preview (e.g. a file
 * opened inside an archive) without any two control surfaces ever occupying
 * the same space.
 *
 * - The chrome renders only the groups the adapter's capabilities declare, so
 *   each preview gets exactly the controls it needs.
 * - Groups are labeled clusters separated by hairline dividers; on narrow
 *   surfaces the rails reflow beneath the stage as strips so no control is
 *   ever hidden behind an overflow menu.
 * - Icons are Lucide SVGs (24px grid, 2px stroke, round caps, currentColor,
 *   see src/icons/) rendered inline so they inherit the control style.
 * - All colors come from the shared design tokens (see src/utils/theme.ts) —
 *   a single Liquid Glass light system; there is no theme switching.
 */

/* Local aliases from the toolbar's semantic action names to the Lucide assets
   in src/icons/. Rotate and reset each have a distinct glyph: the two ±90°
   steps use the circular rotate arrows, zoom reset returns to the default view
   (undo arrow), and rotation reset returns to 0° (refresh arrows). */
const ICONS = {
  zoomIn: LUCIDE['zoom-in'],
  zoomOut: LUCIDE['zoom-out'],
  reset: LUCIDE['undo-2'],
  resetRotation: LUCIDE['refresh-ccw'],
  fitWidth: LUCIDE['move-horizontal'],
  fitPage: LUCIDE['scan'],
  actualSize: LUCIDE['ruler'],
  maximize: LUCIDE['maximize'],
  minimize: LUCIDE['minimize'],
  prevPage: LUCIDE['chevron-left'],
  nextPage: LUCIDE['chevron-right'],
  singlePage: LUCIDE['file'],
  continuous: LUCIDE['file-stack'],
  download: LUCIDE['download'],
  rotateCw: LUCIDE['rotate-cw'],
  rotateCcw: LUCIDE['rotate-ccw'],
  copy: LUCIDE['copy'],
  wrap: LUCIDE['wrap-text'],
  thumbnails: LUCIDE['layout-grid'],
  file: LUCIDE['file-text'],
}

interface ToolbarRefs {
  pageInput?: HTMLInputElement
  pageTotal?: HTMLSpanElement
  singlePageButton?: HTMLButtonElement
  thumbnailsButton?: HTMLButtonElement
  wrapButton?: HTMLButtonElement
  zoomLabel?: HTMLButtonElement
  rotationInput?: HTMLInputElement
  sheetsSeg?: SegmentedResult<string>
  lensMagSeg?: SegmentedResult<number>
  lensSizeSeg?: SegmentedResult<number>
  modeSeg?: SegmentedResult<'preview' | 'code'>
  fullscreenButton?: HTMLButtonElement
}

function buildToolbar(actions: PreviewActions): {
  root: HTMLElement
  stageHost: HTMLElement
  cleanup: () => void
} {
  ensureGlassStyles()

  const root = document.createElement('div')
  root.className = 'pf-controls'

  const top = document.createElement('div')
  top.className = 'pf-top'
  top.setAttribute('role', 'toolbar')
  top.setAttribute('aria-label', 'Preview controls')
  root.appendChild(top)

  const body = document.createElement('div')
  body.className = 'pf-body'
  root.appendChild(body)

  const leftRail = document.createElement('div')
  leftRail.className = 'pf-rail pf-rail--left'
  body.appendChild(leftRail)

  /* The renderer's stage is moved in here (see mountControls), keeping the
     content pane between the rails in normal flow. */
  const stageHost = document.createElement('div')
  stageHost.className = 'pf-body__middle'
  body.appendChild(stageHost)

  const rightRail = document.createElement('div')
  rightRail.className = 'pf-rail pf-rail--right'
  body.appendChild(rightRail)

  const bottom = document.createElement('div')
  bottom.className = 'pf-bottom'
  bottom.setAttribute('role', 'toolbar')
  bottom.setAttribute('aria-label', 'Preview navigation')
  root.appendChild(bottom)

  const refs = {} as ToolbarRefs

  /* Zoom cluster (minus button / live % chip / plus / reset). Rendered in the
     right rail for documents, spreadsheets and text; moved into the bottom
     image controller for images so the image surface stays clean. */
  const addZoomControls = (row: HTMLElement): void => {
    row.appendChild(makeButton(ICONS.zoomOut, 'Zoom out', () => {
      actions.zoomOut()
      refresh()
    }))
    if (refs.zoomLabel === undefined) {
      refs.zoomLabel = makeButton('', 'Current zoom — click to reset to the default view', () => {
        actions.resetZoom()
        refresh()
      }, { chip: true })
    }
    refs.zoomLabel.dataset.lastZoom = ''
    row.appendChild(refs.zoomLabel)
    row.appendChild(makeButton(ICONS.zoomIn, 'Zoom in', () => {
      actions.zoomIn()
      refresh()
    }))
    row.appendChild(makeButton(ICONS.reset, 'Reset to default view', () => {
      actions.resetZoom()
      refresh()
    }))
  }

  /* ------------------------------------------------------------------ */
  /* Top bar: document context + document-level actions                 */
  /* ------------------------------------------------------------------ */

  /* File — the document context: icon + name + format badge on the left. */
  if (actions.fileName) {
    const { wrapper, row } = makeGroup('')
    top.appendChild(wrapper)
    const info = document.createElement('div')
    info.className = 'pf-fileinfo'
    row.appendChild(info)

    info.appendChild(iconEl(ICONS.file, actions.fileTypeLabel ?? 'File'))
    const name = document.createElement('span')
    name.className = 'pf-fileinfo__name'
    name.textContent = actions.fileName
    name.title = actions.fileName
    info.appendChild(name)

    const badge = document.createElement('span')
    badge.className = 'pf-fileinfo__badge'
    badge.textContent = actions.fileTypeLabel
    info.appendChild(badge)
  }

  /* Mode — switching between alternate views (e.g. a Markdown document's
     rendered Preview and its raw Code) stays one tap away. */
  if (actions.viewMode) {
    const viewMode = actions.viewMode
    top.appendChild(makeDivider())
    const { wrapper, row } = makeGroup('Mode')
    top.appendChild(wrapper)
    const seg = makeSegmented<'preview' | 'code'>(
      'View mode',
      [
        { label: 'Preview', value: 'preview' },
        { label: 'Code', value: 'code' },
      ],
      viewMode.mode,
      (value) => {
        try {
          viewMode.setMode(value)
        } catch (error) {
          console.error('[preview-file] view mode switch failed', error)
        }
        refresh()
      }
    )
    refs.modeSeg = seg
    row.appendChild(seg.el)
  }

  /* Text — copy / word wrap. */
  if (actions.text && (actions.text.canCopy || actions.text.canWordWrap)) {
    const text = actions.text
    top.appendChild(makeDivider())
    const { wrapper, row } = makeGroup('Text')
    top.appendChild(wrapper)
    if (text.canCopy) {
      row.appendChild(makeButton(ICONS.copy, 'Copy to clipboard', () => text.copy()))
    }
    if (text.canWordWrap) {
      const wrap = makeButton(ICONS.wrap, 'Turn on word wrap', () => {
        text.toggleWordWrap()
        refresh()
      })
      refs.wrapButton = wrap
      row.appendChild(wrap)
    }
  }

  top.appendChild(makeDivider())
  const spacer = document.createElement('span')
  spacer.className = 'pf-spacer'
  top.appendChild(spacer)

  /* Download — document-level action pinned to the right edge. */
  if (actions.canDownload) {
    const { wrapper, row } = makeGroup('')
    top.appendChild(wrapper)
    row.appendChild(makeButton(ICONS.download, 'Download', () => actions.download()))
  }

  /* Groups are stacked vertically with hairline dividers between them. */
  const addRailGroup = (rail: HTMLElement, build: () => void): void => {
    if (rail.childElementCount > 0) rail.appendChild(makeDivider())
    build()
  }

  /* ------------------------------------------------------------------ */
  /* Left rail: content-side auxiliary navigation                       */
  /* ------------------------------------------------------------------ */

  if (actions.thumbnails) {
    const thumbnails = actions.thumbnails
    addRailGroup(leftRail, () => {
      const { wrapper, row } = makeGroup('Sidebar')
      leftRail.appendChild(wrapper)
      const button = makeButton(ICONS.thumbnails, 'Show thumbnails', () => {
        thumbnails.setVisible(!thumbnails.visible)
        refresh()
      })
      refs.thumbnailsButton = button
      row.appendChild(button)
    })
  }

  if (leftRail.childElementCount === 0) leftRail.style.display = 'none'

  /* ------------------------------------------------------------------ */
  /* Right rail: how the content is seen — zoom, fit, rotate, page     */
  /* flow and fullscreen. (Image zoom + the lens live in the bottom     */
  /* "Magnifier" controller so images stay visually clean.)             */
  /* ------------------------------------------------------------------ */

  if (actions.canZoom && !actions.lens) {
    addRailGroup(rightRail, () => {
      const { wrapper, row } = makeGroup('Zoom')
      rightRail.appendChild(wrapper)
      addZoomControls(row)
    })
  }

  if (actions.fit) {
    const fitControls = actions.fit
    addRailGroup(rightRail, () => {
      const { wrapper, row } = makeGroup('Fit')
      rightRail.appendChild(wrapper)
      row.appendChild(makeButton(ICONS.fitWidth, 'Fit width', () => {
        fitControls.fitWidth()
        refresh()
      }))
      row.appendChild(makeButton(ICONS.fitPage, 'Fit page', () => {
        fitControls.fitPage()
        refresh()
      }))
      if (fitControls.actualSize) {
        row.appendChild(makeButton(ICONS.actualSize, 'Actual size (100%)', () => {
          fitControls.actualSize?.()
          refresh()
        }, { chip: true }))
      }
    })
  }

  if (actions.rotate) {
    const rotateControls = actions.rotate
    addRailGroup(rightRail, () => {
      const { wrapper, row } = makeGroup('Rotate')
      rightRail.appendChild(wrapper)
      row.appendChild(makeButton(ICONS.rotateCcw, 'Rotate counter-clockwise (−90°)', () => {
        rotateControls.rotateCounterclockwise()
        refresh()
      }))
      if (typeof rotateControls.setRotation === 'function') {
        const input = document.createElement('input')
        input.type = 'text'
        input.inputMode = 'numeric'
        input.className = 'pf-input pf-input--rotate'
        input.placeholder = '0'
        input.setAttribute('aria-label', 'Rotation in degrees')
        input.title = 'Rotation in degrees — type a value and press Enter (empty or invalid input is ignored)'
        input.addEventListener('focus', () => input.select())
        const revert = (): void => {
          input.value = typeof rotateControls.rotation === 'number' ? String(rotateControls.rotation) : '0'
        }
        const commit = (): void => {
          const text = input.value.trim()
          if (text === '' || !Number.isFinite(Number(text))) {
            revert()
            refresh()
            return
          }
          try {
            rotateControls.setRotation?.(Number(text))
          } catch (error) {
            console.error('[preview-file] rotation failed', error)
          }
          refresh()
        }
        input.addEventListener('keydown', (event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            input.blur()
            commit()
          } else if (event.key === 'Escape') {
            revert()
            input.blur()
          }
        })
        input.addEventListener('blur', commit)
        refs.rotationInput = input
        row.appendChild(input)
      }
      row.appendChild(makeButton(ICONS.rotateCw, 'Rotate clockwise (+90°)', () => {
        rotateControls.rotateClockwise()
        refresh()
      }))
      if (rotateControls.resetRotation) {
        row.appendChild(makeButton(ICONS.resetRotation, 'Reset rotation (0°)', () => {
          rotateControls.resetRotation?.()
          refresh()
        }))
      }
    })
  }

  if (actions.singlePage || actions.canFullscreen) {
    addRailGroup(rightRail, () => {
      const { wrapper, row } = makeGroup('View')
      rightRail.appendChild(wrapper)
      if (actions.singlePage) {
        const single = makeButton(ICONS.continuous, 'Switch between continuous and single page view', () => {
          actions.singlePage?.toggle()
          refresh()
        })
        refs.singlePageButton = single
        row.appendChild(single)
      }
      if (actions.canFullscreen) {
        const fullscreen = makeButton(ICONS.maximize, 'Enter fullscreen', () => {
          void toggleFullscreen()
        })
        refs.fullscreenButton = fullscreen
        row.appendChild(fullscreen)
      }
    })
  }

  if (rightRail.childElementCount === 0) rightRail.style.display = 'none'

  /* ------------------------------------------------------------------ */
  /* Bottom bar: content-specific navigation & tools                    */
  /* ------------------------------------------------------------------ */

  /* Sheets — spreadsheet tabs live in the bottom region (like a desktop
     spreadsheet app) as horizontal pills; narrow workbooks scroll. */
  if (actions.sheets) {
    const sheets = actions.sheets
    const { wrapper, row } = makeGroup('Sheets')
    bottom.appendChild(wrapper)
    const seg = makeSegmented<string>(
      'Sheet',
      sheets.sheets.map((name) => ({ label: name, value: name })),
      sheets.activeSheet,
      (name) => {
        sheets.switchSheet(name)
        refresh()
      }
    )
    refs.sheetsSeg = seg
    row.appendChild(seg.el)
  }

  if (actions.pages) {
    const pages = actions.pages
    const { wrapper, row } = makeGroup('Pages')
    bottom.appendChild(wrapper)

    row.appendChild(makeButton(ICONS.prevPage, 'Previous page', () => {
      pages.previousPage()
      refresh()
    }))

    const input = document.createElement('input')
    input.type = 'text'
    input.inputMode = 'numeric'
    input.className = 'pf-input pf-input--page'
    input.addEventListener('focus', () => input.select())
    const commit = (): void => {
      const value = Number(input.value)
      const total = pages.pageCount ?? 1
      if (Number.isFinite(value) && value >= 1 && value <= total) {
        pages.goToPage(Math.floor(value))
      } else {
        input.value = String(pages.page ?? 1)
      }
      refresh()
    }
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault()
        input.blur()
        commit()
      } else if (event.key === 'Escape') {
        input.value = String(pages.page ?? 1)
        input.blur()
      }
    })
    input.addEventListener('blur', commit)
    refs.pageInput = input
    row.appendChild(input)

    const total = document.createElement('span')
    total.className = 'pf-txt'
    total.setAttribute('aria-hidden', 'true')
    refs.pageTotal = total
    row.appendChild(total)

    row.appendChild(makeButton(ICONS.nextPage, 'Next page', () => {
      pages.nextPage()
      refresh()
    }))
  }

  /* Image tools — bottom-centered controller for the image magnifier and, for
     images, the zoom cluster. The lens lives nowhere else in the chrome, so the
     image surface stays clean and the values (magnification / lens size / zoom
     %) always stay visible. Simple caption + segmented pills, normal flow. */
  if (actions.lens) {
    const lens = actions.lens
    const { wrapper, row } = makeGroup('Magnifier')
    wrapper.classList.add('pf-group--center')
    bottom.appendChild(wrapper)

    const magnification = makeSegmented<number>(
      'Lens magnification',
      lens.magnificationOptions.map((value) => ({ label: `${value}x`, value })),
      lens.magnification,
      (value) => lens.setMagnification(value)
    )
    refs.lensMagSeg = magnification
    const magPair = document.createElement('div')
    magPair.className = 'pf-pair'
    const magLabel = document.createElement('span')
    magLabel.className = 'pf-pair__label'
    magLabel.textContent = 'Magnification'
    magPair.append(magLabel, magnification.el)
    row.appendChild(magPair)

    row.appendChild(makeDivider())

    const size = makeSegmented<number>(
      'Lens size',
      lens.lensSizeOptions.map((value) => ({ label: `${value}px`, value })),
      lens.lensSize,
      (value) => lens.setLensSize(value)
    )
    refs.lensSizeSeg = size
    const sizePair = document.createElement('div')
    sizePair.className = 'pf-pair'
    const sizeLabel = document.createElement('span')
    sizeLabel.className = 'pf-pair__label'
    sizeLabel.textContent = 'Lens size'
    sizePair.append(sizeLabel, size.el)
    row.appendChild(sizePair)

    if (actions.canZoom) {
      row.appendChild(makeDivider())
      addZoomControls(row)
    }
  }

  if (bottom.childElementCount === 0) bottom.style.display = 'none'

  /* ------------------------------------------------------------------ */
  /* Refresh                                                            */
  /* ------------------------------------------------------------------ */

  const toggleFullscreen = (): void => {
    if (document.fullscreenElement) {
      void document.exitFullscreen()
    } else {
      void actions.fullscreen()
    }
  }

  const refresh = (): void => {
    if (refs.pageInput && refs.pageTotal && actions.pages) {
      const page = Math.max(1, Math.min(actions.pages.page, actions.pages.pageCount))
      refs.pageTotal.textContent = ` / ${actions.pages.pageCount}`
      if (document.activeElement !== refs.pageInput) {
        refs.pageInput.value = String(page)
      }
      refs.pageInput.setAttribute(
        'aria-label',
        `Page ${page} of ${actions.pages.pageCount}. Type a page number and press Enter`
      )
    }
    if (refs.sheetsSeg && actions.sheets) {
      refs.sheetsSeg.setActive(actions.sheets.activeSheet)
    }
    if (refs.wrapButton && actions.text) {
      const on = actions.text.wordWrap
      refs.wrapButton.classList.toggle('pf-btn--on', on)
      refs.wrapButton.setAttribute('aria-pressed', String(on))
      refs.wrapButton.title = on ? 'Turn off word wrap' : 'Turn on word wrap'
    }
    if (refs.singlePageButton && actions.singlePage) {
      const single = actions.singlePage.enabled
      if (refs.singlePageButton.dataset.single !== String(single)) {
        refs.singlePageButton.dataset.single = String(single)
        refs.singlePageButton.innerHTML = single ? ICONS.singlePage : ICONS.continuous
        refs.singlePageButton.title = single
          ? 'Single page — switch to continuous scroll'
          : 'Continuous scroll — switch to single page'
      }
      refs.singlePageButton.classList.toggle('pf-btn--on', single)
      refs.singlePageButton.setAttribute('aria-pressed', String(single))
    }
    if (refs.thumbnailsButton && actions.thumbnails) {
      const visible = actions.thumbnails.visible
      refs.thumbnailsButton.classList.toggle('pf-btn--on', visible)
      refs.thumbnailsButton.setAttribute('aria-pressed', String(visible))
      refs.thumbnailsButton.title = visible ? 'Hide thumbnails' : 'Show thumbnails'
    }
    if (refs.zoomLabel) {
      const percent = actions.zoomPercent
      if (percent !== null && percent !== undefined && String(percent) !== refs.zoomLabel.dataset.lastZoom) {
        refs.zoomLabel.textContent = `${percent}%`
        refs.zoomLabel.dataset.lastZoom = String(percent)
      }
    }
    if (refs.modeSeg && actions.viewMode) {
      refs.modeSeg.setActive(actions.viewMode.mode)
    }
    if (refs.rotationInput && typeof actions.rotate?.rotation === 'number') {
      const rotation = actions.rotate.rotation
      if (String(rotation) !== refs.rotationInput.dataset.lastRot) {
        if (document.activeElement !== refs.rotationInput) {
          refs.rotationInput.value = String(rotation)
        }
        refs.rotationInput.dataset.lastRot = String(rotation)
      }
    }
    if (refs.lensMagSeg && actions.lens) refs.lensMagSeg.setActive(actions.lens.magnification)
    if (refs.lensSizeSeg && actions.lens) refs.lensSizeSeg.setActive(actions.lens.lensSize)
    if (refs.fullscreenButton) {
      const fullscreen = Boolean(
        document.fullscreenElement && document.fullscreenElement.contains(root)
      )
      refs.fullscreenButton.innerHTML = fullscreen ? ICONS.minimize : ICONS.maximize
      refs.fullscreenButton.title = fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'
      refs.fullscreenButton.setAttribute('aria-label', fullscreen ? 'Exit fullscreen' : 'Enter fullscreen')
      refs.fullscreenButton.setAttribute('aria-pressed', String(fullscreen))
    }
  }

  /* ------------------------------------------------------------------ */
  /* Live updates + lifecycle                                           */
  /* ------------------------------------------------------------------ */

  const unsubscribes: (() => void)[] = []
  if (actions.pages?.onPageChange) {
    const unsubscribe = actions.pages.onPageChange(refresh)
    if (unsubscribe) unsubscribes.push(unsubscribe)
  }

  /* Light poll so the zoom % label stays honest for scroll / pinch zooming
     even though renderers never emit zoom events. */
  const zoomTimer = window.setInterval(refresh, 300)

  const onFullscreenChange = (): void => refresh()
  document.addEventListener('fullscreenchange', onFullscreenChange)

  refresh()

  return {
    root,
    stageHost,
    cleanup: () => {
      window.clearInterval(zoomTimer)
      document.removeEventListener('fullscreenchange', onFullscreenChange)
      for (const unsubscribe of unsubscribes) unsubscribe()
      root.remove()
    },
  }
}

export function mountControls(container: HTMLElement, actions: PreviewActions): () => void {
  const toolbar = buildToolbar(actions)

  /* The renderer's stage (created by preview() before controls mount) moves —
     untouched, DOM subtree included — into the center of the new chrome. If it
     is missing, a fresh one is created so the controls always have content
     space between the rails. */
  const stage = container.querySelector<HTMLElement>('.pf-stage')
  container.replaceChildren(toolbar.root)
  if (stage) {
    stage.classList.add('pf-stage')
    stage.style.flex = '1 1 auto'
    toolbar.stageHost.appendChild(stage)
  } else {
    const fallback = document.createElement('div')
    fallback.className = 'pf-stage'
    fallback.style.cssText = 'position:relative;flex:1 1 auto;min-width:0;min-height:0;overflow:hidden;'
    toolbar.stageHost.appendChild(fallback)
  }

  const cleanup = toolbar.cleanup
  return () => {
    cleanup()
  }
}