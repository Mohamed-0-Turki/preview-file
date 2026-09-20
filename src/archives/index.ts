import { ArProvider } from './ar.js'
import { CpioProvider } from './cpio.js'
import {
  ARCHIVE_FORMATS,
  allArchiveMimeTypes,
  archiveFormatLabel,
  innerArchiveName,
  isArchiveMimeType,
} from './formats.js'
import { GzProvider } from './gz.js'
import { SevenZipProvider } from './seven-zip.js'
import { TarProvider } from './tar-provider.js'
import type { ArchiveFormat, ArchiveProvider } from './types.js'
import { ZipProvider } from './zip.js'

export { ARCHIVE_FORMATS, allArchiveMimeTypes, archiveFormatLabel, innerArchiveName, isArchiveMimeType }
export { resolveArchiveFormat, sniffArchiveFormat } from './formats.js'

export type { ArchiveFormat, ArchiveEntry, ArchiveProvider } from './types.js'
export { ArchivePasswordError } from './types.js'

/** Build the provider matching `format` for the archive bytes. Formats that
 *  share the same on-disk layout (`zip`/`zipx`, gzip family, bz2/xz/zst,
 *  their `.tar.*` wrappers) reuse one provider class. Construction is lazy —
 *  no parsing happens here, so errors surface on the first `list()`. */
export function createArchiveProvider(bytes: Uint8Array, format: ArchiveFormat, name: string): ArchiveProvider {
  switch (format) {
    case 'zip':
    case 'zipx':
      return new ZipProvider(bytes)
    case 'tar':
      return new TarProvider(bytes, 'tar')
    case 'tgz':
    case 'gz':
      return new GzProvider(bytes, format === 'tgz' ? 'tgz' : 'gz', innerArchiveName(name, format))
    case '7z':
    case 'rar':
    case 'cab':
    case 'bz2':
    case 'tbz':
    case 'xz':
    case 'txz':
    case 'zst':
    case 'tzst':
      return new SevenZipProvider(bytes, format, name)
    case 'ar':
      return new ArProvider(bytes)
    case 'cpio':
      return new CpioProvider(bytes)
  }
}