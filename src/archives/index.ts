import { gunzipSync } from 'fflate'
import { GzProvider } from './gz.js'
import { TarProvider } from './tar-provider.js'
import type { ArchiveFormat, ArchiveProvider } from './types.js'
import { ZipProvider } from './zip.js'

/** Resolve which container format a file name (+ optional MIME type) denotes.
 *  Extension wins where the two disagree, and `.tar.gz` is special-cased ahead
 *  of single `.gz` so compound archives keep their tar structure. Returns
 *  `undefined` for anything that is not a supported archive. */
export function resolveArchiveFormat(name: string, mimeType?: string): ArchiveFormat | undefined {
  const lower = name.toLowerCase()

  if (lower.endsWith('.zip')) return 'zip'
  if (lower.endsWith('.tar.gz') || lower.endsWith('.tgz')) return 'tgz'
  if (lower.endsWith('.gz')) return 'gz'
  if (lower.endsWith('.tar')) return 'tar'

  if (/zip/.test(mimeType ?? '')) return 'zip'
  if (mimeType === 'application/x-compressed-tar' || mimeType === 'application/x-gtar') return 'tgz'
  if (/gzip|gzip-compressed/.test(mimeType ?? '')) return 'gz'
  if (/tar/.test(mimeType ?? '')) return 'tar'

  return undefined
}

/** Name of the single inner file of a `.gz`, i.e. the original name minus the
 *  `.gz` suffix. */
function innerGzName(name: string): string {
  const lower = name.toLowerCase()
  const inner =
    lower.endsWith('.gz') ? name.slice(0, -3) : lower.endsWith('.gzip') ? name.slice(0, -5) : name
  return inner || 'file'
}

/** Build the provider matching `format` for the archive bytes. The caller is
 *  expected to have resolved the format from the file name first. */
export function createArchiveProvider(bytes: Uint8Array, format: ArchiveFormat, name: string): ArchiveProvider {
  try {
    switch (format) {
      case 'zip':
        return new ZipProvider(bytes)
      case 'tar':
        return new TarProvider(bytes, 'tar')
      case 'tgz':
        return new TarProvider(gunzipSync(bytes), 'tgz')
      case 'gz':
        return new GzProvider(bytes, innerGzName(name))
    }
  } catch (error) {
    throw new Error(`Failed to read "${name}" as an archive: ${(error as Error).message}`)
  }
}

export type { ArchiveFormat, ArchiveEntry, ArchiveProvider } from './types.js'
export { ArchivePasswordError } from './types.js'

/** Short human label for a format, for chrome like format badges. */
export function archiveFormatLabel(format: ArchiveFormat): string {
  switch (format) {
    case 'tgz':
      return 'TAR.GZ'
    case 'zip':
      return 'ZIP'
    case 'tar':
      return 'TAR'
    case 'gz':
      return 'GZ'
  }
}