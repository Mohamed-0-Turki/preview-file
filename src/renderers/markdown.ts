import type { PreviewAdapter, ViewModeControls } from '../controls/types.js'
import type { PreviewOptions, PreviewResult } from '../types.js'
import { isMarkdownResultData } from '../previewers/result-types.js'
import { createRenderState } from './render-state.js'
import type { Renderer } from './types.js'
import { loadMonaco } from './monaco-loader.js'
import { resolveFenceLanguage } from './monaco-language.js'
import { createMonacoView } from './monaco-view.js'
import type { MonacoGlobal } from './monaco-types.js'

interface MarkdownAttachment {
  destroy(): void
}

const MARKDOWN_STYLE_ID = 'pf-markdown-styles'

/* GitHub-flavored document styling, scoped under `.pf-markdown` so it can never
   leak out of the preview stage. */
const MARKDOWN_CSS = `
.pf-markdown {
  position: absolute;
  inset: 0;
  overflow: auto;
  box-sizing: border-box;
  padding: 24px 32px 48px;
  background: #ffffff;
  color: #1f2328;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji';
  font-size: 16px;
  line-height: 1.6;
  word-wrap: break-word;
}
.pf-markdown h1, .pf-markdown h2, .pf-markdown h3, .pf-markdown h4, .pf-markdown h5, .pf-markdown h6 {
  margin: 24px 0 16px;
  font-weight: 600;
  line-height: 1.25;
}
.pf-markdown h1 { font-size: 2em; padding-bottom: 0.3em; border-bottom: 1px solid #d0d7de; }
.pf-markdown h2 { font-size: 1.5em; padding-bottom: 0.3em; border-bottom: 1px solid #d0d7de; }
.pf-markdown h3 { font-size: 1.25em; }
.pf-markdown h4 { font-size: 1em; }
.pf-markdown h5 { font-size: 0.875em; }
.pf-markdown h6 { font-size: 0.85em; color: #57606a; }
.pf-markdown p, .pf-markdown ul, .pf-markdown ol, .pf-markdown blockquote, .pf-markdown pre, .pf-markdown table, .pf-markdown hr, .pf-markdown dl, .pf-markdown figure, .pf-markdown details {
  margin: 0 0 16px;
}
.pf-markdown a { color: #0969da; text-decoration: none; }
.pf-markdown a:hover { text-decoration: underline; }
.pf-markdown img { max-width: 100%; box-sizing: border-box; }
.pf-markdown hr {
  height: 0.25em;
  padding: 0;
  margin: 24px 0;
  background: #d0d7de;
  border: 0;
}
.pf-markdown ul, .pf-markdown ol { padding-left: 2em; }
.pf-markdown li { margin: 0.25em 0; }
.pf-markdown li + li { margin-top: 0.25em; }
.pf-markdown li > p { margin: 0; }
.pf-markdown blockquote {
  padding: 0 1em;
  color: #57606a;
  border-left: 0.25em solid #d0d7de;
}
.pf-markdown code {
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 85%;
  padding: 0.2em 0.4em;
  background: rgba(175, 184, 193, 0.2);
  border-radius: 6px;
}
.pf-markdown pre {
  padding: 16px;
  overflow: auto;
  font-size: 85%;
  line-height: 1.45;
  background: #f6f8fa;
  border-radius: 6px;
}
.pf-markdown pre code { background: transparent; padding: 0; font-size: 100%; }
.pf-markdown pre > code { white-space: pre; word-wrap: normal; }
.pf-markdown .pf-md-tok { display: inline; }
.pf-markdown table {
  display: block;
  width: max-content;
  max-width: 100%;
  overflow: auto;
  border-spacing: 0;
  border-collapse: collapse;
}
.pf-markdown th, .pf-markdown td {
  padding: 6px 13px;
  border: 1px solid #d0d7de;
}
.pf-markdown th { font-weight: 600; background: #f6f8fa; }
.pf-markdown tr { border-top: 1px solid #d0d7de; }
.pf-markdown input[type='checkbox'] { margin: 0 0.4em 0 0; vertical-align: -0.15em; }
.pf-markdown .task-list-item { list-style: none; }
.pf-markdown .task-list-item ul, .pf-markdown .task-list-item ol { margin-top: 0; }
`

