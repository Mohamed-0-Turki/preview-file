import type { Previewer } from './types.js'
import type { FileInput, PreviewOptions, PreviewResult } from '../types.js'
import type { MarkdownResultData } from './result-types.js'

/**
 * Previewer for Markdown files. Owns the exact `text/markdown` MIME key (it is
 * deliberately NOT part of `CODE_MIME_TYPES`): `.md` / `.markdown` files get a
 * GitHub-style rendered document instead of a raw code editor. `.mdx` stays on
 * the code previewer — it is JSX-first, not prose.
 */
export class MarkdownPreviewer implements Previewer {
  readonly name = 'markdown'
  readonly supportedMimeTypes = ['text/markdown']

  canPreview(mimeType: string): boolean {
    return mimeType === 'text/markdown'
  }

  async preview(file: FileInput, _options?: PreviewOptions): Promise<PreviewResult> {
    const data: MarkdownResultData = {
      text: new TextDecoder().decode(file.data),
      name: file.name,
      mimeType: file.mimeType,
    }
    return { type: 'text/markdown', data }
  }
}