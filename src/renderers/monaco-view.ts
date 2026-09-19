import type { MonacoGlobal, MonacoEditorInstance } from './monaco-types.js'

export const MONACO_BASE_FONT_SIZE = 13
export const MONACO_MIN_ZOOM = 0.5
export const MONACO_MAX_ZOOM = 4
export const MONACO_ZOOM_STEP = 1.2

const EDITOR_OPTIONS = {
  readOnly: true,
  automaticLayout: true,
  theme: 'vs',
  minimap: { enabled: false },
  glyphMargin: false,
  folding: true,
  lineNumbers: 'on',
  scrollBeyondLastLine: false,
  contextmenu: false,
  renderLineHighlight: 'all',
} as const

export interface MonacoView {
  /** The underlying editor, for show/hide + layout orchestration. */
  readonly editor: MonacoEditorInstance
  getZoomPercent(): number
  zoomIn(): void
  zoomOut(): void
  resetZoom(): void
  copy(): void
  canCopy(): boolean
  getWordWrap(): boolean
  toggleWordWrap(): void
  dispose(): void
}

/**
 * Create a read-only Monaco editor plus the zoom/copy/word-wrap controller
 * shared by every code-like renderer (the code renderer and the Markdown
 * "Code" view). Keeps the interaction same across contexts — one editor state
 * machine instead of per-renderer duplicates.
 */
export function createMonacoView(
  monaco: MonacoGlobal,
  container: HTMLElement,
  value: string,
  language: string
): MonacoView {
  const editor = monaco.editor.create(container, {
    ...EDITOR_OPTIONS,
    value,
    language,
    fontSize: MONACO_BASE_FONT_SIZE,
    wordWrap: 'off',
  })

  let zoom = 1
  let wordWrap = false

  const applyZoom = (nextZoom: number): void => {
    zoom = Math.min(MONACO_MAX_ZOOM, Math.max(MONACO_MIN_ZOOM, nextZoom))
    editor.updateOptions({
      fontSize: Math.round(MONACO_BASE_FONT_SIZE * zoom * 10) / 10,
    })
  }

  const applyWordWrap = (next: boolean): void => {
    wordWrap = next
    editor.updateOptions({ wordWrap: wordWrap ? 'on' : 'off' })
  }

  const copy = (): void => {
    if (value.length === 0) return
    if (navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(value)
      return
    }
    const textarea = document.createElement('textarea')
    textarea.value = value
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    textarea.remove()
  }

  return {
    editor,
    getZoomPercent: () => Math.round(zoom * 100),
    zoomIn: () => applyZoom(zoom * MONACO_ZOOM_STEP),
    zoomOut: () => applyZoom(zoom / MONACO_ZOOM_STEP),
    resetZoom: () => applyZoom(1),
    copy,
    canCopy: () => value.length > 0,
    getWordWrap: () => wordWrap,
    toggleWordWrap: () => applyWordWrap(!wordWrap),
    dispose: () => {
      editor.dispose()
      container.remove()
    },
  }
}