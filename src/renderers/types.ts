import type { PreviewOptions, PreviewResult } from '../types.js'
import type { SourceInput } from '../sources/types.js'
import type { PreviewAdapter } from '../controls/types.js'

/** Capabilities preview.ts hands a renderer that let it reuse the rest of the
 *  pipeline. Concrete implementations live in the orchestrator, so renderers
 *  can nest another preview (e.g. showing a file extracted from an archive)
 *  without importing `preview.ts` themselves — importing it would create a
 *  module cycle, the renderers layer never reaches into the orchestrator. */
export interface RenderContext {
  /** Run the full preview pipeline (loading state, toolbar, teardown) for a
   *  nested source inside `container`. Being a fresh `preview()` call, errors
   *  and the file's own toolbar render inside `container`, exactly as if the
   *  host had opened the file itself. */
  previewSource(source: SourceInput, container: HTMLElement, options?: PreviewOptions): Promise<void>
  /** Tear down whichever preview `previewSource` mounted in `container`. */
  clearPreview(container: HTMLElement): void
}

export interface Renderer {
  readonly name: string
  readonly supportedTypes: readonly string[]
  canRender(type: string): boolean
  render(
    container: HTMLElement,
    result: PreviewResult,
    options?: PreviewOptions,
    context?: RenderContext
  ): PreviewAdapter | void | Promise<PreviewAdapter | void>
  destroy?(container: HTMLElement): void
}