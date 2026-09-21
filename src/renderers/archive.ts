import type { PreviewAdapter } from '../controls/types.js'
import type { PreviewOptions, PreviewResult } from '../types.js'
import type { SourceInput } from '../sources/types.js'
import {
  ArchivePasswordError,
  archiveFormatLabel,
  createArchiveProvider,
  resolveArchiveFormat,
  type ArchiveEntry,
  type ArchiveFormat,
  type ArchiveProvider,
} from '../archives/index.js'
import { ICONS as LUCIDE } from '../icons/icons.js'
import { isArchiveResultData } from '../previewers/result-types.js'
import { createRenderState } from './render-state.js'
import { downloadBlob, extensionFrom, mimeFromExtension } from '../utils/index.js'
import type { RenderContext, Renderer } from './types.js'

const ROW_HEIGHT = 32
const STYLE_ID = 'pf-archive-styles'

/* Scoped Liquid Glass language matched to the rest of the library: GitHub
   grays, Lucide inline icons, system UI type, rounded segmented controls. The
   class is namespaced so the styles can never leak out of the preview stage. */
const ARCHIVE_CSS = `
.pf-archive {
  --ink: var(--pf-ink, #172033);
  --ink-soft: var(--pf-ink-soft, #46505f);
  --ink-faint: var(--pf-ink-faint, #76808e);
  --line: var(--pf-line, #dce1e8);
  --line-end: var(--pf-line-end, #eef1f5);
  --bar: var(--pf-surface-2, #f6f8fb);
  --surface: var(--pf-surface, #ffffff);
  --accent: var(--pf-accent, #2563eb);
  --accent-tint: var(--pf-accent-tint, rgba(37, 99, 235, 0.1));
  --error: var(--pf-error, #cf222e);
  --success: var(--pf-success, #1f883d);
  --folder: var(--pf-folder, #a16207);
  --file: var(--pf-file, #59636e);
  box-sizing: border-box;
  color: var(--ink);
  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  font-size: 13px;
  line-height: 1.4;
}
.pf-archive *, .pf-archive *::before, .pf-archive *::after { box-sizing: border-box; }
.pf-archive .pf-icon svg { width: 100%; height: 100%; display: block; }
.pf-archive button.pf-ibtn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 7px;
  background: transparent;
  color: var(--ink-soft);
  font: inherit;
  cursor: pointer;
  flex: 0 0 28px;
}
.pf-archive button.pf-ibtn:hover { background: var(--bar); color: var(--ink); }
.pf-archive button.pf-ibtn:disabled { opacity: 0.35; cursor: default; pointer-events: none; }
.pf-archive button.pf-ibtn:focus-visible,
.pf-archive input.pf-input:focus-visible,
.pf-archive .pf-arc-abl:focus-visible,
.pf-archive .pf-arc-row:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -1px;
}
.pf-archive button.pf-action {
  height: 30px;
  padding: 0 16px;
  border: 1px solid var(--success);
  border-radius: 8px;
  background: var(--success);
  color: #ffffff;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
.pf-archive button.pf-action:disabled { opacity: 0.7; cursor: default; }
.pf-archive button.pf-btn {
  height: 30px;
  padding: 0 16px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
  color: var(--ink);
  font: inherit;
  cursor: pointer;
}
.pf-archive button.pf-btn:hover { background: var(--bar); }

/* ---- Two-pane explorer layout. The tree pane carries all archive chrome;
   the nested file preview is confined to the right pane, so controllers can
   never overlap the archive navigation (see ADR-0014). ---- */
.pf-arc {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: row;
  align-items: stretch;
  overflow: hidden;
  background: var(--surface);
}

.pf-arc-tree {
  flex: 0 0 264px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border-right: 1px solid var(--line);
  position: relative;
  z-index: 2;
}
.pf-arc-tree__head {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 7px 8px;
  border-bottom: 1px solid var(--line-end);
}
.pf-arc-nav { display: flex; align-items: center; gap: 2px; flex: 0 0 auto; }
.pf-arc-crumbs { flex: 1 1 auto; min-width: 40px; display: flex; align-items: center; gap: 2px; overflow: hidden; }
.pf-arc-abl {
  border: none;
  background: transparent;
  padding: 2px 3px;
  border-radius: 4px;
  font: inherit;
  color: var(--accent);
  cursor: pointer;
  flex: 0 1 auto;
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pf-arc-abl:hover { text-decoration: underline; }
.pf-arc-badge {
  flex: 0 0 auto;
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.05em;
  color: var(--ink-soft);
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 1px 8px;
  white-space: nowrap;
  background: var(--surface);
}
.pf-arc-tree__list { flex: 1 1 auto; min-height: 0; position: relative; overflow: auto; }
.pf-arc-trunk { position: relative; width: 100%; }
.pf-arc-empty { padding: 28px 16px; color: var(--ink-soft); text-align: center; }
.pf-arc-tree__foot {
  flex: 0 0 auto;
  padding: 6px 10px;
  font-size: 11px;
  color: var(--ink-faint);
  border-top: 1px solid var(--line-end);
  display: flex;
  justify-content: space-between;
  gap: 8px;
}

.pf-arc-row {
  position: absolute;
  left: 0;
  right: 0;
  height: 32px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 8px;
  cursor: pointer;
  color: var(--ink);
  border-bottom: 1px solid var(--line-end);
  outline: none;
}
.pf-arc-row:hover { background: var(--bar); }
.pf-arc-row:focus-visible { box-shadow: inset 0 0 0 2px var(--accent); }
.pf-arc-row--cur { background: var(--accent-tint); box-shadow: inset 2px 0 0 var(--accent); }
.pf-arc-row--cur:hover { background: var(--accent-tint); }
.pf-arc-row__name { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pf-arc-row__size { flex: 0 0 auto; font-size: 11.5px; color: var(--ink-faint); padding-right: 2px; }

.pf-arc-pane {
  flex: 1 1 auto;
  min-width: 0;
  position: relative;
  display: flex;
  flex-direction: column;
}
.pf-arc-mobilebar {
  flex: 0 0 auto;
  display: none;
  align-items: center;
  gap: 6px;
  padding: 5px 8px;
  border-bottom: 1px solid var(--line-end);
  background: var(--surface);
}
.pf-arc-mobilebar__title {
  font-size: 12px;
  font-weight: 600;
  color: var(--ink-soft);
}
.pf-arc-canvas { flex: 1 1 auto; min-height: 0; position: relative; background: var(--pf-doc-bg, #e8ecf1); }
.pf-arc-host { position: absolute; inset: 0; display: none; overflow: hidden; background: var(--surface); }
.pf-arc-placeholder {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--ink-faint);
  text-align: center;
  padding: 24px;
}
.pf-arc-note {
  margin: auto;
  max-width: 520px;
  padding: 16px 20px;
  color: var(--ink-soft);
  font-size: 13px;
  line-height: 1.5;
  text-align: center;
  white-space: pre-line;
  word-wrap: break-word;
}

/* ---- Password unlock (overlays both panes) ---- */
.pf-arc-lock {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: var(--surface);
  z-index: 5;
}
.pf-arc-lockcard {
  width: 100%;
  max-width: 380px;
  padding: 20px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface);
  box-shadow: 0 6px 24px rgba(15, 23, 42, 0.08);
}
.pf-arc-lockcard .pf-arc-locktitle {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 6px;
}
.pf-arc-lockcard .pf-arc-lockhint {
  color: var(--ink-soft);
  font-size: 12px;
  line-height: 1.5;
  margin: 0 0 10px;
}
.pf-arc-lockrow { display: flex; align-items: center; gap: 6px; }
.pf-arc-lockrow input {
  flex: 1 1 auto;
  min-width: 0;
  height: 30px;
  padding: 0 8px;
  border: 1px solid var(--line);
  border-radius: 8px;
  font: inherit;
  color: var(--ink);
  background: var(--surface);
}
.pf-arc-lockmsg { color: var(--error); font-size: 12px; min-height: 16px; margin-top: 6px; }

@media (max-width: 767px) {
  .pf-arc { display: block; }
  .pf-arc-tree {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    width: min(300px, 85vw);
    transform: translateX(-102%);
    transition: transform 0.18s ease;
    box-shadow: 0 10px 30px rgba(15, 23, 42, 0.18);
    border-right: 1px solid var(--line);
  }
  .pf-arc-tree--open { transform: none; }
  .pf-arc-pane { position: absolute; inset: 0; }
  .pf-arc-mobilebar { display: flex; }
}
@media (pointer: coarse) {
  .pf-archive button.pf-ibtn { width: 38px; height: 38px; flex-basis: 38px; }
}
`

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = ARCHIVE_CSS
  document.head.appendChild(style)
}

