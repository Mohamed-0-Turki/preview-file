import type { PreviewAdapter } from '../controls/types.js'
import type { PreviewOptions, PreviewResult } from '../types.js'
import type { Renderer } from './types.js'

const BASE_FONT_SIZE = 13
const MIN_ZOOM = 1
const MAX_ZOOM = 4
const ZOOM_STEP = 1.2

export class TextRenderer implements Renderer {
  readonly name = 'text'
  readonly supportedTypes = ['text/plain']

  canRender(type: string): boolean {
    return type.startsWith('text/')
  }

  render(container: HTMLElement, result: PreviewResult, _options?: PreviewOptions): PreviewAdapter {
    const text = typeof result.data === 'string' ? result.data : ''

    const pre = document.createElement('pre')
    pre.style.margin = '0'
    pre.style.padding = '12px'
    pre.style.fontFamily = "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace"
    pre.style.fontSize = '13px'
    pre.style.lineHeight = '1.5'
    pre.style.whiteSpace = 'pre-wrap'
    pre.style.wordWrap = 'break-word'
    pre.style.color = '#1f2328'
    pre.style.height = '100%'
    pre.style.boxSizing = 'border-box'
    pre.style.overflow = 'auto'

    if (text.length === 0) {
      const empty = document.createElement('em')
      empty.textContent = 'This file is empty.'
      empty.style.color = '#6e7781'
      pre.appendChild(empty)
    } else {
      pre.textContent = text
    }

    container.appendChild(pre)

    let zoom = 1
    let wordWrap = true

    const applyZoom = (nextZoom: number): void => {
      zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoom))
      pre.style.fontSize = `${Math.round(BASE_FONT_SIZE * zoom * 10) / 10}px`
    }

    const applyWordWrap = (next: boolean): void => {
      wordWrap = next
      pre.style.whiteSpace = wordWrap ? 'pre-wrap' : 'pre'
      pre.style.wordWrap = wordWrap ? 'break-word' : 'normal'
      pre.style.overflowX = wordWrap ? '' : 'auto'
    }

    const copy = (): void => {
      if (text.length === 0) return
      if (navigator.clipboard?.writeText) {
        void navigator.clipboard.writeText(text)
        return
      }
      const textarea = document.createElement('textarea')
      textarea.value = text
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      textarea.remove()
    }

    return {
      canZoom: true,
      get zoomPercent() {
        return Math.round(zoom * 100)
      },
      zoomIn: () => applyZoom(zoom * ZOOM_STEP),
      zoomOut: () => applyZoom(zoom / ZOOM_STEP),
      resetZoom: () => applyZoom(1),
      text: {
        canCopy: text.length > 0,
        copy,
        canWordWrap: true,
        get wordWrap() {
          return wordWrap
        },
        toggleWordWrap: () => applyWordWrap(!wordWrap),
      },
    }
  }
}