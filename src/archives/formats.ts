/** Canonical archive format ids. Each id maps to exactly one provider family;
 *  siblings (e.g. `tgz` vs `gz`) share a provider but carry their own label and
 *  extension set. */
export type ArchiveFormat =
  | 'zip'
  | 'zipx'
  | 'tar'
  | 'tgz'
  | 'gz'
  | 'bz2'
  | 'tbz'
  | 'xz'
  | 'txz'
  | 'zst'
  | 'tzst'
  | '7z'
  | 'rar'
  | 'cab'
  | 'ar'
  | 'cpio'

export interface ArchiveFormatSpec {
  readonly id: ArchiveFormat
  /** Short uppercase label for badges and error messages. */
  readonly label: string
  /** File-name suffixes. Compound suffixes (`tar.gz`) are matched longest
   *  first, so `.tar.gz` wins over `.gz`. Order within the array is irrelevant
   *  (length decides); ARCHIVE_FORMATS order breaks length ties. */
  readonly extensions: readonly string[]
  /** MIME aliases the format is announced by. `application/x-archive` is
   *  deliberately absent — it is the previews' *result* type, not an input. */
  readonly mimeTypes: readonly string[]
}

/** Single source of truth for every archive format the library knows about.
 *  Extension→format, MIME→format and the archive previewer's accepted-MIME list
 *  are all derived from this table, so adding a format touches exactly one file
 *  (+ a provider case in `createArchiveProvider`). */
export const ARCHIVE_FORMATS: readonly ArchiveFormatSpec[] = [
  {
    id: 'zip',
    label: 'ZIP',
    extensions: ['zip'],
    mimeTypes: [
      'application/zip',
      'application/x-zip-compressed',
      'application/zip-compressed',
      'application/x-zip',
      'application/x-zipfile',
      'application/x-compressed',
    ],
  },
  {
    id: 'zipx',
    label: 'ZIPX',
    extensions: ['zipx'],
    mimeTypes: ['application/zip', 'application/x-zip-compressed'],
  },
  { id: 'tar', label: 'TAR', extensions: ['tar'], mimeTypes: ['application/x-tar', 'application/tar'] },
  {
    id: 'tgz',
    label: 'TAR.GZ',
    extensions: ['tar.gz', 'tgz'],
    mimeTypes: ['application/x-compressed-tar', 'application/x-gtar'],
  },
  {
    id: 'gz',
    label: 'GZ',
    extensions: ['gz', 'gzip'],
    mimeTypes: ['application/gzip', 'application/x-gzip', 'application/x-gunzip', 'application/gzipped', 'application/gzip-compressed'],
  },
  {
    id: 'bz2',
    label: 'BZ2',
    extensions: ['bz2', 'bzip2'],
    mimeTypes: ['application/x-bzip2', 'application/x-bzip', 'application/bzip2'],
  },
  { id: 'tbz', label: 'TAR.BZ2', extensions: ['tar.bz2', 'tbz2', 'tbz'], mimeTypes: ['application/x-bzip2'] },
  { id: 'xz', label: 'XZ', extensions: ['xz'], mimeTypes: ['application/x-xz'] },
  { id: 'txz', label: 'TAR.XZ', extensions: ['tar.xz', 'txz'], mimeTypes: ['application/x-xz'] },
  { id: 'zst', label: 'ZST', extensions: ['zst', 'zstd'], mimeTypes: ['application/zstd', 'application/x-zstd'] },
  { id: 'tzst', label: 'TAR.ZST', extensions: ['tar.zst', 'tzst'], mimeTypes: ['application/zstd'] },
  { id: '7z', label: '7Z', extensions: ['7z'], mimeTypes: ['application/x-7z-compressed', 'application/7z-compressed', 'application/x-7z'] },
  { id: 'rar', label: 'RAR', extensions: ['rar'], mimeTypes: ['application/vnd.rar', 'application/x-rar', 'application/x-rar-compressed', 'application/rar'] },
  { id: 'cab', label: 'CAB', extensions: ['cab'], mimeTypes: ['application/vnd.ms-cab-compressed', 'application/x-cab', 'application/x-cab-compressed'] },
  { id: 'ar', label: 'AR', extensions: ['ar', 'deb'], mimeTypes: ['application/x-ar', 'application/vnd.debian.binary-package'] },
  { id: 'cpio', label: 'CPIO', extensions: ['cpio'], mimeTypes: ['application/x-cpio'] },
]

const EXTENSION_INDEX: ReadonlyMap<string, ArchiveFormat> = new Map(
  ARCHIVE_FORMATS.flatMap((spec) => spec.extensions.map((extension) => [extension, spec.id] as const))
)

function archiveFormatSpec(id: ArchiveFormat): ArchiveFormatSpec | undefined {
  return ARCHIVE_FORMATS.find((spec) => spec.id === id)
}

/** Every MIME alias any supported archive is announced by. Used by the archive
 *  previewer's `supportedMimeTypes` and `canPreview`. */
export function allArchiveMimeTypes(): readonly string[] {
  return ARCHIVE_FORMATS.flatMap((spec) => spec.mimeTypes)
}

export function isArchiveMimeType(mimeType: string): boolean {
  return ARCHIVE_FORMATS.some((spec) => spec.mimeTypes.includes(mimeType))
}

/** Resolve the container format from a file name (+ optional MIME type).
 *  Extension wins over MIME and compound suffixes win over single ones, so
 *  `archive.tar.gz` announced as `application/gzip` still becomes `tgz`. */
