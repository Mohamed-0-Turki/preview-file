import type { PreviewActions } from './types.js'
import { ICONS as LUCIDE } from '../icons/icons.js'

/*
 * The preview control surface.
 *
 * Design: a sticky "navbar" bar pinned to the top of the preview area. Every
 * preview type gets the same visual language (bar, labeled groups, segmented
 * controls, buttons, inputs) and only the groups its adapter declares
 * capabilities for are rendered.
 *
 * - The bar is part of the preview layout (never an overlay): it sits at the
 *   top of the preview container with `position: sticky`, so it stays visible
 *   while the preview content scrolls beneath it and moves naturally with the
 *   page. It is not fixed to the browser viewport.
 * - Groups are labeled clusters (Mode / Pages / Zoom / View / Sheet / Search /
 *   Text / Lens / File) separated by hairline dividers.
 * - Pinned groups (Mode, Pages, Zoom, View, Sheet) stay on the bar; everything
 *   else collapses into a glass overflow menu ("More") on narrow surfaces,
 *   keeping the bar responsive without wrapping or overflowing.
 * - Icons are Lucide SVGs (24px grid, 2px stroke, round caps, currentColor,
 *   see src/icons/) rendered inline at 18px so they inherit the control style.
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
  fullscreen: LUCIDE['maximize'],
  prevPage: LUCIDE['chevron-left'],
  nextPage: LUCIDE['chevron-right'],
  singlePage: LUCIDE['file'],
  continuous: LUCIDE['file-stack'],
  download: LUCIDE['download'],
  rotateCw: LUCIDE['rotate-cw'],
  rotateCcw: LUCIDE['rotate-ccw'],
  copy: LUCIDE['copy'],
  wrap: LUCIDE['wrap-text'],
  search: LUCIDE['search'],
  clear: LUCIDE['x'],
  thumbnails: LUCIDE['layout-grid'],
  more: LUCIDE['ellipsis'],
}

const GLASS_STYLE_ID = 'pf-glass-styles'

const GLASS_CSS = `
.pf-controls {
  --pf-ink: #1a2233;
  --pf-ink-soft: rgba(30, 41, 59, 0.7);
  --pf-ink-faint: rgba(30, 41, 59, 0.5);
  --pf-accent: #1d4ed8;
  --pf-line: rgba(15, 23, 42, 0.14);
  position: sticky;
  top: 0;
  left: 0;
  right: 0;
  z-index: 30;
  flex: 0 0 auto;
  width: 100%;
  color: var(--pf-ink);
  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  font-size: 12px;
  -webkit-font-smoothing: antialiased;
}
.pf-controls *, .pf-controls *::before, .pf-controls *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}
/* Lucide icons are authored on a 24px canvas; render them uniformly at 18px.
   They use stroke="currentColor", so they inherit the control's color. */
.pf-controls svg {
  width: 18px;
  height: 18px;
  display: block;
  flex: none;
}
.pf-bar {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 2px;
  width: 100%;
  padding: 6px 10px;
  border-radius: 0;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.94), rgba(255, 255, 255, 0.86));
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  backdrop-filter: blur(20px) saturate(180%);
  border-bottom: 1px solid rgba(15, 23, 42, 0.12);
  box-shadow: 0 1px 3px rgba(2, 6, 23, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.9);
  overflow-x: auto;
  scrollbar-width: none;
  animation: pf-in 0.18s ease-out;
}
.pf-bar::-webkit-scrollbar {
  display: none;
}
/* When groups overflow the bar, keep pinned controls reachable from the left
   edge instead of centering (centered overflow clips both sides). */
