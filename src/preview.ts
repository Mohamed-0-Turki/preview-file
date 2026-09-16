import { downloadBlob, mountControls } from './controls/index.js'
import type { PreviewActions, PreviewAdapter } from './controls/index.js'
import { getPreviewer } from './registry.js'
import { getRenderer } from './renderers/index.js'
import { createSource } from './sources/index.js'
import type { ResolvedSource, SourceInput } from './sources/index.js'
import type { PreviewOptions, PreviewResult } from './types.js'
import { detectType } from './utils/detect.js'

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
  el.style.display = 'flex'
  el.style.flexDirection = 'column'
  el.style.alignItems = 'center'
  el.style.justifyContent = 'center'
  el.style.gap = '8px'
  el.style.height = '100%'
  el.style.boxSizing = 'border-box'
  el.style.padding = '8px'
  el.style.fontFamily = 'system-ui, sans-serif'
  el.style.fontSize = '13px'
  el.style.textAlign = 'center'
  return el
}

interface ErrorOptions {
  readonly retry?: () => void
  readonly downloadName?: string
  readonly downloadBlob?: Blob
}

function showError(container: HTMLElement, message: string, options: ErrorOptions = {}): void {
  const errorEl = createStateElement()
  errorEl.style.color = '#cf222e'

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
    retryButton.style.padding = '2px 10px'
    retryButton.style.fontSize = '12px'
    retryButton.style.border = '1px solid #cf222e'
    retryButton.style.borderRadius = '6px'
    retryButton.style.background = '#ffffff'
    retryButton.style.color = '#cf222e'
    retryButton.style.cursor = 'pointer'
    retryButton.addEventListener('click', () => options.retry?.())
    actionsRow.appendChild(retryButton)
  }

  if (options.downloadName && options.downloadBlob) {
    const downloadButton = document.createElement('button')
    downloadButton.type = 'button'
    downloadButton.textContent = 'Download File'
    downloadButton.style.padding = '2px 10px'
    downloadButton.style.fontSize = '12px'
    downloadButton.style.border = '1px solid #57606a'
    downloadButton.style.borderRadius = '6px'
    downloadButton.style.background = '#ffffff'
    downloadButton.style.color = '#57606a'
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
    search: adapter?.search,
    text: adapter?.text,
    singlePage: adapter?.singlePage,
    thumbnails: adapter?.thumbnails,
  }
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

  const generation = previewGeneration.get(container) ?? 0
  const isCurrent = (): boolean => previewGeneration.get(container) === generation

  const loading = createStateElement()
  loading.style.color = '#6e7781'
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

  const previewer = getPreviewer(mimeType)
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

  /* The preview is laid out like a page: a sticky toolbar on top and a stage
     below it that holds the renderer's content. Keeping the toolbar in normal
     flow (not an overlay) lets the content scroll beneath it while the bar
     stays pinned at the top of the preview. */
  const shell = document.createElement('div')
  shell.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;overflow:hidden;'
  container.appendChild(shell)

  const stage = document.createElement('div')
  stage.style.cssText = 'position:relative;flex:1 1 auto;min-height:0;overflow:hidden;'
  shell.appendChild(stage)

  let adapter: PreviewAdapter | undefined
  try {
    const rendered = await renderer.render(stage, result, options)
    adapter = rendered ?? undefined
  } catch (error) {
    const message = `Failed to render preview for "${resolved.name}": ${(error as Error).message}`
    showError(container, message, { retry, downloadName: resolved.name, downloadBlob: resolved.blob })
    renderer.destroy?.(stage)
    throw error as Error
  }
  if (!isCurrent()) return

  const unmountControls = mountControls(shell, buildActions(source, options, container, resolved, adapter))

  activePreviews.set(container, () => {
    unmountControls()
    renderer.destroy?.(stage)
  })
}