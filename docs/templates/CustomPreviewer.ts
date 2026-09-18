import type { Previewer } from '../../../src/previewers/types.js'
import type { FileInput, PreviewOptions, PreviewResult } from '../../../src/types.js'

/**
 * TEMPLATE — a previewer converts raw bytes into a normalized PreviewResult.
 * Copy to `src/previewers/<format>.ts`, rename `Markdown` to `<Format>`, then:
 *  1. Define `<Format>ResultData` + an `is<Format>ResultData` guard in
 *     `src/previewers/result-types.ts` if the data shape is new.
 *  2. Register in `src/previewers/index.ts`:
 *       import { MarkdownPreviewer } from './markdown.js'
 *       import { registerPreviewer } from './registry.js'
 *       registerPreviewer(MarkdownPreviewer)
 *  3. A previewer must be cheap and pure: no DOM, no heavy parsing. Repackage
 *     bytes; let the renderer do the real work.
 *
 * EXAMPLE: a Markdown format that reads UTF-8 text and reports itself as
 * `text/markdown`. Adapt the types and MIMEs to your format.
 */
export class MarkdownPreviewer implements Previewer {
  // Single, stable, lowercase name — follows the file-name convention.
  readonly name = 'markdown'

  // Every MIME alias this previewer can ingest. The registry maps all of them,
  // then falls back to canPreview() for dynamic checks.
  readonly supportedMimeTypes = ['text/markdown', 'text/x-markdown']

  canPreview(mimeType: string): boolean {
    return this.supportedMimeTypes.includes(mimeType)
  }

  async preview(file: FileInput, _options?: PreviewOptions): Promise<PreviewResult> {
    const text = new TextDecoder().decode(file.data)

    // `type` must be a stable one-word result type — the ONLY thing renderers
    // match on. Vendor MIME details stay out of `type`.
    return {
      type: 'text/markdown',
      data: { text },
    }
  }
}