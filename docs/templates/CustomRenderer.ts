import type { PreviewAdapter } from '../../../src/controls/types.js'
import type { PreviewOptions, PreviewResult } from '../../../src/types.js'
import { isMarkdownResultData } from '../../../src/previewers/result-types.js'
import { createRenderState } from '../../../src/renderers/render-state.js'
import type { Renderer } from '../../../src/renderers/types.js'

interface MarkdownAttachment {
  destroy(): void
}

/**
 * TEMPLATE — a renderer turns a normalized PreviewResult into DOM and returns a
 * PreviewAdapter describing the toolbar capabilities it supports.
 * Copy to `src/renderers/<format>.ts`, rename `Markdown` to `<Format>`, then:
 *  1. Register in `src/renderers/index.ts`:
 *       import { MarkdownRenderer } from './markdown.js'
 *       import { registerRenderer } from './registry.js'
 *       registerRenderer(MarkdownRenderer)
 *  2. Heavy engines (pdf.js, docx-preview, xlsx) are `await import()`ed INSIDE
 *     `render()` — never at module top level.
 *  3. Register the attachment with createRenderState and release every resource
 *     (observers, rAF, engine instances, canvas contexts) in `destroy()`.
 *  4. Return `void` for a plain, read-only view with no controls.
 */
export class MarkdownRenderer implements Renderer {
  readonly name = 'markdown'

  // The STABLE RESULT TYPES this renderer can render (from previewers).
  readonly supportedTypes = ['text/markdown']

  private readonly attachments = createRenderState<MarkdownAttachment>()

  canRender(type: string): boolean {
    return this.supportedTypes.includes(type)
  }

  async render(
    container: HTMLElement,
    result: PreviewResult,
    _options?: PreviewOptions
  ): Promise<PreviewAdapter | void> {
    // Type-guard the result.data so TypeScript narrows it safely and the
    // renderer never guesses at data shapes.
    if (!isMarkdownResultData(result.data)) {
      throw new Error('The preview result has no Markdown data.')
    }

    const pre = document.createElement('pre')
    pre.textContent = result.data.text
    container.appendChild(pre)

    // Optional: build an adapter when the view supports toolbar actions.
    // Return undefined/void to render a plain view with no toolbar.
    return undefined
  }

  destroy(container: HTMLElement): void {
    this.attachments.destroyFor(container)
  }
}