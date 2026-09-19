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

const ROW_HEIGHT = 30
const STYLE_ID = 'pf-archive-styles'

/* Scoped visual language matched to the rest of the library: GitHub-flavored
   grays, Lucide inline icons, system UI type. The class is namespaced so the
   styles can never leak out of the preview stage. */
const ARCHIVE_CSS = `
.pf-archive {
  --ink: #1f2328;
  --ink-soft: #57606a;
  --ink-faint: #8b949e;
  --line: #d0d7de;
  --bar: #f6f8fa;
  --accent: #0969da;
  --error: #cf222e;
  --folder: #9a6700;
  --file: #59636e;
  box-sizing: border-box;
  color: var(--ink);
  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  font-size: 13px;
}
.pf-archive *, .pf-archive *::before, .pf-archive *::after { box-sizing: border-box; }
.pf-archive .pf-icon svg { width: 100%; height: 100%; display: block; }
.pf-archive button.pf-ibtn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: var(--ink-soft);
  font: inherit;
  cursor: pointer;
  flex: 0 0 26px;
}
.pf-archive button.pf-ibtn:hover { background: #eaeef2; color: var(--ink); }
.pf-archive button.pf-ibtn:disabled { opacity: 0.35; cursor: default; pointer-events: none; }
.pf-archive button.pf-ibtn:focus-visible,
.pf-archive .pf-abl:focus-visible,
.pf-archive input.pf-input:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -1px;
}
.pf-archive button.pf-action {
  height: 28px;
  padding: 0 14px;
  border: 1px solid #1f883d;
  border-radius: 4px;
  background: #1f883d;
  color: #ffffff;
  font-weight: 600;
  font: inherit;
  cursor: pointer;
}
.pf-archive button.pf-action:disabled { opacity: 0.7; cursor: default; }
.pf-archive .pf-row {
  display: flex;
  align-items: center;
  position: absolute;
  left: 0;
  right: 0;
  height: 30px;
  cursor: pointer;
  color: var(--ink);
  border-bottom: 1px solid #eaeef2;
}
.pf-archive .pf-row:hover { background: var(--bar); }
.pf-archive .pf-row .pf-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pf-archive .pf-abl {
  border: none;
  background: transparent;
  padding: 2px 3px;
  border-radius: 4px;
  font: inherit;
  color: var(--accent);
  cursor: pointer;
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pf-archive .pf-abl:hover { text-decoration: underline; }
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
    root.style.cssText =
      'position:absolute;inset:0;display:flex;flex-direction:column;overflow:hidden;background:#ffffff;'

    /* ---- Top bar: navigation, breadcrumbs, search ---- */
    const topbar = document.createElement('div')
    topbar.style.cssText =
      `flex:0 0 auto;display:flex;align-items:center;gap:6px;padding:5px 8px;` +
      `border-bottom:1px solid var(--line);background:var(--bar);min-width:0;`
    root.appendChild(topbar)

    const navGroup = document.createElement('div')
    navGroup.style.cssText = 'display:flex;align-items:center;gap:2px;flex:0 0 auto;'
    topbar.appendChild(navGroup)

    const backBtn = iconButton(LUCIDE['chevron-left'], 'Previous', () => fromHistory(-1))
    const forwardBtn = iconButton(LUCIDE['chevron-right'], 'Next', () => fromHistory(1))
    const rootBtn = iconButton(LUCIDE['file-stack'], 'Show archive contents', () => nav(''))
    navGroup.append(backBtn, forwardBtn, rootBtn)

    const breadcrumbs = document.createElement('div')
    breadcrumbs.style.cssText =
      'display:flex;align-items:center;gap:2px;flex:1 1 auto;min-width:40px;overflow:hidden;'
    topbar.appendChild(breadcrumbs)

    const formatBadge = document.createElement('span')
    formatBadge.textContent = archiveFormatLabel(format)
    formatBadge.style.cssText =
      `flex:0 0 auto;font-size:11px;font-weight:600;letter-spacing:.05em;color:var(--ink-soft);` +
      `border:1px solid var(--line);border-radius:10px;padding:1px 8px;background:#ffffff;`
    topbar.appendChild(formatBadge)

    const searchInput = document.createElement('input')
    searchInput.type = 'search'
    searchInput.placeholder = 'Filter files…'
    searchInput.className = 'pf-input'
    searchInput.setAttribute('aria-label', 'Filter files')
    searchInput.style.cssText =
      `width:150px;max-width:30vw;height:26px;padding:0 8px;border:1px solid var(--line);` +
      `border-radius:4px;font:inherit;color:var(--ink);background:#ffffff;display:none;min-width:0;`
    const searchToggle = iconButton(LUCIDE['search'], 'Search files', () => {
      const hidden = searchInput.style.display === 'none'
      searchInput.style.display = hidden ? '' : 'none'
      if (hidden) {
        searchInput.focus()
        searchInput.select()
      } else {
        searchInput.value = ''
        searchQuery = ''
        renderDir(currentPath)
      }
    })
    searchInput.addEventListener('input', () => {
      searchQuery = searchInput.value
      renderDir(currentPath)
    })
    topbar.appendChild(searchToggle)
    topbar.appendChild(searchInput)

    /* ---- Body: list panel or nested preview ---- */
    const body = document.createElement('div')
    body.style.cssText = 'position:relative;flex:1 1 auto;min-height:0;'
    root.appendChild(body)

    const listPanel = document.createElement('div')
    listPanel.style.cssText =
      'position:absolute;inset:0;display:flex;flex-direction:column;overflow:hidden;background:#ffffff;'
    body.appendChild(listPanel)

    /* Password unlock strip, shown atop the list for encrypted archives. */
    const unlockStrip = document.createElement('div')
    unlockStrip.style.cssText =
      `flex:0 0 auto;display:none;flex-direction:column;gap:6px;padding:10px 12px;` +
      `border-bottom:1px solid var(--line);background:#fff8c5;`
    listPanel.appendChild(unlockStrip)

    const unlockTitle = document.createElement('div')
    unlockTitle.style.cssText = 'display:flex;align-items:center;gap:6px;font-weight:600;'
    unlockTitle.appendChild(iconEl(LUCIDE['file-stack'], 14, 'var(--folder)'))
    const unlockTitleText = document.createElement('span')
    unlockTitleText.textContent = 'Password-protected archive'
    unlockTitle.appendChild(unlockTitleText)
    unlockStrip.appendChild(unlockTitle)

    const unlockRow = document.createElement('div')
    unlockRow.style.cssText = 'display:flex;align-items:center;gap:6px;width:100%;max-width:420px;'
    const unlockInput = document.createElement('input')
    unlockInput.type = 'password'
    unlockInput.placeholder = 'Enter password'
    unlockInput.className = 'pf-input'
    unlockInput.setAttribute('aria-label', 'Archive password')
    unlockInput.style.cssText =
      `flex:1 1 auto;min-width:0;height:28px;padding:0 8px;border:1px solid var(--line);` +
      `border-radius:4px;font:inherit;color:var(--ink);background:#ffffff;`
    const unlockBtn = document.createElement('button')
    unlockBtn.type = 'button'
    unlockBtn.textContent = 'Unlock'
    unlockBtn.className = 'pf-action'
    unlockBtn.addEventListener('click', () => void submitUnlock())
    unlockInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') void submitUnlock()
    })
    unlockRow.append(unlockInput, unlockBtn)
    unlockStrip.appendChild(unlockRow)

    const unlockMessage = document.createElement('div')
    unlockMessage.style.cssText = 'color:var(--error);font-size:12px;min-height:16px;'
    unlockStrip.appendChild(unlockMessage)

    const listScroll = document.createElement('div')
    listScroll.style.cssText = 'position:relative;flex:1 1 auto;overflow:auto;background:#ffffff;'
    listPanel.appendChild(listScroll)

    const listBody = document.createElement('div')
    listBody.style.cssText = 'position:relative;width:100%;'
    listScroll.appendChild(listBody)

    const previewHost = document.createElement('div')
    previewHost.style.cssText = 'position:absolute;inset:0;display:none;overflow:hidden;background:#ffffff;'
    body.appendChild(previewHost)

    container.appendChild(root)

    /* ---- State ---- */
    let archiveEntries: ArchiveEntry[] = []
    let currentPath = ''
    let history: string[] = ['']
    let historyIndex = 0
    let searchQuery = ''
    let session = 0
    let frame = 0
    let pendingOpenEntry: ArchiveEntry | undefined

    const entryFor = (path: string): ArchiveEntry | undefined =>
      archiveEntries.find((entry) => entry.path === path)

    const childrenOf = (dirPath: string): ArchiveEntry[] => {
      const prefix = dirPath ? `${dirPath}/` : ''
      return archiveEntries.filter(
        (entry) => entry.path.startsWith(prefix) && !entry.path.slice(prefix.length).includes('/')
      )
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
    }

    const nav = (path: string): void => {
      if (path === history[historyIndex]) {
        applyPath(path)
        return
      }
      history = history.slice(0, historyIndex + 1)
      history.push(path)
      historyIndex += 1
      applyPath(path)
    }

    const fromHistory = (step: number): void => {
      const next = historyIndex + step
      if (next < 0 || next >= history.length) return
      historyIndex = next
      applyPath(history[next] ?? '')
    }

    const applyPath = (path: string): void => {
      currentPath = path
      session += 1
      updateNavState()
      const entry = entryFor(path)
      if (entry && entry.kind !== 'directory') {
        void loadEntry(entry)
      } else {
        exitFileView()
        renderBreadcrumbs(path)
        renderDir(path)
      }
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
      empty.textContent = message
      empty.style.cssText = 'padding:28px;color:var(--ink-soft);text-align:center;'
      listBody.appendChild(empty)
    }

    const renderDir = (dirPath: string): void => {
      const query = searchQuery.trim().toLowerCase()
      let children = childrenOf(dirPath)
      if (query) children = children.filter((entry) => entry.name.toLowerCase().includes(query))
      children.sort(compareEntries)

      const parentHasChildren = archiveEntries.length > 0
      if (!parentHasChildren) {
        renderEmptyList('This archive is empty.')
        return
      }
      if (children.length === 0) {
        renderEmptyList(query ? 'No matching files.' : 'This folder is empty.')
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
    }

    const makeRow = (entry: ArchiveEntry, index: number): HTMLElement => {
      const row = document.createElement('div')
      row.className = 'pf-row'
      row.style.top = `${index * ROW_HEIGHT}px`
      row.style.fontSize = '13px'

      const isDir = entry.kind === 'directory'
      const icon = isDir ? LUCIDE['folder'] : LUCIDE['file']
      const color = isDir ? 'var(--folder)' : entry.kind === 'file' ? 'var(--file)' : 'var(--ink-faint)'
      row.appendChild(iconEl(icon, 15, color))

      const name = document.createElement('div')
      name.className = 'pf-name'
      name.style.cssText = 'flex:1 1 auto;min-width:0;padding-right:8px;'
      name.textContent = entry.kind === 'symlink' || entry.kind === 'hardlink' ? `${entry.name} →` : entry.name
      name.title = entry.path
      row.appendChild(name)

      const size = document.createElement('div')
      size.style.cssText = 'flex:0 0 auto;color:var(--ink-soft);font-size:12px;padding-right:4px;'
      size.textContent = isDir ? '' : formatSize(entry.size)
      row.appendChild(size)

      if (entry.kind === 'file') {
        const download = iconButton(LUCIDE['download'], `Download ${entry.name}`, () => {
          void downloadEntry(entry)
        })
        download.style.marginLeft = '4px'
        download.addEventListener('click', (event) => event.stopPropagation())
        row.appendChild(download)
      }

      row.addEventListener('click', () => nav(entry.path))

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
      listPanel.style.display = 'none'
      renderBreadcrumbs(entry.path)

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
      listPanel.style.display = 'none'
      renderBreadcrumbs(currentPath)

      const note = document.createElement('div')
      note.style.cssText =
        `margin:auto;max-width:520px;padding:16px 20px;color:var(--ink-soft);` +
        `font-size:13px;line-height:1.5;text-align:center;white-space:pre-line;word-wrap:break-word;`
      note.textContent = text
      previewHost.appendChild(note)
    }

    const exitFileView = (): void => {
      session += 1
      context.clearPreview(previewHost)
      previewHost.style.display = 'none'
      listPanel.style.display = 'flex'
    }

    const loadEntry = async (entry: ArchiveEntry): Promise<void> => {
      const mySession = session
      let bytes: Uint8Array
      try {
        bytes = await provider.read(entry.path)
      } catch (error) {
        if (error instanceof ArchivePasswordError) {
          pendingOpenEntry = entry
          revealUnlockStrip(`Enter the password to view "${entry.name}".`)
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
          revealUnlockStrip(`Enter the password to download "${entry.name}".`)
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
      button.className = 'pf-abl'
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
    const revealUnlockStrip = (message: string): void => {
      unlockStrip.style.display = 'flex'
      unlockMessage.textContent = message
      unlockInput.focus()
    }

    const submitUnlock = async (): Promise<void> => {
      const password = unlockInput.value
      if (!password) {
        unlockMessage.textContent = 'Please enter a password.'
        return
      }
      unlockBtn.disabled = true
      try {
        const accepted = await provider.unlock(password)
        if (accepted) {
          unlockStrip.style.display = 'none'
          unlockMessage.textContent = ''
          unlockInput.value = ''
          const target = pendingOpenEntry
          pendingOpenEntry = undefined
          if (target) void loadEntry(target)
        } else {
          unlockMessage.textContent = 'Incorrect password. Try again.'
          unlockInput.select()
        }
      } finally {
        unlockBtn.disabled = false
      }
    }

    /* ---- Boot ---- */
    const initialSession = session
    try {
      archiveEntries = await provider.list()
    } catch (error) {
      root.remove()
      provider.dispose()
      throw error instanceof Error ? error : new Error(String(error))
    }
    if (session !== initialSession) return {}

    updateNavState()
    renderBreadcrumbs('')
    renderDir('')

    if (provider.encrypted && provider.isLocked()) {
      revealUnlockStrip('This archive is password-protected.')
    }

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