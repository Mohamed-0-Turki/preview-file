import { parseTar } from './tar.js'
import type { ArchiveEntry, ArchiveFormat, ArchiveProvider } from './types.js'

/** In-memory provider over an already-decompressed tar buffer (plain `.tar`
 *  and gunzipped `.tar.gz`/`.tgz`). Entry content is sliced out of the buffer
 *  on demand — no per-file extraction. */
export class TarProvider implements ArchiveProvider {
  readonly format: ArchiveFormat

  private readonly bytes: Uint8Array
  private readonly locations = new Map<string, { offset: number; size: number }>()
  private entries: ArchiveEntry[] | undefined

  constructor(bytes: Uint8Array, format: 'tar' | 'tgz' | 'tbz' | 'txz' | 'tzst') {
    this.bytes = bytes
    this.format = format
  }

  get encrypted(): boolean {
    return false
  }

  async requiresPassword(): Promise<boolean> {
    return false
  }

  isLocked(): boolean {
    return false
  }

  async list(): Promise<ArchiveEntry[]> {
    if (this.entries) return this.entries
    const members = parseTar(this.bytes)
    for (const member of members) {
      this.locations.set(member.path, { offset: member.offset, size: member.size })
    }
    this.entries = members
    return members
  }

  async read(path: string): Promise<Uint8Array> {
    await this.list()
    const location = this.locations.get(path)
    if (!location) throw new Error(`File not found in archive: ${path}`)
    return this.bytes.slice(location.offset, location.offset + location.size)
  }

  async unlock(_password: string): Promise<boolean> {
    return true
  }

  dispose(): void {
    this.locations.clear()
    this.entries = undefined
  }
}