function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return ''
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  const value = bytes / 1024 ** index
  const text =
    index === 0
      ? `${bytes}`
      : value >= 100
        ? value.toFixed(0)
        : value >= 10
          ? value.toFixed(1)
          : value.toFixed(2)
  return `${text} ${units[index]}`
}

function decodeText(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes)
}

function iconEl(svg: string, size = 15, color?: string): HTMLSpanElement {
  const span = document.createElement('span')
  span.className = 'pf-icon'
  span.style.cssText =
    `display:inline-flex;width:${size}px;height:${size}px;flex:0 0 ${size}px;` +
    `margin-right:8px;color:${color ?? 'inherit'};`
  span.innerHTML = svg
  return span
}

function iconButton(icon: string, label: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'pf-ibtn'
  button.title = label
  button.setAttribute('aria-label', label)
  button.appendChild(iconEl(icon, 15))
  button.addEventListener('click', onClick)
  return button
}

interface ArchiveAttachment {
  destroy(): void
}

export class ArchiveRenderer implements Renderer {
  readonly name = 'archive'
  readonly supportedTypes = ['application/x-archive']

  private readonly attachments = createRenderState<ArchiveAttachment>()

  canRender(type: string): boolean {
    return type === 'application/x-archive'
  }

  async render(
    container: HTMLElement,
    result: PreviewResult,
    options?: PreviewOptions,
    context?: RenderContext
  ): Promise<PreviewAdapter> {
    if (!isArchiveResultData(result.data)) {
      throw new Error('The preview result has no archive data.')
    }
    if (!context) {
      throw new Error('The archive previewer requires the render context.')
    }

    const format: ArchiveFormat = resolveArchiveFormat(result.data.name) ?? (result.data.format as ArchiveFormat)
    const archiveName = result.data.name
    const provider: ArchiveProvider = createArchiveProvider(result.data.bytes, format, result.data.name)

    ensureStyles()

    const root = document.createElement('div')
    root.className = 'pf-archive'
    root.style.cssText = 'position:absolute;inset:0;overflow:hidden;background:var(--pf-surface, #ffffff);'

    const arc = document.createElement('div')
    arc.className = 'pf-arc'
    root.appendChild(arc)

    /* ---- Left pane: archive tree (all archive chrome lives here) ---- */
    const tree = document.createElement('div')
    tree.className = 'pf-arc-tree'
    arc.appendChild(tree)

    const treeHead = document.createElement('div')
    treeHead.className = 'pf-arc-tree__head'
    tree.appendChild(treeHead)

    const navGroup = document.createElement('div')
    navGroup.className = 'pf-arc-nav'
    treeHead.appendChild(navGroup)

    const backBtn = iconButton(LUCIDE['chevron-left'], 'Previous location', () => fromHistory(-1))
    const forwardBtn = iconButton(LUCIDE['chevron-right'], 'Next location', () => fromHistory(1))
    const upBtn = iconButton(LUCIDE['arrow-up'], 'Up one level', () => void up())
    const rootBtn = iconButton(LUCIDE['file-stack'], 'Show archive contents', () => nav(''))
    navGroup.append(backBtn, forwardBtn, upBtn, rootBtn)

    const breadcrumbs = document.createElement('div')
    breadcrumbs.className = 'pf-arc-crumbs'
    treeHead.appendChild(breadcrumbs)

    const formatBadge = document.createElement('span')
    formatBadge.className = 'pf-arc-badge'
    formatBadge.textContent = archiveFormatLabel(format)
    treeHead.appendChild(formatBadge)

    const listScroll = document.createElement('div')
    listScroll.className = 'pf-arc-tree__list'
    tree.appendChild(listScroll)

    const listBody = document.createElement('div')
    listBody.className = 'pf-arc-trunk'
    listBody.setAttribute('role', 'tree')
    listScroll.appendChild(listBody)

    const treeFoot = document.createElement('div')
    treeFoot.className = 'pf-arc-tree__foot'
    tree.appendChild(treeFoot)
    const footTotal = document.createElement('span')
    treeFoot.appendChild(footTotal)
    const footHint = document.createElement('span')
    footHint.textContent = archiveName
    footHint.title = archiveName
    treeFoot.appendChild(footHint)

    /* ---- Right pane: nested preview (or empty-state) stays inside this pane ---- */
    const pane = document.createElement('div')
    pane.className = 'pf-arc-pane'
    arc.appendChild(pane)

    const mobileBar = document.createElement('div')
    mobileBar.className = 'pf-arc-mobilebar'
    pane.appendChild(mobileBar)
    const drawerToggle = document.createElement('button')
    drawerToggle.type = 'button'
    drawerToggle.className = 'pf-ibtn'
    drawerToggle.title = 'Show file list'
    drawerToggle.setAttribute('aria-label', 'Show file list')
    drawerToggle.setAttribute('aria-expanded', 'false')
    drawerToggle.appendChild(iconEl(LUCIDE['panel-left'], 15))
    drawerToggle.addEventListener('click', () => setDrawer(!isDrawerOpen))
    mobileBar.appendChild(drawerToggle)
    const mobileTitle = document.createElement('span')
    mobileTitle.className = 'pf-arc-mobilebar__title'
    mobileTitle.textContent = archiveName
    mobileTitle.title = archiveName
    mobileBar.appendChild(mobileTitle)

    const canvas = document.createElement('div')
    canvas.className = 'pf-arc-canvas'
    pane.appendChild(canvas)

    const previewHost = document.createElement('div')
    previewHost.className = 'pf-arc-host'
    canvas.appendChild(previewHost)

    const placeholder = document.createElement('div')
    placeholder.className = 'pf-arc-placeholder'
    const placeholderIcon = document.createElement('span')
    placeholderIcon.className = 'pf-icon'
    placeholderIcon.style.cssText = 'display:inline-flex;width:40px;height:40px;color:var(--ink-faint);'
    placeholderIcon.innerHTML = LUCIDE['file-stack']
    placeholder.appendChild(placeholderIcon)
    const placeholderText = document.createElement('div')
    placeholderText.textContent = 'Select a file to preview its contents.'
    placeholder.append(placeholderIcon, placeholderText)
    canvas.appendChild(placeholder)

    /* ---- Password unlock view, shown over both panes until a valid password
       opens the archive. No listing/crumbs are usable while it is visible. ---- */
    const lockView = document.createElement('div')
    lockView.className = 'pf-arc-lock'
    lockView.style.display = 'none'
    root.appendChild(lockView)

    const lockCard = document.createElement('div')
    lockCard.className = 'pf-arc-lockcard'
    lockView.appendChild(lockCard)

    const lockTitle = document.createElement('div')
    lockTitle.className = 'pf-arc-locktitle'
    lockTitle.appendChild(iconEl(LUCIDE['lock'], 15, 'var(--folder)'))
    const lockTitleText = document.createElement('span')
    lockTitleText.textContent = 'Password-protected archive'
    lockTitle.appendChild(lockTitleText)
    lockCard.appendChild(lockTitle)

    const lockHint = document.createElement('p')
    lockHint.className = 'pf-arc-lockhint'
    lockCard.appendChild(lockHint)

    const lockRow = document.createElement('div')
    lockRow.className = 'pf-arc-lockrow'
    const lockInput = document.createElement('input')
    lockInput.type = 'password'
    lockInput.placeholder = 'Enter password'
    lockInput.className = 'pf-input'
    lockInput.setAttribute('aria-label', 'Archive password')
    const unlockBtn = document.createElement('button')
    unlockBtn.type = 'button'
    unlockBtn.textContent = 'Open Archive'
    unlockBtn.className = 'pf-action'
    unlockBtn.addEventListener('click', () => void submitUnlock())
    lockInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') void submitUnlock()
    })
    const cancelBtn = document.createElement('button')
    cancelBtn.type = 'button'
    cancelBtn.textContent = 'Cancel'
    cancelBtn.className = 'pf-btn'
    lockRow.append(lockInput, unlockBtn, cancelBtn)
    lockCard.appendChild(lockRow)

    const lockMessage = document.createElement('div')
    lockMessage.className = 'pf-arc-lockmsg'
    lockCard.appendChild(lockMessage)

    container.appendChild(root)

    /* ---- State ---- */
    let archiveEntries: ArchiveEntry[] = []
    let browseDir = ''
    let currentPath = ''
    let selectedPath = ''
    let history: string[] = ['']
    let historyIndex = 0
    let session = 0
    let frame = 0
    let pendingOpenEntry: ArchiveEntry | undefined
    let lockMode: 'browser' | 'locked' = 'browser'
    let isDrawerOpen = false

    const mobileQuery =
      typeof window !== 'undefined' && 'matchMedia' in window ? window.matchMedia('(max-width: 767px)') : undefined
    const isMobile = (): boolean => Boolean(mobileQuery && mobileQuery.matches)

    const entryFor = (path: string): ArchiveEntry | undefined =>
      archiveEntries.find((entry) => entry.path === path)

    const childrenOf = (dirPath: string): ArchiveEntry[] => {
      const prefix = dirPath ? `${dirPath}/` : ''
      return archiveEntries.filter(
        (entry) => entry.path.startsWith(prefix) && !entry.path.slice(prefix.length).includes('/')
      )
    }

    const parentOf = (path: string): string => {
      const index = path.lastIndexOf('/')
      return index === -1 ? '' : path.slice(0, index)
    }

    const compareEntries = (a: ArchiveEntry, b: ArchiveEntry): number => {
      const aDir = a.kind === 'directory' ? 0 : 1
      const bDir = b.kind === 'directory' ? 0 : 1
      if (aDir !== bDir) return aDir - bDir
      return a.name.localeCompare(b.name)
    }

    /* ---- History / navigation ---- */
    const updateNavState = (): void => {
      backBtn.disabled = historyIndex <= 0
      forwardBtn.disabled = historyIndex >= history.length - 1
      upBtn.disabled = currentPath === ''
      rootBtn.disabled = currentPath === ''
    }

    const nav = (path: string): void => {
      if (lockMode !== 'browser') return
      if (path === history[historyIndex]) {
        applyPath(path)
        return
      }
      if (isMobile()) setDrawer(false)
      history = history.slice(0, historyIndex + 1)
      history.push(path)
      historyIndex += 1
      applyPath(path)
    }

    const up = (): void => {
      if (lockMode !== 'browser') return
      nav(parentOf(currentPath))
    }

    const fromHistory = (step: number): void => {
      if (lockMode !== 'browser') return
      const next = historyIndex + step
      if (next < 0 || next >= history.length) return
      if (isMobile()) setDrawer(false)
      historyIndex = next
      applyPath(history[next] ?? '')
    }

    const applyPath = (path: string): void => {
      if (lockMode !== 'browser') return
      currentPath = path
      session += 1
      updateNavState()
      const entry = entryFor(path)
      if (entry && entry.kind !== 'directory') {
        selectedPath = path
        browseDir = parentOf(path)
        renderBreadcrumbs(path)
        renderDir(browseDir)
        void loadEntry(entry)
      } else {
        selectedPath = path
        browseDir = path
        exitFileView()
        renderBreadcrumbs(path)
        renderDir(path)
      }
    }

    const setDrawer = (open: boolean): void => {
      isDrawerOpen = open
      tree.classList.toggle('pf-arc-tree--open', open)
      drawerToggle.setAttribute('aria-expanded', String(open))
    }

    /* ---- Directory listing ---- */
    const cancelFrame = (): void => {
      if (frame) {
        window.cancelAnimationFrame(frame)
        frame = 0
      }
    }

    const renderEmptyList = (message: string): void => {
      cancelFrame()
      listBody.replaceChildren()
      listBody.style.height = 'auto'
      const empty = document.createElement('div')
      empty.className = 'pf-arc-empty'
      empty.textContent = message
      listBody.appendChild(empty)
    }

    const renderDir = (dirPath: string): void => {
      const children = childrenOf(dirPath)
      children.sort(compareEntries)
      renderTreeFoot(children)

      if (archiveEntries.length === 0) {
        renderEmptyList('This archive is empty.')
        return
      }
      if (children.length === 0) {
        renderEmptyList('This folder is empty.')
        return
      }

      cancelFrame()
      listBody.style.height = `${children.length * ROW_HEIGHT}px`

      const paint = (): void => {
        listBody.replaceChildren()
        const top = listScroll.scrollTop
        const height = listScroll.clientHeight
        const first = Math.max(0, Math.floor(top / ROW_HEIGHT) - 4)
        const last = Math.min(children.length, Math.ceil((top + height) / ROW_HEIGHT) + 4)
        for (let index = first; index < last; index += 1) {
          const entry = children[index]
          if (entry) listBody.appendChild(makeRow(entry, index))
        }
      }

      const schedule = (): void => {
        if (frame) return
        frame = window.requestAnimationFrame(() => {
          frame = 0
          paint()
        })
      }

      listScroll.onscroll = schedule
      paint()
      scrollSelectedIntoView(children)
    }

    const renderTreeFoot = (children: ArchiveEntry[]): void => {
      const folders = children.filter((entry) => entry.kind === 'directory').length
      const files = children.length - folders
      footTotal.textContent =
        children.length === 0 ? 'Empty' : `${folders} ${folders === 1 ? 'folder' : 'folders'} · ${files} ${files === 1 ? 'file' : 'files'}`
    }

    const scrollSelectedIntoView = (children: ArchiveEntry[]): void => {
      const index = children.findIndex((entry) => entry.path === selectedPath)
      if (index < 0) return
      const top = index * ROW_HEIGHT
      const bottom = top + ROW_HEIGHT
      if (top < listScroll.scrollTop) {
        listScroll.scrollTop = top
      } else if (bottom > listScroll.scrollTop + listScroll.clientHeight) {
        listScroll.scrollTop = bottom - listScroll.clientHeight
      }
    }

    const makeRow = (entry: ArchiveEntry, index: number): HTMLElement => {
      const row = document.createElement('div')
      row.className = 'pf-arc-row'
      row.style.top = `${index * ROW_HEIGHT}px`
      row.style.fontSize = '13px'
      row.setAttribute('role', 'treeitem')
      row.tabIndex = 0

      const isDir = entry.kind === 'directory'
      const isCurrentDir = isDir && entry.path === currentPath
      const isSelected = entry.path === selectedPath
      if (isSelected) {
        row.classList.add('pf-arc-row--cur')
        row.setAttribute('aria-current', 'true')
      }
      row.setAttribute('aria-selected', String(isSelected))

      const icon = isDir ? (isCurrentDir ? LUCIDE['folder-open'] : LUCIDE['folder']) : LUCIDE['file']
      const color = isDir ? 'var(--folder)' : entry.kind === 'file' ? 'var(--file)' : 'var(--ink-faint)'
      row.appendChild(iconEl(icon, 15, color))

      const name = document.createElement('div')
      name.className = 'pf-arc-row__name'
      name.textContent = entry.kind === 'symlink' || entry.kind === 'hardlink' ? `${entry.name} →` : entry.name
      name.title = entry.path
      row.appendChild(name)

      if (!isDir) {
        const size = document.createElement('div')
        size.className = 'pf-arc-row__size'
        size.textContent = formatSize(entry.size)
        row.appendChild(size)
      }

      if (entry.kind === 'file') {
        const download = iconButton(LUCIDE['download'], `Download ${entry.name}`, () => {
          void downloadEntry(entry)
        })
        download.addEventListener('click', (event) => event.stopPropagation())
        row.appendChild(download)
      }

      const open = (): void => {
        nav(entry.path)
        row.blur()
      }
      row.addEventListener('click', open)
      row.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          open()
        }
      })

      return row
    }

    /* ---- Files inside the archive ---- */
    const makeNestedFile = (entry: ArchiveEntry, bytes: Uint8Array): SourceInput => {
      const type = mimeFromExtension(extensionFrom(entry.name)) ?? 'application/octet-stream'
      if (typeof File !== 'undefined') {
        return new File([bytes as BlobPart], entry.name, { type })
      }
      return new Blob([bytes as BlobPart], { type })
    }

    const enterNestedView = (entry: ArchiveEntry, bytes: Uint8Array): void => {
      session += 1
      context.clearPreview(previewHost)
      previewHost.replaceChildren()
      previewHost.style.display = 'flex'
      placeholder.style.display = 'none'

      const file = makeNestedFile(entry, bytes)
      const mySession = session
      context.previewSource(file, previewHost, options).catch((error) => {
        if (session !== mySession) return
        showNote(`Could not preview "${entry.name}": ${(error as Error).message}`)
      })
    }

    const showNote = (text: string): void => {
      session += 1
      context.clearPreview(previewHost)
      previewHost.replaceChildren()
      previewHost.style.display = 'flex'
      placeholder.style.display = 'none'

      const note = document.createElement('div')
      note.className = 'pf-arc-note'
      note.textContent = text
      previewHost.appendChild(note)
    }

    const exitFileView = (): void => {
      session += 1
      context.clearPreview(previewHost)
      previewHost.style.display = 'none'
      placeholder.style.display = 'flex'
    }

    const loadEntry = async (entry: ArchiveEntry): Promise<void> => {
      const mySession = session
      let bytes: Uint8Array
      try {
        bytes = await provider.read(entry.path)
      } catch (error) {
        if (error instanceof ArchivePasswordError) {
          pendingOpenEntry = entry
          showLockedView(`Enter the password to view "${entry.name}".`)
          return
        }
        if (session !== mySession) return
        showNote(`Could not read "${entry.name}": ${(error as Error).message}`)
        return
      }
      if (session !== mySession) return

      if (entry.kind === 'symlink') {
        const target = bytes.length > 0 ? decodeText(bytes).trim() : (entry.linkPath ?? '')
        showNote(`"${entry.name}" is a symbolic link to:\n${target || '(unknown target)'}`)
        return
      }
      if (entry.kind === 'hardlink') {
        showNote(`"${entry.name}" is a hard link to:\n${entry.linkPath ?? '(unknown target)'}`)
        return
      }

      enterNestedView(entry, bytes)
    }

    const downloadEntry = async (entry: ArchiveEntry): Promise<void> => {
      try {
        const bytes = await provider.read(entry.path)
        const type = mimeFromExtension(extensionFrom(entry.name)) ?? 'application/octet-stream'
        downloadBlob(entry.name, new Blob([bytes as BlobPart], { type }))
      } catch (error) {
        if (error instanceof ArchivePasswordError) {
          pendingOpenEntry = entry
          showLockedView(`Enter the password to download "${entry.name}".`)
          return
        }
        console.error('[preview-file] archive download failed', error)
      }
    }

    /* ---- Breadcrumbs ---- */
    const crumbButton = (label: string, target: string | null, title: string): HTMLElement => {
      if (target === null) {
        const span = document.createElement('span')
        span.textContent = label
        span.title = title
        span.style.cssText =
          'flex:0 1 auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--ink-soft);'
        return span
      }
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'pf-arc-abl'
      button.textContent = label
      button.title = title
      button.addEventListener('click', () => nav(target))
      return button
    }

    const crumbSeparator = (): HTMLElement => {
      const sep = document.createElement('span')
      sep.textContent = '›'
      sep.style.cssText = 'flex:0 0 auto;color:var(--ink-faint);font-size:14px;padding:0 1px;'
      return sep
    }

    const renderBreadcrumbs = (path: string): void => {
      breadcrumbs.replaceChildren()
      breadcrumbs.appendChild(crumbButton(archiveName, '', archiveName))

      const segments = path.split('/').filter(Boolean)
      let acc = ''
      segments.forEach((segment, index) => {
        acc = acc ? `${acc}/${segment}` : segment
        const isLast = index === segments.length - 1
        breadcrumbs.appendChild(crumbSeparator())
        if (isLast) {
          breadcrumbs.appendChild(crumbButton(segment, null, acc))
        } else {
          breadcrumbs.appendChild(crumbButton(segment, acc, acc))
        }
      })
    }

    /* ---- Password unlock ---- */
    /* While locked the explorer shows only the prompt card: no crumbs, sizes
       or rows are offered, and navigation is inert. `requiresPassword` is
       called during boot, so an encrypted archive never lists first. */
    const setTreeChrome = (enabled: boolean): void => {
      breadcrumbs.style.display = enabled ? '' : 'none'
      formatBadge.style.display = enabled ? '' : 'none'
      mobileBar.style.display = enabled ? '' : 'none'
      backBtn.disabled = enabled ? historyIndex <= 0 : true
      forwardBtn.disabled = enabled ? historyIndex >= history.length - 1 : true
      upBtn.disabled = !enabled
      rootBtn.disabled = !enabled
    }

    const showLockedView = (message: string): void => {
      lockMode = 'locked'
      session += 1
      context.clearPreview(previewHost)
      previewHost.style.display = 'none'
      placeholder.style.display = 'flex'
      lockView.replaceChildren()
      lockView.appendChild(lockCard)
      lockHint.textContent = message
      lockInput.value = ''
      unlockBtn.disabled = false
      unlockBtn.textContent = 'Open Archive'
      cancelBtn.style.display = ''
      lockMessage.textContent = ''
      lockView.style.display = 'flex'
      setTreeChrome(false)
      lockInput.focus()
    }

    const closeLockedView = async (): Promise<void> => {
      try {
        archiveEntries = await provider.list()
      } catch (error) {
        if (error instanceof ArchivePasswordError) {
          showLockedView('Enter the password to view the archive contents.')
          return
        }
        showLockedView(`Could not open archive: ${(error as Error).message}`)
        return
      }
      lockView.style.display = 'none'
      setTreeChrome(true)
      lockMode = 'browser'
      updateNavState()
      renderBreadcrumbs(currentPath)
      renderDir(browseDir)
    }

    const cancelUnlock = (): void => {
      lockInput.value = ''
      unlockBtn.textContent = 'Try Again'
      cancelBtn.style.display = 'none'
      lockMessage.textContent = ''
      lockHint.textContent = 'Archive remains locked. A password is required to view its contents.'
      lockInput.blur()
    }
    cancelBtn.addEventListener('click', cancelUnlock)

    const submitUnlock = async (): Promise<void> => {
      const password = lockInput.value
      if (!password) {
        lockMessage.textContent = 'Please enter a password.'
        return
      }
      unlockBtn.disabled = true
      const mySession = session
      try {
        const accepted = await provider.unlock(password)
        if (session !== mySession) return
        if (accepted) {
          lockMessage.textContent = ''
          const target = pendingOpenEntry
          pendingOpenEntry = undefined
          await closeLockedView()
          if (target) {
            void loadEntry(target)
          }
        } else {
          unlockBtn.textContent = 'Try Again'
          lockMessage.textContent = 'Incorrect password. Try again.'
          lockInput.select()
        }
      } finally {
        if (session === mySession) unlockBtn.disabled = false
      }
    }

    /* ---- Boot ---- */
    const initialSession = session
    try {
      /* Detection may enumerate internally but never renders: an encrypted
         archive stops here and shows only the password prompt. */
      const requiresPassword = await provider.requiresPassword()
      if (session !== initialSession) return {}
      if (requiresPassword) {
        updateNavState()
        showLockedView(`Enter the password to browse "${archiveName}".`)
        this.attachments.set(container, {
          destroy: () => {
            session += 1
            cancelFrame()
            context.clearPreview(previewHost)
            provider.dispose()
          },
        })
        return {}
      }
      archiveEntries = await provider.list()
    } catch (error) {
      root.remove()
      provider.dispose()
      throw error instanceof Error ? error : new Error(String(error))
    }
    if (session !== initialSession) return {}

    updateNavState()
    setTreeChrome(true)
    renderBreadcrumbs('')
    renderDir('')

    this.attachments.set(container, {
      destroy: () => {
        session += 1
        cancelFrame()
        context.clearPreview(previewHost)
        provider.dispose()
      },
    })

    return {}
  }

  destroy(container: HTMLElement): void {
    this.attachments.destroyFor(container)
  }
}