import type { PreviewActions } from './types.js'
import { ICONS as LUCIDE } from '../icons/icons.js'

/*
 * The preview control surface.
 *
 * Design: a Liquid Glass chrome distributed around the content — every control
 * is always visible and intentionally placed on the side where it belongs:
 *
 *   - Top bar (.pf-top): the document context — file info + format badge on the
 *     left, view-mode / text actions beside it, and the download action on the
 *     right. Pinned document-level actions.
 *   - Left rail (.pf-rail--left): sheet navigation (spreadsheets) and the
 *     thumbnail/sidebar toggle — things that sit next to the content.
 *   - Right rail (.pf-rail--right): zoom, fit, rotate, single/continuous and
 *     fullscreen plus the image lens — everything that changes how the content
 *     is seen.
 *   - Bottom bar (.pf-bottom): page navigation (prev / page input / total / next).
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

const GLASS_STYLE_ID = 'pf-glass-styles'

const GLASS_CSS = `
.pf-controls {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  width: 100%;
  color: var(--pf-ink, #172033);
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
/* Chrome regions: translucent glass surfaces that blur what scrolls behind
   them, hairline borders, soft shadows. All in normal flow — never overlay. */
.pf-top,
.pf-bottom,
.pf-rail {
  background: var(--pf-glass, rgba(250, 251, 253, 0.72));
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  backdrop-filter: blur(20px) saturate(180%);
}
.pf-top,
.pf-bottom {
  display: flex;
  align-items: center;
  gap: 2px;
  flex: 0 0 auto;
  padding: 6px 10px;
  overflow-x: auto;
  scrollbar-width: none;
  box-shadow: var(--pf-glass-shadow, 0 1px 2px rgba(15, 23, 42, 0.06), inset 0 1px 0 rgba(255, 255, 255, 0.8));
  animation: pf-in 0.18s ease-out;
}
.pf-top {
  border-bottom: 1px solid var(--pf-glass-line, rgba(15, 23, 42, 0.08));
}
.pf-bottom {
  border-top: 1px solid var(--pf-glass-line, rgba(15, 23, 42, 0.08));
  padding: 4px 10px;
}
.pf-top::-webkit-scrollbar,
.pf-bottom::-webkit-scrollbar {
  display: none;
}
@keyframes pf-in {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: none; }
}
.pf-body {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: row;
}
.pf-body__middle {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  display: flex;
  position: relative;
}
.pf-rail {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 8px 6px;
  min-width: 0;
}
.pf-rail--left {
  border-right: 1px solid var(--pf-glass-line, rgba(15, 23, 42, 0.08));
}
.pf-rail--right {
  border-left: 1px solid var(--pf-glass-line, rgba(15, 23, 42, 0.08));
}
.pf-rail .pf-group {
  align-items: center;
  width: 100%;
}
.pf-rail .pf-row {
  flex-direction: column;
  align-items: center;
  gap: 3px;
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
  color: var(--pf-ink-faint, #76808e);
  user-select: none;
  white-space: nowrap;
}
.pf-rail .pf-group__label {
  text-align: center;
  width: 100%;
}
.pf-group__label:empty { display: none; }
.pf-row {
  display: flex;
  align-items: center;
  gap: 2px;
}
.pf-spacer {
  flex: 1 1 auto;
  min-width: 6px;
}
.pf-divider {
  width: 1px;
  align-self: stretch;
  margin: 10px 3px;
  background: linear-gradient(180deg, transparent, var(--pf-glass-line, rgba(15, 23, 42, 0.12)), transparent);
}
.pf-rail .pf-divider {
  width: auto;
  height: 1px;
  align-self: stretch;
  margin: 2px 0;
  background: linear-gradient(90deg, transparent, var(--pf-glass-line-strong, rgba(15, 23, 42, 0.12)), transparent);
}
/* File context: icon + ellipsized name + format badge. */
.pf-fileinfo {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  padding: 0 4px;
  max-width: 260px;
}
.pf-fileinfo__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  flex: 1 1 auto;
  font-weight: 600;
  color: var(--pf-ink, #172033);
}
.pf-fileinfo__badge {
  flex: 0 0 auto;
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  padding: 2px 7px;
  border-radius: 999px;
  color: var(--pf-accent-strong, #1d4ed8);
  background: var(--pf-accent-tint, rgba(37, 99, 235, 0.1));
  border: 1px solid var(--pf-accent-ring, rgba(37, 99, 235, 0.45));
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
  background: var(--pf-hover-strong, rgba(255, 255, 255, 0.8));
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.1);
}
.pf-btn:active {
  transform: scale(0.93);
}
.pf-btn:focus-visible {
  outline: 2px solid var(--pf-accent-ring, rgba(37, 99, 235, 0.45));
  outline-offset: 1px;
}
.pf-btn--on {
  background: var(--pf-accent-tint, rgba(37, 99, 235, 0.1));
  color: var(--pf-accent-strong, #1d4ed8);
  border-color: var(--pf-accent-ring, rgba(37, 99, 235, 0.45));
}
.pf-btn--on:hover {
  background: var(--pf-accent-tint, rgba(37, 99, 235, 0.16));
}
.pf-btn--chip {
  width: auto;
  padding: 0 8px;
  min-width: 42px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.01em;
  color: var(--pf-ink-soft, #46505f);
}
.pf-txt {
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.01em;
  color: var(--pf-ink-soft, #46505f);
  white-space: nowrap;
}
.pf-input {
  height: 30px;
  min-width: 0;
  border-radius: 9px;
  border: 1px solid var(--pf-seg-border, rgba(15, 23, 42, 0.08));
  background: var(--pf-seg-bg, rgba(255, 255, 255, 0.5));
  padding: 0 6px;
  color: var(--pf-ink, #172033);
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
  color: var(--pf-ink-faint, #76808e);
}
.pf-input:hover {
  border-color: var(--pf-glass-line, rgba(15, 23, 42, 0.2));
}
.pf-input:focus {
  border-color: var(--pf-accent-ring, rgba(37, 99, 235, 0.45));
  background: var(--pf-hover-strong, rgba(255, 255, 255, 0.9));
  box-shadow: 0 0 0 3px var(--pf-accent-tint, rgba(37, 99, 235, 0.14));
}
.pf-input--page {
  width: 34px;
  padding: 0 2px;
}
.pf-input--rotate {
  width: 56px;
  padding: 0 4px;
}
.pf-seg {
  display: flex;
  gap: 2px;
  align-items: center;
  padding: 2px;
  border-radius: 10px;
  background: var(--pf-seg-bg, rgba(255, 255, 255, 0.5));
  border: 1px solid var(--pf-seg-border, rgba(15, 23, 42, 0.08));
}
.pf-seg--stack {
  flex-direction: column;
  align-items: stretch;
  width: 132px;
  max-width: 46vw;
}
.pf-seg--stack .pf-seg__btn {
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 0 10px;
}
.pf-seg__btn {
  height: 24px;
  padding: 0 9px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: var(--pf-ink-soft, #46505f);
  font: inherit;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.12s ease, color 0.12s ease, box-shadow 0.12s ease, transform 0.06s ease;
}
.pf-seg__btn:hover {
  background: var(--pf-hover-strong, rgba(255, 255, 255, 0.8));
}
.pf-seg__btn:active {
  transform: scale(0.95);
}
.pf-seg__btn:focus-visible {
  outline: 2px solid var(--pf-accent-ring, rgba(37, 99, 235, 0.45));
  outline-offset: 1px;
}
.pf-seg__btn--on {
  background: var(--pf-seg-on, #ffffff);
  color: var(--pf-accent-strong, #1d4ed8);
  font-weight: 600;
  box-shadow: var(--pf-seg-on-shadow, 0 1px 3px rgba(15, 23, 42, 0.14));
}
.pf-seg__btn--on:hover {
  background: var(--pf-seg-on, #ffffff);
}
/* Narrow surfaces: the rails reflow beneath the stage as horizontal strips so
   every control stays reachable — nothing folds into a hidden overflow menu. */
@media (max-width: 760px) {
  .pf-body {
    flex-direction: column;
  }
  .pf-body__middle,
  .pf-stage {
    order: 0;
  }
  .pf-rail {
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 8px 12px;
  }
  .pf-rail--left {
    order: 1;
    border-right: none;
    border-top: 1px solid var(--pf-glass-line, rgba(15, 23, 42, 0.08));
  }
  .pf-rail--right {
    order: 2;
    border-left: none;
    border-top: 1px solid var(--pf-glass-line, rgba(15, 23, 42, 0.08));
  }
  .pf-rail .pf-row {
    flex-direction: row;
    flex-wrap: wrap;
    justify-content: center;
  }
  .pf-rail .pf-divider {
    width: 1px;
    height: auto;
    align-self: stretch;
    margin: 0 2px;
  }
  .pf-seg--stack {
    width: auto;
  }
}
@media (pointer: coarse) {
  .pf-btn { width: 38px; height: 38px; }
  .pf-btn--chip { height: 38px; }
  .pf-input { height: 38px; }
  .pf-seg__btn { height: 30px; padding: 0 12px; }
  .pf-bottom .pf-btn { width: 34px; height: 34px; }
}
@media (max-width: 480px) {
  .pf-group__label { display: none; }
  .pf-fileinfo { max-width: 150px; }
}
@media (prefers-reduced-motion: reduce) {
  .pf-top, .pf-bottom { animation: none; }
  .pf-btn, .pf-seg__btn, .pf-input { transition: none; }
}
`

function ensureGlassStyles(): void {
  if (document.getElementById(GLASS_STYLE_ID)) return
  const style = document.createElement('style')
  style.id = GLASS_STYLE_ID
  style.textContent = GLASS_CSS
  document.head.appendChild(style)
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
  onChange: (value: T) => void,
  stack = false
): SegmentedResult<T> {
  const container = document.createElement('div')
  container.className = stack ? 'pf-seg pf-seg--stack' : 'pf-seg'
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

function makeGroup(label: string): { wrapper: HTMLDivElement; row: HTMLDivElement } {
  const wrapper = document.createElement('div')
  wrapper.className = 'pf-group'
  const labelEl = document.createElement('span')
  labelEl.className = 'pf-group__label'
  labelEl.textContent = label
  wrapper.appendChild(labelEl)
  const row = document.createElement('div')
  row.className = 'pf-row'
  wrapper.appendChild(row)
  return { wrapper, row }
}

function makeDivider(): HTMLDivElement {
  const divider = document.createElement('div')
  divider.className = 'pf-divider'
  divider.setAttribute('aria-hidden', 'true')
  return divider
}

function iconEl(svg: string, title: string): HTMLSpanElement {
  const el = document.createElement('span')
  el.style.display = 'flex'
  el.innerHTML = svg
  el.setAttribute('aria-hidden', 'true')
  el.title = title
  return el
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
  bottom.setAttribute('aria-label', 'Document navigation')
  root.appendChild(bottom)

  const refs = {} as ToolbarRefs

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
  /* Left rail: sheet navigation + sidebar toggles                      */
  /* ------------------------------------------------------------------ */

  if (actions.sheets) {
    const sheets = actions.sheets
    addRailGroup(leftRail, () => {
      const { wrapper, row } = makeGroup('Sheets')
      leftRail.appendChild(wrapper)
      const seg = makeSegmented<string>(
        'Sheet',
        sheets.sheets.map((name) => ({ label: name, value: name })),
        sheets.activeSheet,
        (name) => {
          sheets.switchSheet(name)
          refresh()
        },
        true
      )
      refs.sheetsSeg = seg
      row.appendChild(seg.el)
    })
  }

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
  /* flow, fullscreen and the image lens                                */
  /* ------------------------------------------------------------------ */

  if (actions.canZoom) {
    addRailGroup(rightRail, () => {
      const { wrapper, row } = makeGroup('Zoom')
      rightRail.appendChild(wrapper)
      row.appendChild(makeButton(ICONS.zoomOut, 'Zoom out', () => {
        actions.zoomOut()
        refresh()
      }))
      if (refs.zoomLabel === undefined) refs.zoomLabel = makeButton('', 'Current zoom — click to reset to the default view', () => {
        actions.resetZoom()
        refresh()
      }, { chip: true })
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

  if (actions.lens) {
    const lens = actions.lens
    addRailGroup(rightRail, () => {
      const { wrapper, row } = makeGroup('Lens')
      rightRail.appendChild(wrapper)

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
        const { wrapper: line, row: lineRow } = makeGroup(title)
        lineRow.appendChild(seg.el)
        row.appendChild(line)
      }

      stacked('Magnification', magnification)
      stacked('Size', size)
    })
  }

  if (rightRail.childElementCount === 0) rightRail.style.display = 'none'

  /* ------------------------------------------------------------------ */
  /* Bottom bar: page navigation                                        */
  /* ------------------------------------------------------------------ */

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