import type { Previewer } from './types.js'
import type { FileInput, PreviewOptions, PreviewResult } from '../types.js'
import { resolveArchiveFormat } from '../archives/index.js'
import type { ArchiveResultData } from './result-types.js'

/** MIME types the archive previewer owns by exact match. Browsers and servers
 *  disagree about how zip/tar/gz are labeled, so the common variants are
 *  covered; the sizeable generic `application/octet-stream` falls through to
 *  extension-based detection (see `src/utils/detect.ts`). */
const ARCHIVE_MIME_TYPES = [
  'application/zip',
  'application/x-zip-compressed',
  'application/zip-compressed',
  'application/x-zip',
  'application/x-tar',
  'application/tar',
  'application/x-gtar',
  'application/x-compressed-tar',
  'application/gzip',
  'application/x-gzip',
  'application/x-gunzip',
  'application/gzipped',
]

const ARCHIVE_MIME_SET = new Set(ARCHIVE_MIME_TYPES)

export class ArchivePreviewer implements Previewer {
  readonly name = 'archive'
  readonly supportedMimeTypes = ARCHIVE_MIME_TYPES

  canPreview(mimeType: string): boolean {
    return ARCHIVE_MIME_SET.has(mimeType)
  }

  async preview(file: FileInput, _options?: PreviewOptions): Promise<PreviewResult> {
    const format = resolveArchiveFormat(file.name, file.mimeType)
    if (!format) {
      throw new Error(
        `Unrecognized archive format "${file.name}" — supported formats are ZIP, TAR, TAR.GZ / TGZ and GZ.`
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