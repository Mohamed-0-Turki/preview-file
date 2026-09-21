import { downloadBlob, mountControls } from './controls/index.js'
import type { PreviewActions, PreviewAdapter } from './controls/index.js'
import { getPreviewer } from './previewers/index.js'
import { getRenderer } from './renderers/index.js'
import { createSource } from './sources/index.js'
import type { ResolvedSource, SourceInput } from './sources/index.js'
import type { PreviewOptions, PreviewResult } from './types.js'
import { detectType, ensureThemeStyles } from './utils/index.js'

const activePreviews = new WeakMap<HTMLElement, () => void>()
const previewGeneration = new WeakMap<HTMLElement, number>()

export function clearPreview(container: HTMLElement): void {
  const generation = previewGeneration.get(container) ?? 0
  previewGeneration.set(container, generation + 1)
  const cleanup = activePreviews.get(container)
  cleanup?.()
  activePreviews.delete(container)
  container.replaceChildren()
}

function createStateElement(): HTMLElement {
  const el = document.createElement('div')
  const css = el.style
  css.display = 'flex'
  css.flexDirection = 'column'
  css.alignItems = 'center'
  css.justifyContent = 'center'
  css.gap = '8px'
  css.height = '100%'
  css.boxSizing = 'border-box'
  css.padding = '8px'
  css.fontFamily = 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
  css.fontSize = '13px'
  css.textAlign = 'center'
  css.color = 'var(--pf-ink-soft, #57606a)'
  return el
}

interface ErrorOptions {
  readonly retry?: () => void
  readonly downloadName?: string
  readonly downloadBlob?: Blob
}

function showError(container: HTMLElement, message: string, options: ErrorOptions = {}): void {
  const errorEl = createStateElement()
  errorEl.style.color = 'var(--pf-error, #cf222e)'

  const text = document.createElement('div')
  text.textContent = message
  errorEl.appendChild(text)

  const actionsRow = document.createElement('div')
  actionsRow.style.display = 'flex'
  actionsRow.style.gap = '6px'
  actionsRow.style.marginTop = '4px'
  errorEl.appendChild(actionsRow)

  if (options.retry) {
    const retryButton = document.createElement('button')
    retryButton.type = 'button'
    retryButton.textContent = 'Try Again'
    retryButton.style.padding = '6px 14px'
    retryButton.style.fontSize = '12px'
    retryButton.style.border = '1px solid var(--pf-error, #cf222e)'
    retryButton.style.borderRadius = '7px'
    retryButton.style.background = 'var(--pf-surface, #ffffff)'
    retryButton.style.color = 'var(--pf-error, #cf222e)'
    retryButton.style.cursor = 'pointer'
    retryButton.addEventListener('click', () => options.retry?.())
    actionsRow.appendChild(retryButton)
  }

  if (options.downloadName && options.downloadBlob) {
    const downloadButton = document.createElement('button')
    downloadButton.type = 'button'
    downloadButton.textContent = 'Download File'
    downloadButton.style.padding = '6px 14px'
    downloadButton.style.fontSize = '12px'
    downloadButton.style.border = '1px solid var(--pf-line, #d0d7de)'
    downloadButton.style.borderRadius = '7px'
    downloadButton.style.background = 'var(--pf-surface, #ffffff)'
    downloadButton.style.color = 'var(--pf-ink-soft, #57606a)'
    downloadButton.style.cursor = 'pointer'
    downloadButton.addEventListener('click', () => {
      if (options.downloadName && options.downloadBlob) {
        try {
          downloadBlob(options.downloadName, options.downloadBlob)
        } catch (error) {
          console.error('[preview-file] download failed', error)
        }
      }
    })
    actionsRow.appendChild(downloadButton)
  }

  container.replaceChildren(errorEl)
}

function buildActions(
  source: SourceInput,
  options: PreviewOptions,
  container: HTMLElement,
  resolved: ResolvedSource,
  mimeType: string,
  adapter: PreviewAdapter | undefined
): PreviewActions {
  const canZoom = Boolean(adapter?.canZoom && adapter?.zoomIn && adapter?.zoomOut && adapter?.resetZoom)
  const canFullscreen =
    adapter?.canFullscreen !== false && typeof container.requestFullscreen === 'function'
  const reportError = (message: string, error: unknown): void => {
    showError(container, `${message}: ${(error as Error).message}`, {
      retry: () => {
        void preview(source, container, options).catch(() => undefined)
      },
      downloadName: resolved.name,
      downloadBlob: resolved.blob,
    })
  }

  const download = (): void => {
    if (adapter?.download) {
      try {
        adapter.download()
      } catch (error) {
        reportError('Download failed', error)
      }
      return
    }
    try {
      downloadBlob(resolved.name, resolved.blob)
    } catch (error) {
      reportError('Download failed', error)
    }
  }

  const zoomIn = (): void => {
    try {
      adapter?.zoomIn?.()
    } catch (error) {
      reportError('Zoom failed', error)
    }
  }

  const zoomOut = (): void => {
    try {
      adapter?.zoomOut?.()
    } catch (error) {
      reportError('Zoom failed', error)
    }
  }

  const resetZoom = (): void => {
    try {
      adapter?.resetZoom?.()
    } catch (error) {
      reportError('Zoom failed', error)
    }
  }

  const fullscreen = (): Promise<void> | void => {
    if (adapter?.fullscreen) return adapter.fullscreen.request()
    if (typeof container.requestFullscreen === 'function') {
      return container.requestFullscreen()
    }
    return undefined
  }

  return {
    fileName: resolved.name,
    fileTypeLabel: formatLabel(mimeType, resolved.name),
    canZoom,
    canDownload: adapter?.canDownload ?? true,
    canFullscreen,
    get zoomPercent() {
      return adapter?.zoomPercent
    },
    zoomIn,
    zoomOut,
    resetZoom,
    download,
    fullscreen,
    lens: adapter?.lens,
    pages: adapter?.pages,
    fit: adapter?.fit,
    rotate: adapter?.rotate,
    sheets: adapter?.sheets,
    text: adapter?.text,
    singlePage: adapter?.singlePage,
    thumbnails: adapter?.thumbnails,
    viewMode: adapter?.viewMode,
  }
}

