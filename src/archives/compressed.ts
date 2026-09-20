import { looksLikeTar, parseTar } from './tar.js'
import type { ArchiveEntry, ArchiveFormat, ArchiveProvider } from './types.js'

const COMPRESSED_FORMATS: readonly ArchiveFormat[] = ['gz', 'tgz', 'bz2', 'tbz', 'xz', 'txz', 'zst', 'tzst']

/** Provider for a compression wrapper whose payload is either a tar archive or
 *  a single file: `.gz`/`.tgz`, `.bz2`/`.tbz`, `.xz`/`.txz`, `.zst`/`.tzst`.
 *
 *  The payload is decompressed (lazily, once — the loader may be async, e.g.
 *  wasm-backed xz/zstd) and then inspected: if it is a tar it is browsable as a
 *  tar (covers `.tar.gz`, `.tar.bz2`, `.tar.xz`, `.tar.zst` and bare
 *  gzip/bzip2/xz/zstd-of-tar); otherwise it is presented as one inner file.
 */
export abstract class CompressedProvider implements ArchiveProvider {
  readonly format: ArchiveFormat

  private readonly innerName: string
  private readonly locations = new Map<string, { offset: number; size: number }>()
  private entries: ArchiveEntry[] | undefined
  private decompressed: Uint8Array | undefined

  protected constructor(format: ArchiveFormat, innerName: string) {
    this.format = format
    this.innerName = innerName
  }

  /** Decompress the payload. Called at most once, on first `list()`. */
  protected abstract decompress(): Promise<Uint8Array> | Uint8Array

  get encrypted(): boolean {
    return false
  }

  async requiresPassword(): Promise<boolean> {
    return false
  }

  isLocked(): boolean {
    return false
  }

  private async ensureLoaded(): Promise<Uint8Array> {
    if (!this.decompressed) {
      this.decompressed = await this.decompress()
    }
    return this.decompressed
  }

  async list(): Promise<ArchiveEntry[]> {
    if (this.entries) return this.entries

    const payload = await this.ensureLoaded()
    if (looksLikeTar(payload)) {
      const members = parseTar(payload)
      for (const member of members) {
        this.locations.set(member.path, { offset: member.offset, size: member.size })
      }
      this.entries = members
      return members
    }

    this.entries = [
      {
        path: this.innerName,
        name: this.innerName,
        kind: 'file',
        size: payload.length,
      },
    ]
    return this.entries
  }

  async read(path: string): Promise<Uint8Array> {
    await this.list()
    const payload = this.decompressed as Uint8Array
    const location = this.locations.get(path)
    if (location) {
      return payload.slice(location.offset, location.offset + location.size)
    }
    if (path === this.innerName) {
      return payload.slice()
    }
    throw new Error(`File not found in archive: ${path}`)
  }

  async unlock(_password: string): Promise<boolean> {
    return true
  }

  dispose(): void {
    this.locations.clear()
    this.entries = undefined
    this.decompressed = undefined
  }
}

/** True for format ids that are compression wrappers (single-inner-file
 *  containers) rather than standalone listing formats. */
export function isCompressedFormat(format: ArchiveFormat): boolean {
  return COMPRESSED_FORMATS.includes(format)
}