export function resolveArchiveFormat(name: string, mimeType?: string): ArchiveFormat | undefined {
  const lower = name.toLowerCase()

  let best: ArchiveFormat | undefined
  let bestLength = 0
  for (const [extension, format] of EXTENSION_INDEX) {
    if (extension.length <= bestLength) continue
    if (lower.endsWith(extension)) {
      best = format
      bestLength = extension.length
    }
  }
  if (best) return best

  const declared = mimeType?.trim()
  if (declared) {
    for (const spec of ARCHIVE_FORMATS) {
      if (spec.mimeTypes.includes(declared)) return spec.id
    }
  }
  return undefined
}

/** Byte-level detection used as the final authority when the file name and MIME
 *  carry no format information (mislabeled or extension-less archives). Sniffed
 *  compression formats keep their plain id (`gz`, `xz`, …) — the provider later
 *  re-sniffs the decompressed payload for an embedded tar, so a nameless gzip of
 *  a tar behaves like `tgz` despite being detected as `gz`. */
export function sniffArchiveFormat(bytes: Uint8Array): ArchiveFormat | undefined {
  const at = (offset: number): number | undefined => (offset < bytes.length ? bytes[offset] : undefined)

  /* ZIP — `PK\x03\x04`, empty `PK\x05\x06`, spanning `PK\x07\x08`. */
  if (at(0) === 0x50 && at(1) === 0x4b && (at(2) === 0x03 || at(2) === 0x05 || at(2) === 0x07)) {
    return 'zip'
  }
  /* 7z — `7z\xBC\xAF\x27\x1C`. */
  if (at(0) === 0x37 && at(1) === 0x7a && at(2) === 0xbc && at(3) === 0xaf && at(4) === 0x27 && at(5) === 0x1c) {
    return '7z'
  }
  /* RAR4 `Rar!\x1A\x07\x00`, RAR5 `Rar!\x1A\x07\x01\x00`. */
  if (
    at(0) === 0x52 && at(1) === 0x61 && at(2) === 0x72 && at(3) === 0x21 &&
    at(4) === 0x1a && at(5) === 0x07 && (at(6) === 0x00 || at(6) === 0x01) && at(7) === 0x00
  ) {
    return 'rar'
  }
  /* CAB — `MSCF`. */
  if (at(0) === 0x4d && at(1) === 0x53 && at(2) === 0x43 && at(3) === 0x46) return 'cab'
  /* gzip — `\x1F\x8B`. */
  if (at(0) === 0x1f && at(1) === 0x8b) return 'gz'
  /* bzip2 — `BZh`. */
  if (at(0) === 0x42 && at(1) === 0x5a && at(2) === 0x68) return 'bz2'
  /* xz — `\xFD7zXZ\x00`. */
  if (at(0) === 0xfd && at(1) === 0x37 && at(2) === 0x7a && at(3) === 0x58 && at(4) === 0x5a && at(5) === 0x00) {
    return 'xz'
  }
  /* zstandard — `\x28\xB5\x2F\xFD`. */
  if (at(0) === 0x28 && at(1) === 0xb5 && at(2) === 0x2f && at(3) === 0xfd) return 'zst'
  /* Unix ar (`!<arch>\n`) — also the Deb binary-package container. */
  if (at(0) === 0x21 && at(1) === 0x3c && at(2) === 0x61 && at(3) === 0x72 && at(4) === 0x63 && at(5) === 0x68 && at(6) === 0x3e && at(7) === 0x0a) {
    return 'ar'
  }
  /* cpio — odc `070707`, newc `070701`, crc `070702` (7z variant `0707zz`). */
  const ascii = (off: number, len: number): string | undefined =>
    String.fromCharCode(...Array.from({ length: len }, (_, i) => at(off + i) ?? 0)).slice(0, len)
  const magic = ascii(0, 6)
  if (magic === '070701' || magic === '070702' || magic === '070707' || magic === '0707zz') return 'cpio'
  /* tar — ustar magic at offset 257. */
  if (bytes.length >= 263 && ascii(257, 5) === 'ustar') return 'tar'

  return undefined
}

/** Short human label for a format, for chrome like format badges. */
export function archiveFormatLabel(format: ArchiveFormat): string {
  return archiveFormatSpec(format)?.label ?? format.toUpperCase()
}

/** Strip the compression suffix off a compressed-archive name to derive the
 *  name of the single inner file (`archive.tar.gz` → `archive.tar`,
 *  `x.txt.xz` → `x.txt`) or `file` when nothing remains. Only the *compression*
 *  suffix is removed, never a compound `.tar.*` tail. Format ids that are
 *  containers (zip, 7z, rar, …) are returned unchanged. */
export function innerArchiveName(name: string, format: ArchiveFormat): string {
  if (format !== 'gz' && format !== 'tgz' && format !== 'bz2' && format !== 'tbz' && format !== 'xz' && format !== 'txz' && format !== 'zst' && format !== 'tzst') {
    return name
  }
  /* Longest-first so `.gzip`/`.zstd` are not clipped by `.gz`/`.zst`. */
  const suffixes = ['.gzip', '.bzip2', '.zstd', '.gz', '.bz2', '.xz', '.zst']
  const lower = name.toLowerCase()
  for (const suffix of suffixes) {
    if (lower.endsWith(suffix)) return name.slice(0, -suffix.length) || 'file'
  }
  return name
}