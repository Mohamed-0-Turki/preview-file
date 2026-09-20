import type { Previewer } from './types.js'
import type { FileInput, PreviewOptions, PreviewResult } from '../types.js'
import {
  ARCHIVE_FORMATS,
  allArchiveMimeTypes,
  archiveFormatLabel,
  isArchiveMimeType,
  resolveArchiveFormat,
  sniffArchiveFormat,
} from '../archives/index.js'
import type { ArchiveResultData } from './result-types.js'

/**
 * The single format-agnostic archive previewer. Ownership and format selection
 * are driven by the shared format descriptor table in `src/archives/formats.ts`
 * — never by a local list that can drift:
 *
 *  - `canPreview` accepts every MIME alias in the table, or any file name that
 *    `resolveArchiveFormat` maps to a supported container (this is what lets a
 *    `application/x-7z-compressed` file reach the archive browser without a
 *    MIME-list change).
 *  - `preview` resolves the format from the name (+ declared MIME) first and
 *    falls back to magic-byte sniffing when the name is unrecognized.
 */
export class ArchivePreviewer implements Previewer {
  readonly name = 'archive'
  readonly supportedMimeTypes = allArchiveMimeTypes()

  canPreview(mimeType: string, name?: string): boolean {
    if (isArchiveMimeType(mimeType)) return true
    if (name && resolveArchiveFormat(name)) return true
    return false
  }

  async preview(file: FileInput, _options?: PreviewOptions): Promise<PreviewResult> {
    const format = resolveArchiveFormat(file.name, file.mimeType) ?? sniffArchiveFormat(file.data)
    if (!format) {
      const labels = ARCHIVE_FORMATS.map((spec) => archiveFormatLabel(spec.id)).join(', ')
      throw new Error(
        `Unrecognized archive format "${file.name}" — supported formats are ${labels}.`
      )
    }

    const data: ArchiveResultData = {
      bytes: file.data,
      name: file.name,
      format,
    }
    return { type: 'application/x-archive', data }
  }
}