function ensureMarkdownStyles(): void {
  if (document.getElementById(MARKDOWN_STYLE_ID)) return
  const style = document.createElement('style')
  style.id = MARKDOWN_STYLE_ID
  style.textContent = MARKDOWN_CSS
  document.head.appendChild(style)
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/* Trim anything that could run or navigate away: scripts, embedded frames,
 * forms, on-* handlers and script/vbscript URL schemes. `data:image` sources
 * are kept — Markdown embeds tiny data-URI images and they cannot execute. */
function sanitizeDom(root: HTMLElement): void {
  root
    .querySelectorAll('script, iframe, object, embed, form, base, meta, link, style, button')
    .forEach((element) => element.remove())

  for (const element of root.querySelectorAll<HTMLElement>('[href], [src], [xlink\\:href]')) {
    for (const attribute of [...element.attributes]) {
      const name = attribute.name
      if (name.toLowerCase().startsWith('on')) {
        element.removeAttribute(name)
        continue
      }
      const value = attribute.value.trim().toLowerCase()
      const isUrl = name === 'href' || name === 'src' || name === 'xlink:href'
      const unsafeScheme = /^(javascript|vbscript|data):/.test(value)
      const dataImage = name === 'src' && /^data:image\//.test(value)
      if (isUrl && unsafeScheme && !dataImage) {
        element.removeAttribute(name)
      }
    }
  }
}

let markedConfigured = false

async function renderMarkdown(text: string): Promise<string> {
  const { marked } = await import('marked')
  if (!markedConfigured) {
    marked.use({ gfm: true, breaks: false, async: false })
    markedConfigured = true
  }
  return marked.parse(text) as string
}

/* Token type base → GitHub-style color. Unknown types inherit the default. */
const TOKEN_COLORS: Readonly<Record<string, string>> = {
  comment: '#6e7781',
  keyword: '#cf222e',
  string: '#0a3069',
  number: '#0550ae',
  type: '#0550ae',
  tag: '#0550ae',
  function: '#8250df',
  variable: '#953800',
  boolean: '#cf222e',
  constant: '#e36209',
  regexp: '#0a3069',
  entity: '#8250df',
}

function tokenClass(type: string): string | undefined {
  const lower = type.toLowerCase()
  if (lower === 'attribute.name') return TOKEN_COLORS['constant']
  const base = (lower.split('.')[0] ?? '').trim()
  return TOKEN_COLORS[base]
}

async function highlightCodeBlocks(
  preview: HTMLElement,
  options?: PreviewOptions
): Promise<void> {
  const blocks = preview.querySelectorAll<HTMLElement>('pre > code[class*="language-"]')
  if (blocks.length === 0) return

  let monaco: MonacoGlobal
  try {
    monaco = await loadMonaco(options)
  } catch (error) {
    console.warn('[preview-file] code highlighting unavailable', error)
    return
  }

  const nextFrame = (): Promise<void> =>
    new Promise((resolve) => requestAnimationFrame(() => resolve()))

  /* Highlight one block per animation frame so many fences don't jank one
     frame; the toggle stays usable while the highlighter works its way down. */
  for (const block of blocks) {
    const labelMatch = block.className.match(/language-([A-Za-z0-9_+.+-]+)/i)
    const label = labelMatch?.[1]
    const resolved = label ? resolveFenceLanguage(monaco, label) : undefined
    if (!resolved) continue

    const raw = block.textContent ?? ''
    const lines = raw.split('\n')
    let html = ''
    try {
      for (const [lineIndex, line] of lines.entries()) {
        const tokens = monaco.editor.tokenize(line, resolved.id)[0] ?? []
        let lineHtml = ''
        for (let i = 0; i < tokens.length; i += 1) {
          const token = tokens[i] as { offset: number; type: string }
          const start = Math.min(token.offset, line.length)
          const end = i < tokens.length - 1 ? (tokens[i + 1] as { offset: number }).offset : line.length
          const slice = line.slice(start, Math.max(start, Math.min(end, line.length)))
          if (!slice) continue
          const color = tokenClass(token.type)
          lineHtml += color
            ? `<span class="pf-md-tok" style="color:${color}">${escapeHtml(slice)}</span>`
            : escapeHtml(slice)
        }
        html += lineHtml || ' '
        if (lineIndex < lines.length - 1) html += '\n'
      }
    } catch {
      continue
    }
    if (html) block.innerHTML = html
    await nextFrame()
  }
}

export class MarkdownRenderer implements Renderer {
  readonly name = 'markdown'
  readonly supportedTypes = ['text/markdown']

  private readonly attachments = createRenderState<MarkdownAttachment>()

  canRender(type: string): boolean {
    return type === 'text/markdown'
  }

  async render(
    container: HTMLElement,
    result: PreviewResult,
    options?: PreviewOptions
  ): Promise<PreviewAdapter> {
    if (!isMarkdownResultData(result.data)) {
      throw new Error('The preview result has no markdown data.')
    }
    const { text } = result.data

    ensureMarkdownStyles()

    const previewHost = document.createElement('div')
    previewHost.className = 'pf-markdown'
    previewHost.setAttribute('role', 'document')
    container.appendChild(previewHost)

    const html = await renderMarkdown(text)
    previewHost.innerHTML = html
    sanitizeDom(previewHost)
    void highlightCodeBlocks(previewHost, options)

    const codeHost = document.createElement('div')
    codeHost.style.cssText = 'position:absolute;inset:0;visibility:hidden;pointer-events:none;'
    container.appendChild(codeHost)

    let mode: 'preview' | 'code' = 'preview'
    let monacoView: ReturnType<typeof createMonacoView> | undefined
    let plainFallback: HTMLPreElement | undefined

    const applyView = (next: 'preview' | 'code'): void => {
      const inCode = next === 'code'
      previewHost.style.visibility = inCode ? 'hidden' : 'visible'
      previewHost.style.pointerEvents = inCode ? 'none' : ''
      codeHost.style.visibility = inCode ? 'visible' : 'hidden'
      codeHost.style.pointerEvents = inCode ? '' : 'none'
      if (inCode) monacoView?.editor.layout()
    }

    /* The Code view itself stays lazily built — the first switch to Code is
       the only time Monaco loads for a Markdown preview. Stored so an early
       flip back to Preview (while the browser was fetching the editor) still
       shows the editor when it lands. */
    let codePending = false

    const ensureCodeView = async (): Promise<void> => {
      if (monacoView || plainFallback || codePending) return
      codePending = true
      try {
        const monaco = await loadMonaco(options)
        monacoView = createMonacoView(monaco, codeHost, text, 'markdown')
      } catch (error) {
        console.error(
          '[preview-file] Markdown code view unavailable, showing raw source instead',
          error
        )
        plainFallback = document.createElement('pre')
        plainFallback.textContent = text
        plainFallback.style.cssText =
          'margin:0;height:100%;overflow:auto;padding:16px;box-sizing:border-box;' +
          'font:13px/1.5 SFMono-Regular,Consolas,"Liberation Mono",Menlo,monospace;'
        codeHost.appendChild(plainFallback)
      }
    }

    const viewMode: ViewModeControls = {
      get mode() {
        return mode
      },
      setMode(next) {
        if (next === mode) return
        mode = next
        applyView(next)
        if (next === 'code') {
          void ensureCodeView().then(() => {
            if (mode === 'code') applyView('code')
          })
        }
      },
    }

    applyView('preview')

    this.attachments.set(container, {
      destroy: () => {
        if (monacoView) monacoView.dispose()
        plainFallback?.remove()
      },
    })

    return { viewMode }
  }

  destroy(container: HTMLElement): void {
    this.attachments.destroyFor(container)
  }
}