import type { PreviewAdapter } from '../controls/types.js'
import type { PreviewResult } from '../types.js'
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
import type { Renderer } from './types.js'
import { ensureArchiveStyles } from './archive-styles.js'
import { ROW_HEIGHT, formatSize, iconEl, iconButton } from './archive-ui.js'

/*
 * Archive Structure Explorer.
 *
 * The archive is an explorer, not a viewer: it browses folders and files,
 * supports nested folders, shows breadcrumbs and lets you select files — but a
 * file click never launches a nested preview. All archive chrome (history
 * navigation, breadcrumbs, format badge, virtualized listing, footer counts)
 * lives in a single normal-flow pane, so there is no second pane whose
 * controllers could overlap the tree.
 *
 * Encrypted archives boot into a Liquid Glass password modal that is the ONLY
 * thing rendered until a valid password is accepted: no filenames, folders,
 * breadcrumbs, sizes or counts are computed or shown beforehand.
 */

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

  async render(container: HTMLElement, result: PreviewResult): Promise<PreviewAdapter> {
    if (!isArchiveResultData(result.data)) {
      throw new Error('The preview result has no archive data.')
    }

    const format: ArchiveFormat = resolveArchiveFormat(result.data.name) ?? (result.data.format as ArchiveFormat)
    const archiveName = result.data.name
    const provider: ArchiveProvider = createArchiveProvider(result.data.bytes, format, result.data.name)

    ensureArchiveStyles()

    const root = document.createElement('div')
    root.className = 'pf-archive'
    root.style.cssText = 'position:absolute;inset:0;overflow:hidden;background:var(--pf-surface, #ffffff);'

    const arc = document.createElement('div')
    arc.className = 'pf-arc'
    root.appendChild(arc)

    /* ---- Explorer chrome (single pane) ---- */
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

    /* ---- Password unlock (modal over the whole explorer) ---- */
    const lockView = document.createElement('div')
    lockView.className = 'pf-arc-lock'
    lockView.style.display = 'none'
    root.appendChild(lockView)

    const lockCard = document.createElement('div')
    lockCard.className = 'pf-arc-lockcard'
    lockCard.setAttribute('role', 'dialog')
    lockCard.setAttribute('aria-modal', 'true')
    lockCard.setAttribute('aria-labelledby', 'pf-arc-locktitle')
    lockView.appendChild(lockCard)

    const lockIcon = document.createElement('div')
    lockIcon.className = 'pf-arc-lockicon'
    lockIcon.setAttribute('aria-hidden', 'true')
    lockIcon.innerHTML = LUCIDE['lock']
    lockCard.appendChild(lockIcon)

    const lockTitle = document.createElement('h2')
    lockTitle.id = 'pf-arc-locktitle'
    lockTitle.className = 'pf-arc-locktitle'
    lockTitle.textContent = 'Password-protected archive'
    lockCard.appendChild(lockTitle)

    const lockHint = document.createElement('p')
    lockHint.className = 'pf-arc-lockhint'
    lockCard.appendChild(lockHint)

    const lockField = document.createElement('div')
    lockField.className = 'pf-arc-lockfield'
    const lockInput = document.createElement('input')
    lockInput.type = 'password'
    lockInput.autocomplete = 'off'
    lockInput.placeholder = 'Enter password'
    lockInput.setAttribute('aria-label', 'Archive password')
    lockInput.setAttribute('aria-describedby', 'pf-arc-lockmsg')
    lockInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') void submitUnlock()
    })
    const eyeBtn = document.createElement('button')
    eyeBtn.type = 'button'
    eyeBtn.className = 'pf-arc-eye'
    eyeBtn.title = 'Show password'
    eyeBtn.setAttribute('aria-label', 'Show password')
    eyeBtn.setAttribute('aria-pressed', 'false')
    eyeBtn.appendChild(iconEl(LUCIDE['eye'], 15))
    eyeBtn.addEventListener('click', togglePasswordVisibility)
    lockField.append(lockInput, eyeBtn)
    lockCard.appendChild(lockField)

    const lockMessage = document.createElement('div')
    lockMessage.id = 'pf-arc-lockmsg'
    lockMessage.className = 'pf-arc-lockmsg'
    lockMessage.setAttribute('role', 'alert')
    lockCard.appendChild(lockMessage)

    const lockActions = document.createElement('div')
    lockActions.className = 'pf-arc-lockactions'
    const unlockBtn = document.createElement('button')
    unlockBtn.type = 'button'
    unlockBtn.className = 'pf-arc-primary'
    const unlockLabel = document.createElement('span')
    unlockLabel.textContent = 'Unlock'
    unlockBtn.appendChild(unlockLabel)
    unlockBtn.addEventListener('click', () => void submitUnlock())
    const cancelBtn = document.createElement('button')
    cancelBtn.type = 'button'
    cancelBtn.className = 'pf-arc-ghost'
    cancelBtn.textContent = 'Cancel'
    cancelBtn.addEventListener('click', cancelUnlock)
    lockActions.append(unlockBtn, cancelBtn)
    lockCard.appendChild(lockActions)

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
    let lockMode: 'browser' | 'locked' = 'browser'
    let unlockSpinner: HTMLElement | null = null

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

    /* ---- History / navigation (folders only; files are selected, not opened) ---- */
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
      historyIndex = next
      applyPath(history[next] ?? '')
    }

    const applyPath = (path: string): void => {
      if (lockMode !== 'browser') return
      currentPath = path
      browseDir = path
      selectedPath = path
      session += 1
      updateNavState()
      renderBreadcrumbs(path)
      renderDir(path)
    }

    /* Selecting a file never previews its contents: it only highlights the row
       in the listing of the folder that contains it. */
    const selectFile = (entry: ArchiveEntry): void => {
      if (lockMode !== 'browser') return
      selectedPath = entry.path
      renderDir(browseDir)
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

    const clearListing = (): void => {
      cancelFrame()
      listBody.replaceChildren()
      listBody.style.height = 'auto'
      footTotal.textContent = ''
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
        if (isDir) nav(entry.path)
        else selectFile(entry)
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

    const downloadEntry = async (entry: ArchiveEntry): Promise<void> => {
      try {
        const bytes = await provider.read(entry.path)
        const type = mimeFromExtension(extensionFrom(entry.name)) ?? 'application/octet-stream'
        downloadBlob(entry.name, new Blob([bytes as BlobPart], { type }))
      } catch (error) {
        if (error instanceof ArchivePasswordError) {
          showLockedView(`A password is required to download "${entry.name}".`)
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
    /* While locked the explorer shows only the modal: the listing, breadcrumbs,
       header buttons and footer counts are emptied and inert, and no metadata
       is offered until `unlock()` accepts. Detection during boot may enumerate
       internally but never renders that data for an encrypted archive. */
    const setTreeChrome = (enabled: boolean): void => {
      breadcrumbs.style.display = enabled ? '' : 'none'
      formatBadge.style.display = enabled ? '' : 'none'
      treeFoot.style.display = enabled ? '' : 'none'
      backBtn.disabled = enabled ? historyIndex <= 0 : true
      forwardBtn.disabled = enabled ? historyIndex >= history.length - 1 : true
      upBtn.disabled = !enabled
      rootBtn.disabled = !enabled
    }

    const showLockedView = (message: string): void => {
      lockMode = 'locked'
      session += 1
      clearListing()
      setTreeChrome(false)
      lockHint.textContent = message
      lockInput.value = ''
      lockField.classList.remove('pf-arc-lockfield--error')
      lockMessage.textContent = ''
      setUnlockLoading(false)
      lockView.replaceChildren()
      lockView.appendChild(lockCard)
      lockView.style.display = 'flex'
      lockInput.focus()
    }

    const closeLockedView = async (): Promise<void> => {
      try {
        archiveEntries = await provider.list()
      } catch (error) {
        if (error instanceof ArchivePasswordError) {
          showLockedView('The password was not accepted. Re-check the password and try again.')
          return
        }
        showLockedView(`Could not open archive: ${(error as Error).message}`)
        return
      }
      setTreeChrome(true)
      lockView.style.display = 'none'
      lockMode = 'browser'
      updateNavState()
      renderBreadcrumbs(currentPath)
      renderDir('')
      rootBtn.focus()
    }

    const setUnlockLoading = (loading: boolean): void => {
      if (loading) {
        unlockBtn.setAttribute('aria-busy', 'true')
        unlockBtn.disabled = true
        lockInput.disabled = true
        eyeBtn.disabled = true
        cancelBtn.disabled = true
        if (!unlockSpinner) {
          unlockSpinner = document.createElement('span')
          unlockSpinner.className = 'pf-arc-spinner'
          unlockSpinner.setAttribute('aria-hidden', 'true')
          unlockBtn.prepend(unlockSpinner)
        }
        unlockLabel.textContent = 'Unlocking…'
      } else {
        unlockBtn.removeAttribute('aria-busy')
        unlockBtn.disabled = false
        lockInput.disabled = false
        eyeBtn.disabled = false
        cancelBtn.disabled = false
        unlockSpinner?.remove()
        unlockSpinner = null
        unlockLabel.textContent = 'Unlock'
      }
    }

    function cancelUnlock(): void {
      if (lockMode !== 'locked') return
      setUnlockLoading(false)
      lockInput.value = ''
      lockField.classList.remove('pf-arc-lockfield--error')
      lockMessage.textContent = ''
      lockHint.textContent = 'This archive is locked. A password is required to view its contents.'
      unlockBtn.focus()
    }
    lockView.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        cancelUnlock()
      }
    })

    function togglePasswordVisibility(): void {
      const hidden = lockInput.type === 'password'
      lockInput.type = hidden ? 'text' : 'password'
      eyeBtn.title = hidden ? 'Hide password' : 'Show password'
      eyeBtn.setAttribute('aria-label', eyeBtn.title)
      eyeBtn.setAttribute('aria-pressed', String(hidden))
      eyeBtn.replaceChildren(iconEl(hidden ? LUCIDE['eye-off'] : LUCIDE['eye'], 15))
      lockInput.focus()
    }

    const submitUnlock = async (): Promise<void> => {
      if (lockMode !== 'locked') return
      const password = lockInput.value
      if (!password) {
        lockField.classList.add('pf-arc-lockfield--error')
        lockMessage.textContent = 'Please enter a password.'
        lockInput.focus()
        return
      }
      lockField.classList.remove('pf-arc-lockfield--error')
      lockMessage.textContent = ''
      setUnlockLoading(true)
      const mySession = session
      try {
        const accepted = await provider.unlock(password)
        if (session !== mySession) return
        if (accepted) {
          await closeLockedView()
        } else {
          lockField.classList.add('pf-arc-lockfield--error')
          lockMessage.textContent = 'Incorrect password. Try again.'
          lockInput.select()
        }
      } catch (error) {
        if (session !== mySession) return
        lockField.classList.add('pf-arc-lockfield--error')
        lockMessage.textContent = `Unlock failed: ${(error as Error).message}`
      } finally {
        if (session === mySession) {
          setUnlockLoading(false)
          if (lockMode === 'locked') lockInput.focus()
        }
      }
    }

    /* ---- Boot ---- */
    const initialSession = session
    try {
      /* Detection may enumerate internally but never renders anything for an
         encrypted archive: it stops here and shows only the password modal. */
      const requiresPassword = await provider.requiresPassword()
      if (session !== initialSession) return {}
      if (requiresPassword) {
        updateNavState()
        showLockedView(`Enter the password to browse "${archiveName}". Its contents stay hidden until it is unlocked.`)
        this.attachments.set(container, {
          destroy: () => {
            session += 1
            cancelFrame()
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
        provider.dispose()
      },
    })

    return {}
  }

  destroy(container: HTMLElement): void {
    this.attachments.destroyFor(container)
  }
}