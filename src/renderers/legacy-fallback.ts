import type { PreviewAdapter } from '../controls/types.js'

/**
 * Builds the "Preview unavailable" card used when a format cannot be rendered
 * in the browser (e.g. legacy binary Office formats, unsupported container
 * formats). The caller composes `message`; this helper owns the DOM and the
 * minimal adapter so the layout is not duplicated across renderers.
 */
export function renderLegacyFallback(container: HTMLElement, message: string): PreviewAdapter {
  const fallback = document.createElement('div')
  fallback.style.position = 'absolute'
  fallback.style.inset = '0'
  fallback.style.display = 'flex'
  fallback.style.flexDirection = 'column'
  fallback.style.alignItems = 'center'
  fallback.style.justifyContent = 'center'
  fallback.style.gap = '8px'
  fallback.style.padding = '16px'
  fallback.style.boxSizing = 'border-box'
  fallback.style.fontFamily = 'system-ui, sans-serif'
  fallback.style.fontSize = '13px'
  fallback.style.color = '#57606a'
  fallback.style.textAlign = 'center'

  const title = document.createElement('div')
  title.textContent = 'Preview unavailable'
  title.style.fontWeight = '600'
  title.style.color = '#24292f'
  fallback.appendChild(title)

  const detail = document.createElement('div')
  detail.textContent = message
  fallback.appendChild(detail)

  container.appendChild(fallback)

  return {
    canDownload: true,
    canFullscreen: false,
  }
}