.pf-bar--left {
  justify-content: flex-start;
}
@keyframes pf-in {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: none; }
}
.pf-group {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 0 2px;
}
.pf-group__label {
  padding: 0 6px;
  padding-top: 2px;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  line-height: 1;
  color: var(--pf-ink-faint);
  user-select: none;
  white-space: nowrap;
}
.pf-row {
  display: flex;
  align-items: center;
  gap: 2px;
}
.pf-divider {
  width: 1px;
  align-self: stretch;
  margin: 10px 3px;
  background: linear-gradient(180deg, rgba(15, 23, 42, 0), rgba(15, 23, 42, 0.16), rgba(15, 23, 42, 0));
}
.pf-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  padding: 0;
  flex: none;
  border: 1px solid transparent;
  border-radius: 9px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  transition: background 0.14s ease, color 0.14s ease, box-shadow 0.14s ease, transform 0.06s ease;
}
.pf-btn:hover {
  background: rgba(255, 255, 255, 0.62);
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.1);
}
.pf-btn:active {
  transform: scale(0.93);
}
.pf-btn:focus-visible {
  outline: 2px solid rgba(37, 99, 235, 0.55);
  outline-offset: 1px;
}
.pf-btn--on {
  background: linear-gradient(180deg, rgba(37, 99, 235, 0.22), rgba(37, 99, 235, 0.1));
  color: var(--pf-accent);
  border-color: rgba(37, 99, 235, 0.3);
  box-shadow: inset 0 0 0 1px rgba(37, 99, 235, 0.06);
}
.pf-btn--on:hover {
  background: linear-gradient(180deg, rgba(37, 99, 235, 0.28), rgba(37, 99, 235, 0.14));
}
.pf-btn--chip {
  width: auto;
  padding: 0 8px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.01em;
  color: var(--pf-ink-soft);
}
.pf-txt {
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.01em;
  color: var(--pf-ink-soft);
  white-space: nowrap;
}
.pf-input {
  height: 30px;
  min-width: 0;
  border-radius: 9px;
  border: 1px solid var(--pf-line);
  background: rgba(255, 255, 255, 0.55);
  padding: 0 6px;
  color: var(--pf-ink);
  font: inherit;
  font-size: 12px;
  text-align: center;
  outline: none;
  -moz-appearance: textfield;
  transition: border-color 0.14s ease, box-shadow 0.14s ease, background 0.14s ease;
}
.pf-input::-webkit-outer-spin-button,
.pf-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
.pf-input::placeholder {
  color: var(--pf-ink-faint);
}
.pf-input:hover {
  border-color: rgba(15, 23, 42, 0.24);
}
.pf-input:focus {
  border-color: rgba(37, 99, 235, 0.55);
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.16);
}
.pf-input--page {
  width: 34px;
  padding: 0 2px;
}
.pf-input--rotate {
  width: 56px;
  padding: 0 4px;
}
.pf-search {
  position: relative;
}
.pf-search__icon {
  position: absolute;
  left: 8px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  color: var(--pf-ink-faint);
  pointer-events: none;
}
.pf-search__input {
  width: 148px;
  height: 30px;
  border-radius: 9px;
  border: 1px solid var(--pf-line);
  background: rgba(255, 255, 255, 0.55);
  padding: 0 24px 0 28px;
  color: var(--pf-ink);
  font: inherit;
  font-size: 12px;
  outline: none;
  transition: border-color 0.14s ease, box-shadow 0.14s ease, background 0.14s ease;
}
.pf-search__input::placeholder {
  color: var(--pf-ink-faint);
}
.pf-search__input:focus {
  border-color: rgba(37, 99, 235, 0.55);
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.16);
}
.pf-seg {
  display: flex;
  gap: 2px;
  align-items: center;
  padding: 2px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.42);
  border: 1px solid rgba(15, 23, 42, 0.1);
}
.pf-seg__btn {
  height: 24px;
  padding: 0 9px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: var(--pf-ink-soft);
  font: inherit;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.12s ease, color 0.12s ease, box-shadow 0.12s ease, transform 0.06s ease;
}
.pf-seg__btn:hover {
  background: rgba(255, 255, 255, 0.6);
}
.pf-seg__btn:active {
  transform: scale(0.95);
}
.pf-seg__btn:focus-visible {
  outline: 2px solid rgba(37, 99, 235, 0.55);
  outline-offset: 1px;
}
.pf-seg__btn--on {
  background: #fff;
  color: var(--pf-accent);
  font-weight: 600;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.16), 0 0 0 1px rgba(15, 23, 42, 0.05);
}
.pf-seg__btn--on:hover {
  background: #fff;
}
.pf-more {
  position: relative;
  align-self: stretch;
  margin-left: auto;
}
.pf-menu {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  display: none;
  flex-direction: column;
  gap: 2px;
  min-width: 236px;
  max-height: min(70vh, 480px);
  overflow-y: auto;
  padding: 6px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.9);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  backdrop-filter: blur(24px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.72);
  box-shadow: 0 22px 46px rgba(2, 6, 23, 0.24), inset 0 1px 0 rgba(255, 255, 255, 0.85);
}
.pf-menu--open {
  display: flex;
  animation: pf-in 0.16s ease-out;
}
.pf-menu .pf-group {
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 7px 8px;
  border-radius: 9px;
}
.pf-menu .pf-group:hover {
  background: rgba(255, 255, 255, 0.65);
}
.pf-menu .pf-group:not(:first-child) {
  border-top: 1px solid rgba(15, 23, 42, 0.06);
}
.pf-menu .pf-group .pf-group__label {
  padding: 0;
  font-size: 10.5px;
}
.pf-menu .pf-divider {
  display: none;
}
@media (pointer: coarse) {
  .pf-btn { width: 38px; height: 38px; }
  .pf-btn--chip { height: 38px; }
  .pf-input, .pf-search, .pf-search__input { height: 38px; }
  .pf-seg__btn { height: 30px; padding: 0 12px; }
  .pf-group { gap: 2px; }
}
@media (max-width: 480px) {
  .pf-bar .pf-group__label { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .pf-bar, .pf-menu { animation: none; }
  .pf-btn, .pf-seg__btn, .pf-input, .pf-search__input { transition: none; }
}
`

function ensureGlassStyles(): void {
  if (document.getElementById(GLASS_STYLE_ID)) return
  const style = document.createElement('style')
  style.id = GLASS_STYLE_ID
  style.textContent = GLASS_CSS
  document.head.appendChild(style)
}

interface GroupRef {
  key: string
  el: HTMLDivElement
  cluster: string
  pinned: boolean
  width: number
}

interface SegmentedResult<T> {
  el: HTMLDivElement
  setActive: (value: T) => void
}

function makeButton(
  content: string,
  label: string,
  onClick: () => void,
  options: { pressed?: boolean; chip?: boolean } = {}
): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = `pf-btn${options.pressed ? ' pf-btn--on' : ''}${options.chip ? ' pf-btn--chip' : ''}`
  button.innerHTML = content
  button.title = label
  button.setAttribute('aria-label', label)
  if (options.pressed !== undefined) {
    button.setAttribute('aria-pressed', String(options.pressed))
  }
  button.addEventListener('click', () => {
    try {
      onClick()
    } catch (error) {
      console.error('[preview-file] control failed', error)
    }
  })
  return button
}

function makeSegmented<T extends string | number>(
  label: string,
  options: readonly { label: string; value: T }[],
  initial: T,
  onChange: (value: T) => void
): SegmentedResult<T> {
  const container = document.createElement('div')
  container.className = 'pf-seg'
  container.setAttribute('role', 'radiogroup')
  container.setAttribute('aria-label', label)

  let activeIndex = Math.max(0, options.findIndex((option) => option.value === initial))
  const buttons: HTMLButtonElement[] = []

  const apply = (index: number, focus: boolean): void => {
    for (let i = 0; i < buttons.length; i += 1) {
      const selected = i === index
      const button = buttons[i] as HTMLButtonElement
      button.classList.toggle('pf-seg__btn--on', selected)
      button.setAttribute('aria-checked', String(selected))
      button.tabIndex = selected ? 0 : -1
    }
    if (focus) buttons[index]?.focus()
  }

  const select = (index: number, focus = false): void => {
    if (index === activeIndex && !focus) return
    activeIndex = index
    apply(index, focus)
    onChange(options[index]?.value as T)
  }

  options.forEach((option, index) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'pf-seg__btn'
    button.textContent = option.label
    button.title = `${label}: ${option.label}`
    button.dataset.value = String(option.value)
    button.tabIndex = index === activeIndex ? 0 : -1
    button.addEventListener('click', () => select(index))
    buttons.push(button)
    container.appendChild(button)
  })

  container.addEventListener('keydown', (event) => {
    if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(event.key)) return
    event.preventDefault()
    const delta = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1
    select((activeIndex + delta + buttons.length) % buttons.length, true)
  })

  apply(activeIndex, false)

  return {
    el: container,
    setActive: (value: T) => {
      const index = options.findIndex((option) => option.value === value)
      if (index >= 0) select(index)
    },
  }
}

function makeGroup(label: string, cluster: string): { wrapper: HTMLDivElement; row: HTMLDivElement } {
  const wrapper = document.createElement('div')
  wrapper.className = 'pf-group'
  const labelEl = document.createElement('span')
  labelEl.className = 'pf-group__label'
  labelEl.textContent = label
  wrapper.appendChild(labelEl)
  const row = document.createElement('div')
  row.className = 'pf-row'
  wrapper.appendChild(row)
  wrapper.dataset.cluster = cluster
  return { wrapper, row }
}

function makeDivider(): HTMLDivElement {
  const divider = document.createElement('div')
  divider.className = 'pf-divider'
  divider.setAttribute('aria-hidden', 'true')
  return divider
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
  searchInput?: HTMLInputElement
  searchClear?: HTMLButtonElement
  searchCount?: HTMLSpanElement
  modeSeg?: SegmentedResult<'preview' | 'code'>
}

function buildToolbar(actions: PreviewActions): { root: HTMLElement; cleanup: () => void; scheduleLayout: () => void } {
  ensureGlassStyles()

  const root = document.createElement('div')
  root.className = 'pf-controls'

  const bar = document.createElement('div')
  bar.className = 'pf-bar'
  bar.setAttribute('role', 'toolbar')
  bar.setAttribute('aria-label', 'Preview controls')
  root.appendChild(bar)

  const moreWrapper = document.createElement('div')
  moreWrapper.className = 'pf-more'
  bar.appendChild(moreWrapper)

  const moreButton = makeButton(ICONS.more, 'More controls', () => toggleMenu(true))
  moreButton.setAttribute('aria-haspopup', 'true')
  moreButton.setAttribute('aria-expanded', 'false')
  moreButton.style.display = 'none'
  moreWrapper.appendChild(moreButton)

  const menu = document.createElement('div')
  menu.className = 'pf-menu'
  menu.setAttribute('role', 'menu')
  menu.setAttribute('aria-label', 'More controls')
  moreWrapper.appendChild(menu)

  const refs = {} as ToolbarRefs
  if (actions.zoomPercent !== undefined) {
    refs.zoomLabel = makeButton('100%', 'Current zoom — click to reset to the default view', () => {
      actions.resetZoom()
      refresh()
    }, { chip: true })
    refs.zoomLabel.dataset.lastZoom = ''
  }

  /* ------------------------------------------------------------------ */
  /* Groups (visual order == insertion order). Pinned groups survive     */
  /* the overflow collapse.                                             */
  /* ------------------------------------------------------------------ */

  const groupRefs: GroupRef[] = []

  const addGroup = (key: string, label: string, cluster: string, pinned: boolean, build: (row: HTMLDivElement) => void): void => {
    const { wrapper, row } = makeGroup(label, cluster)
    build(row)
    groupRefs.push({ key, el: wrapper, cluster, pinned, width: 0 })
  }

  /* Mode — pinned so switching between alternate views (e.g. a Markdown
     document's rendered Preview and its raw Code) stays one tap away. */
  if (actions.viewMode) {
    const viewMode = actions.viewMode
    addGroup('mode', 'Mode', 'document', true, (row) => {
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
    })
  }

  /* Pages — pinned. */
  if (actions.pages) {
    addGroup('pages', 'Pages', 'document', true, (row) => {
      row.appendChild(
        makeButton(ICONS.prevPage, 'Previous page', () => {
          actions.pages?.previousPage()
          refresh()
        })
      )

      const input = document.createElement('input')
      input.type = 'text'
      input.inputMode = 'numeric'
      input.className = 'pf-input pf-input--page'
      input.addEventListener('focus', () => input.select())
      const commit = (): void => {
        const value = Number(input.value)
        const total = actions.pages?.pageCount ?? 1
        if (Number.isFinite(value) && value >= 1 && value <= total) {
          actions.pages?.goToPage(Math.floor(value))
        } else {
          input.value = String(actions.pages?.page ?? 1)
        }
        refresh()
      }
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          input.blur()
          commit()
        } else if (event.key === 'Escape') {
          input.value = String(actions.pages?.page ?? 1)
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

      row.appendChild(
        makeButton(ICONS.nextPage, 'Next page', () => {
          actions.pages?.nextPage()
          refresh()
        })
      )

      if (actions.singlePage) {
        const single = makeButton(ICONS.continuous, 'Switch between continuous and single page view', () => {
          actions.singlePage?.toggle()
          refresh()
        })
        refs.singlePageButton = single
        row.appendChild(single)
      }
    })
  }

  /* Zoom — pinned. */
  if (actions.canZoom) {
    addGroup('zoom', 'Zoom', 'document', true, (row) => {
      row.appendChild(
        makeButton(ICONS.zoomOut, 'Zoom out', () => {
          actions.zoomOut()
          refresh()
        })
      )
      if (refs.zoomLabel) row.appendChild(refs.zoomLabel)
      row.appendChild(
        makeButton(ICONS.zoomIn, 'Zoom in', () => {
          actions.zoomIn()
          refresh()
        })
      )
      row.appendChild(
        makeButton(ICONS.reset, 'Reset to default view', () => {
          actions.resetZoom()
          refresh()
        })
      )
    })
  }

  /* View — pinned so rotation (and other view state) stays one tap away even
     on narrow surfaces; everything else folds into the overflow menu. */
  const viewNeeded = Boolean(actions.fit || actions.rotate || actions.thumbnails || actions.canFullscreen)
  if (viewNeeded) {
    addGroup('view', 'View', 'document', true, (row) => {
      if (actions.fit) {
        row.appendChild(
          makeButton(ICONS.fitWidth, 'Fit width', () => {
            actions.fit?.fitWidth()
            refresh()
          })
        )
        row.appendChild(
          makeButton(ICONS.fitPage, 'Fit page', () => {
            actions.fit?.fitPage()
            refresh()
          })
        )
        if (actions.fit.actualSize) {
          row.appendChild(
            makeButton(ICONS.actualSize, 'Actual size (100%)', () => {
              actions.fit?.actualSize?.()
              refresh()
            }, { chip: true })
          )
        }
      }
      if (actions.rotate) {
        row.appendChild(
          makeButton(ICONS.rotateCcw, 'Rotate counter-clockwise (−90°)', () => {
            actions.rotate?.rotateCounterclockwise()
            refresh()
          })
        )
        if (typeof actions.rotate.setRotation === 'function') {
          const input = document.createElement('input')
          input.type = 'text'
          input.inputMode = 'numeric'
          input.className = 'pf-input pf-input--rotate'
          input.placeholder = '0'
          input.setAttribute('aria-label', 'Rotation in degrees')
          input.title = 'Rotation in degrees — type a value and press Enter (empty or invalid input is ignored)'
          input.addEventListener('focus', () => input.select())
          const revert = (): void => {
            input.value = typeof actions.rotate?.rotation === 'number' ? String(actions.rotate.rotation) : '0'
          }
          const commit = (): void => {
            const text = input.value.trim()
            if (text === '' || !Number.isFinite(Number(text))) {
              revert()
              refresh()
              return
            }
            try {
              actions.rotate?.setRotation?.(Number(text))
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
        row.appendChild(
          makeButton(ICONS.rotateCw, 'Rotate clockwise (+90°)', () => {
            actions.rotate?.rotateClockwise()
            refresh()
          })
        )
        if (actions.rotate.resetRotation) {
          row.appendChild(
            makeButton(ICONS.resetRotation, 'Reset rotation (0°)', () => {
              actions.rotate?.resetRotation?.()
              refresh()
            })
          )
        }
      }
      if (actions.thumbnails) {
        const thumbnails = makeButton(ICONS.thumbnails, 'Show thumbnails', () => {
          actions.thumbnails?.setVisible(!actions.thumbnails.visible)
          refresh()
        })
        refs.thumbnailsButton = thumbnails
        row.appendChild(thumbnails)
      }
      if (actions.canFullscreen) {
        row.appendChild(
          makeButton(ICONS.fullscreen, 'Enter fullscreen', () => {
            void actions.fullscreen()
          })
        )
      }
    })
  }

  /* Sheet — spreadsheet-specific, pinned so the active sheet stays one tap
     away on every screen size. */
  if (actions.sheets) {
    const sheets = actions.sheets
    addGroup('sheet', 'Sheet', 'spreadsheet', true, (row) => {
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
    })
  }

  /* Search — spreadsheet-specific. */
  if (actions.search) {
    const search = actions.search
    addGroup('search', 'Search', 'spreadsheet', false, (row) => {
      const wrap = document.createElement('div')
      wrap.className = 'pf-search'
      const icon = document.createElement('span')
      icon.className = 'pf-search__icon'
      icon.innerHTML = ICONS.search
      wrap.appendChild(icon)
      const input = document.createElement('input')
      input.type = 'search'
      input.className = 'pf-search__input'
      input.placeholder = 'Search cells'
      input.setAttribute('aria-label', 'Search cells')
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          search.search(input.value.trim())
          refresh()
        } else if (event.key === 'Escape') {
          if (input.value) {
            input.value = ''
            search.clear?.()
            search.search('')
            refresh()
            input.focus()
          }
        }
      })
      wrap.appendChild(input)
      row.appendChild(wrap)

      const clear = makeButton(ICONS.clear, 'Clear search', () => {
        input.value = ''
        search.clear?.()
        search.search('')
        refresh()
        input.focus()
      })
      refs.searchClear = clear
      row.appendChild(clear)

      const count = document.createElement('span')
      count.className = 'pf-txt'
      count.style.minWidth = '22px'
      count.style.textAlign = 'center'
      count.setAttribute('aria-live', 'polite')
      refs.searchCount = count
      row.appendChild(count)

      refs.searchInput = input
    })
  }

  /* Text */
  if (actions.text && (actions.text.canCopy || actions.text.canWordWrap)) {
    const text = actions.text
    addGroup('text', 'Text', 'text', false, (row) => {
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
    })
  }

  /* Lens — image previews only, built straight from the renderer's lens
     adapter. Defaults (8x magnification, 160px size) need no configuration. */
  if (actions.lens) {
    const lens = actions.lens
    addGroup('lens', 'Lens', 'image', false, (row) => {
      const magnification = makeSegmented<number>(
        'Lens magnification',
        lens.magnificationOptions.map((value) => ({ label: `${value}x`, value })),
        lens.magnification,
        (value) => lens.setMagnification(value)
      )
      refs.lensMagSeg = magnification

      const size = makeSegmented<number>(
        'Lens size',
        lens.lensSizeOptions.map((value) => ({ label: `${value}px`, value })),
        lens.lensSize,
        (value) => lens.setLensSize(value)
      )
      refs.lensSizeSeg = size

      const stacked = (title: string, seg: SegmentedResult<number>): void => {
        const line = document.createElement('div')
        line.style.display = 'flex'
        line.style.alignItems = 'center'
        line.style.gap = '8px'
        const label = document.createElement('span')
        label.className = 'pf-group__label'
        label.textContent = title
        label.style.padding = '0'
        line.appendChild(label)
        line.appendChild(seg.el)
        row.appendChild(line)
      }

      stacked('Magnification', magnification)
      stacked('Size', size)
    })
  }

  /* File */
  if (actions.canDownload) {
    addGroup('file', 'File', 'file', false, (row) => {
      row.appendChild(makeButton(ICONS.download, 'Download', () => actions.download()))
    })
  }

  if (groupRefs.length === 0) {
    root.style.display = 'none'
  }

  /* ------------------------------------------------------------------ */
  /* Refresh                                                            */
  /* ------------------------------------------------------------------ */

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
    if (refs.searchCount && actions.search) {
      const count = actions.search.resultCount
      refs.searchCount.textContent = count === undefined ? '' : count === 0 ? 'no' : String(count)
      refs.searchCount.title =
        count === undefined ? '' : count === 0 ? 'No matches' : count === 1 ? '1 match' : `${count} matches`
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
  }

  /* ------------------------------------------------------------------ */
  /* Overflow layout                                                     */
  /* ------------------------------------------------------------------ */

  const MENU_BUTTON_WIDTH = 38
  let lastSignature = ''

  const renderBar = (): void => {
    while (bar.firstChild && bar.firstChild !== moreWrapper) {
      bar.removeChild(bar.firstChild)
    }
    const visible = groupRefs.filter((group) => group.el.parentElement !== menu)
    let lastCluster = ''
    for (const group of visible) {
      if (lastCluster && group.cluster !== lastCluster) bar.appendChild(makeDivider())
      bar.appendChild(group.el)
      lastCluster = group.cluster
    }
    bar.appendChild(moreWrapper)
  }

  /* Group widths are intrinsic, so they are measured exactly once. */
  const measurer = document.createElement('div')
  measurer.style.cssText = 'position:fixed;left:-9999px;top:0;display:flex;flex-direction:column;gap:1px;'
  document.body.appendChild(measurer)
  for (const group of groupRefs) {
    measurer.appendChild(group.el)
    group.width = group.el.offsetWidth || 0
    measurer.removeChild(group.el)
    bar.appendChild(group.el)
  }
  measurer.remove()

  const layout = (): void => {
    const hostWidth = root.parentElement?.clientWidth ?? 0
    const available = Math.max(220, Math.min(window.innerWidth - 24, (hostWidth || window.innerWidth) - 24, 640))

    const total = groupRefs.reduce((sum, group) => sum + group.width, 0) + groupRefs.length * 2
    const capacity = available - MENU_BUTTON_WIDTH

    const toMenu = new Set<string>()
    if (total > capacity) {
      let remaining = total
      const popable = groupRefs.filter((group) => !group.pinned).reverse()
      for (const group of popable) {
        if (remaining <= capacity) break
        remaining -= group.width + 2
        toMenu.add(group.key)
      }
    }
    bar.classList.toggle('pf-bar--left', total > capacity)

    for (const group of groupRefs) {
      const inMenu = group.el.parentElement === menu
      const shouldBeInMenu = toMenu.has(group.key)
      if (shouldBeInMenu) {
        if (!inMenu) menu.appendChild(group.el)
      } else if (inMenu) {
        menu.removeChild(group.el)
      }
    }

    const inMenu = groupRefs.filter((group) => group.el.parentElement === menu)
    moreButton.style.display = inMenu.length > 0 ? 'inline-flex' : 'none'
    if (inMenu.length === 0) toggleMenu(false)

    const signature = groupRefs.filter((group) => group.el.parentElement !== menu).map((group) => group.key).join(',')
    if (signature !== lastSignature) {
      lastSignature = signature
      renderBar()
    }
  }

  /* ------------------------------------------------------------------ */
  /* More menu behaviour                                                */
  /* ------------------------------------------------------------------ */

  const toggleMenu = (open: boolean): void => {
    const isOpen = menu.classList.contains('pf-menu--open')
    if (open === isOpen) return
    if (open) {
      menu.classList.add('pf-menu--open')
      moreButton.setAttribute('aria-expanded', 'true')
      const first = menu.querySelector<HTMLElement>('.pf-group:first-child button, .pf-group:first-child input')
      first?.focus()
    } else {
      menu.classList.remove('pf-menu--open')
      moreButton.setAttribute('aria-expanded', 'false')
    }
  }

  const onDocumentPointerDown = (event: PointerEvent): void => {
    if (menu.classList.contains('pf-menu--open') && !root.contains(event.target as Node)) {
      toggleMenu(false)
    }
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!menu.classList.contains('pf-menu--open')) return
    if (event.key === 'Escape') {
      event.preventDefault()
      toggleMenu(false)
      moreButton.focus()
      return
    }
    if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return
    const focusables = Array.from(menu.querySelectorAll<HTMLElement>('button, input'))
    if (focusables.length === 0) return
    const index = focusables.indexOf(document.activeElement as HTMLElement)
    const next = event.key === 'ArrowDown' ? (index + 1) % focusables.length : (index - 1 + focusables.length) % focusables.length
    event.preventDefault()
    focusables[next]?.focus()
  }

  document.addEventListener('pointerdown', onDocumentPointerDown)
  document.addEventListener('keydown', onKeyDown)
  const onWindowResize = (): void => scheduleLayout()
  window.addEventListener('resize', onWindowResize)

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

  const scheduleLayout = (): void => {
    lastSignature = '<pending>'
    window.setTimeout(layout, 0)
  }

  refresh()
  layout()
  scheduleLayout()

  return {
    root,
    scheduleLayout,
    cleanup: () => {
      window.clearInterval(zoomTimer)
      document.removeEventListener('pointerdown', onDocumentPointerDown)
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('resize', onWindowResize)
      for (const unsubscribe of unsubscribes) unsubscribe()
      root.remove()
    },
  }
}

export function mountControls(container: HTMLElement, actions: PreviewActions): () => void {
  const toolbar = buildToolbar(actions)
  container.insertBefore(toolbar.root, container.firstChild)

  const resizeObserver = new ResizeObserver(() => toolbar.scheduleLayout())
  resizeObserver.observe(container)

  const cleanup = toolbar.cleanup
  return () => {
    resizeObserver.disconnect()
    cleanup()
  }
}