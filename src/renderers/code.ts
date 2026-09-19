import type { PreviewAdapter } from '../controls/types.js'
import type { PreviewOptions, PreviewResult } from '../types.js'
import { isCodeResultData } from '../previewers/result-types.js'
import { createRenderState } from './render-state.js'
import type { Renderer } from './types.js'
import { loadMonaco } from './monaco-loader.js'
import { resolveLanguageId } from './monaco-language.js'
import { createMonacoView } from './monaco-view.js'

interface CodeAttachment {
  destroy(): void
}

export class CodeRenderer implements Renderer {
  readonly name = 'code'
  readonly supportedTypes = ['text/code']

  private readonly attachments = createRenderState<CodeAttachment>()

  canRender(type: string): boolean {
    return type === 'text/code'
  }

  async render(container: HTMLElement, result: PreviewResult, options?: PreviewOptions): Promise<PreviewAdapter> {
    if (!isCodeResultData(result.data)) {
      throw new Error('The preview result has no source code data.')
    }
    const { text, name, mimeType } = result.data

    const monaco = await loadMonaco(options)
    const language = resolveLanguageId(monaco, name, mimeType, text)

    const host = document.createElement('div')
    host.style.cssText = 'position:absolute;inset:0;'
    container.appendChild(host)

    const view = createMonacoView(monaco, host, text, language)

    this.attachments.set(container, { destroy: () => view.dispose() })

    return {
      canZoom: true,
      get zoomPercent() {
        return view.getZoomPercent()
      },
      zoomIn: () => view.zoomIn(),
      zoomOut: () => view.zoomOut(),
      resetZoom: () => view.resetZoom(),
      text: {
        canCopy: view.canCopy(),
        copy: () => view.copy(),
        canWordWrap: true,
        get wordWrap() {
          return view.getWordWrap()
        },
        toggleWordWrap: () => view.toggleWordWrap(),
      },
    }
  }

  destroy(container: HTMLElement): void {
    this.attachments.destroyFor(container)
  }
}