function formatLabel(mimeType: string, name: string): string {
  if (mimeType.startsWith('application/pdf')) return 'PDF'
  if (mimeType.startsWith('text/markdown')) return 'Markdown'
  if (mimeType.startsWith('text/csv')) return 'CSV'
  if (mimeType.startsWith('text/')) return 'Text'
  if (mimeType.startsWith('image/')) return 'Image'
  if (mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') return 'Spreadsheet'
  if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'Word'
  if (mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation') return 'Presentation'
  if (mimeType === 'application/x-7z-compressed') return 'Archive'
  if (mimeType === 'application/zip') return 'Archive'
  const last = name.lastIndexOf('.')
  return last > 0 ? name.slice(last + 1).toUpperCase() : mimeType
}

export async function preview(
  source: SourceInput,
  container: HTMLElement,
  options: PreviewOptions = {}
): Promise<void> {
  if (typeof document === 'undefined') {
    throw new Error('preview() can only be used in a browser environment')
  }

  clearPreview(container)

  ensureThemeStyles()

  const generation = previewGeneration.get(container) ?? 0
  const isCurrent = (): boolean => previewGeneration.get(container) === generation

  const loading = createStateElement()
  const loadingText = document.createElement('div')
  loadingText.textContent = 'Loading…'
  loading.appendChild(loadingText)
  container.appendChild(loading)

  const retry = (): void => {
    void preview(source, container, options).catch(() => undefined)
  }

  let resolved: ResolvedSource | undefined
  try {
    resolved = await createSource(source)
  } catch (error) {
    showError(container, (error as Error).message, { retry })
    throw error as Error
  }
  if (!isCurrent()) return

  if (options.maxBytes && resolved.blob.size > options.maxBytes) {
    const maxBytes = options.maxBytes
    const message = `File is too large (${(resolved.blob.size / (1024 * 1024)).toFixed(1)} MB); the preview limit is ${(maxBytes / (1024 * 1024)).toFixed(1)} MB`
    showError(container, message, {
      retry,
      downloadName: resolved.name,
      downloadBlob: resolved.blob,
    })
    throw new Error(message)
  }

  const mimeType = detectType(resolved.name, resolved.blob.type)

  /* The name is passed along so Monaco's capability check (the code previewer)
     can resolve the file against Monaco's own language metadata — extension,
     file name or declared MIME — instead of a fixed MIME list. */
  const previewer = getPreviewer(mimeType, resolved.name)
  if (!previewer) {
    const message = `No previewer registered for MIME type "${mimeType}"`
    showError(container, message, { retry, downloadName: resolved.name, downloadBlob: resolved.blob })
    throw new Error(message)
  }

  let result: PreviewResult
  try {
    const data = new Uint8Array(await resolved.blob.arrayBuffer())
    result = await previewer.preview({
      name: resolved.name,
      mimeType,
      data,
    })
  } catch (error) {
    const message = `Failed to preview "${resolved.name}": ${(error as Error).message}`
    showError(container, message, { retry, downloadName: resolved.name, downloadBlob: resolved.blob })
    throw error as Error
  }
  if (!isCurrent()) return

  const renderer = getRenderer(result.type)
  if (!renderer) {
    const message = `No renderer registered with result type "${result.type}"`
    showError(container, message, { retry, downloadName: resolved.name, downloadBlob: resolved.blob })
    throw new Error(message)
  }

  container.replaceChildren()

  if (container.style.position === '' || container.style.position === 'static') {
    container.style.position = 'relative'
  }

  /* The preview is laid out like a page: the chrome (mounted by
     `mountControls` below) fills the shell and the renderer's stage lives in
     the middle pane between the top/left/right/bottom chrome regions. Keeping
     every surface in normal flow (never an overlay) means controllers can
     never overlap the content — even when a renderer nests a full second
     preview (e.g. a file opened inside an archive). */
  const shell = document.createElement('div')
  shell.classList.add('pf-root')
  shell.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;overflow:hidden;'
  container.appendChild(shell)

  const stage = document.createElement('div')
  stage.className = 'pf-stage'
  stage.style.cssText = 'position:relative;flex:1 1 auto;min-width:0;min-height:0;overflow:hidden;'
  shell.appendChild(stage)

  let adapter: PreviewAdapter | undefined
  try {
    const rendered = await renderer.render(stage, result, options, {
      previewSource: (source, innerContainer, innerOptions) => preview(source, innerContainer, innerOptions),
      clearPreview,
    })
    adapter = rendered ?? undefined
  } catch (error) {
    const message = `Failed to render preview for "${resolved.name}": ${(error as Error).message}`
    showError(container, message, { retry, downloadName: resolved.name, downloadBlob: resolved.blob })
    renderer.destroy?.(stage)
    throw error as Error
  }
  if (!isCurrent()) return

  const unmountControls = mountControls(shell, buildActions(source, options, container, resolved, mimeType, adapter))

  activePreviews.set(container, () => {
    unmountControls()
    renderer.destroy?.(stage)
  })
}