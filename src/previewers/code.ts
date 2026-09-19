import type { Previewer } from './types.js'
import type { FileInput, PreviewOptions, PreviewResult } from '../types.js'
import { CODE_MIME_TYPES, canMonacoPreview } from '../utils/index.js'
import type { CodeResultData } from './result-types.js'

/**
 * Previewer for source code rendered by Monaco. It is capability-aware, not
 * just MIME-aware: a file is claimed only when Monaco's own language metadata
 * recognizes it — by exact file name, extension or declared MIME — and the
 * file is not owned by a more specialized previewer (Markdown, plain text).
 * Unknown files fall through to the rest of the registry.
 */
export class CodePreviewer implements Previewer {
  readonly name = 'code'
  readonly supportedMimeTypes = CODE_MIME_TYPES

  canPreview(mimeType: string, name?: string): boolean {
    return canMonacoPreview(name ?? '', mimeType)
  }

  async preview(file: FileInput, _options?: PreviewOptions): Promise<PreviewResult> {
    const data: CodeResultData = {
      text: new TextDecoder().decode(file.data),
      name: file.name,
      mimeType: file.mimeType,
    }
    return { type: 'text/code', data }
  }
}