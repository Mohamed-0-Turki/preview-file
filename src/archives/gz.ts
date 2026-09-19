import { gunzipSync } from 'fflate'
import { looksLikeTar, parseTar } from './tar.js'
import type { ArchiveEntry, ArchiveFormat, ArchiveProvider } from './types.js'

/** Provider for a bare `.gz` file. The payload is decompressed once, then
 *  either parsed as a tar (many gz files are compressed tars without the
 *  double extension) or presented as a single inner file. */
export class GzProvider implements ArchiveProvider {
  readonly format: ArchiveFormat = 'gz'

  private readonly decompressed: Uint8Array
  private readonly innerName: string
  private readonly locations = new Map<string, { offset: number; size: number }>()
  private entries: ArchiveEntry[] | undefined

  constructor(bytes: Uint8Array, innerName: string) {
    this.decompressed = gunzipSync(bytes)
    this.innerName = innerName
  }

  get encrypted(): boolean {
    return false
  }

  isLocked(): boolean {
    return false
  }

  async list(): Promise<ArchiveEntry[]> {
    if (this.entries) return this.entries

    if (looksLikeTar(this.decompressed)) {
      const members = parseTar(this.decompressed)
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
        size: this.decompressed.length,
      },
    ]
    return this.entries
  }

  async read(path: string): Promise<Uint8Array> {
    await this.list()
    const location = this.locations.get(path)
    if (location) {
      return this.decompressed.slice(location.offset, location.offset + location.size)
    }
    if (path === this.innerName) {
      return this.decompressed.slice()
    }
    throw new Error(`File not found in archive: ${path}`)
  }

  async unlock(_password: string): Promise<boolean> {
    return true
  }

  dispose(): void {
    this.locations.clear()
    this.entries = undefined
  }
}