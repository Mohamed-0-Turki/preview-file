import { ZipReader, Uint8ArrayReader, Uint8ArrayWriter } from '@zip.js/zip.js'
import type { Entry } from '@zip.js/zip.js'
import { ArchivePasswordError, type ArchiveEntry, type ArchiveFormat, type ArchiveProvider } from './types.js'

type ReadableZipEntry = Entry & { directory: false } & {
  getData(writer: Uint8ArrayWriter, options?: { password?: string }): Promise<Uint8Array<ArrayBuffer>>
}

/** Collapse dots and drop segments that would escape the archive root. */
function sanitizePath(path: string): string {
  const out: string[] = []
  for (const segment of path.split('/')) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') continue
    out.push(segment)
  }
  return out.join('/')
}

function isPasswordError(error: unknown): boolean {
  const message = (error as Error | undefined)?.message ?? ''
  return message.includes('Invalid password') || message.includes('File contains encrypted entry')
}

/**
 * zip provider backed by @zip.js/zip.js.
 *
 * Listing never needs a password — the central directory is not encrypted —
 * so `list()` works on a password-less reader. Reading an encrypted entry
 * without a password throws "File contains encrypted entry"; with a wrong one
 * "Invalid password"; both are mapped to {@link ArchivePasswordError} so the
 * browser can route them to the password prompt. Unlock re-opens the archive
 * with a password after validating it against the first encrypted file member.
 */
export class ZipProvider implements ArchiveProvider {
  readonly format: ArchiveFormat = 'zip'

  private readonly bytes: Uint8Array
  private reader: ZipReader<Uint8Array> | undefined
  private readonly entryMap = new Map<string, Entry>()
  private entries: ArchiveEntry[] | undefined
  private _encrypted = false
  private password = ''

  constructor(bytes: Uint8Array) {
    this.bytes = bytes
  }

  get encrypted(): boolean {
    return this._encrypted
  }

  isLocked(): boolean {
    return this._encrypted && this.password === ''
  }

  private async openReader(givenPassword?: string): Promise<ZipReader<Uint8Array>> {
    const reader = new ZipReader<Uint8Array>(new Uint8ArrayReader(this.bytes), givenPassword ? { password: givenPassword } : {})
    const remote = await reader.getEntries()
    this.entryMap.clear()
    for (const entry of remote) this.entryMap.set(sanitizePath(entry.filename.replace(/\\/g, '/')), entry)
    return reader
  }

  async list(): Promise<ArchiveEntry[]> {
    if (this.entries) return this.entries
    this.reader ??= await this.openReader()

    const listed: ArchiveEntry[] = []
    for (const entry of this.entryMap.values()) {
      const path = sanitizePath(entry.filename.replace(/\\/g, '/'))
      if (!path) continue
      let kind: ArchiveEntry['kind'] = 'file'
      if (entry.directory || path.endsWith('/')) kind = 'directory'
      else if (entry.symlink) kind = 'symlink'
      listed.push({
        path,
        name: path.split('/').pop() ?? path,
        kind,
        size: entry.uncompressedSize ?? 0,
        mtime: entry.lastModDate?.getTime(),
        encrypted: entry.encrypted,
      })
    }

    this._encrypted = listed.some((entry) => entry.encrypted)
    this.entries = listed
    return listed
  }

  async unlock(password: string): Promise<boolean> {
    if (!this._encrypted) return true
    if (password === '') return false

    const candidate = await this.openReader(password)
    try {
      const target = [...this.entryMap.values()].find((entry) => entry.encrypted && !entry.directory)
      if (!target) {
        /* Every protected member is a directory; nothing to validate against. */
      } else {
        await this.readEntryData(target, password)
      }
    } catch (error) {
      if (isPasswordError(error)) {
        await this.closeReader(candidate)
        return false
      }
      await this.closeReader(candidate)
      throw error
    }

    await this.closeReader(this.reader)
    this.reader = candidate
    this.password = password
    return true
  }

  async read(path: string): Promise<Uint8Array> {
    if (!this.entryMap.size) {
      this.reader ??= await this.openReader()
    }
    const entry = this.entryMap.get(path)
    if (!entry) {
      throw new ArchivePasswordError(`File not found in archive: ${path}`)
    }
    try {
      return await this.readEntryData(entry, this.password || undefined)
    } catch (error) {
      if (isPasswordError(error)) throw new ArchivePasswordError()
      throw error
    }
  }

  private async readEntryData(entry: Entry, password?: string): Promise<Uint8Array<ArrayBuffer>> {
    const fileEntry = entry as ReadableZipEntry
    return fileEntry.getData(new Uint8ArrayWriter(), { password })
  }

  private async closeReader(reader: ZipReader<Uint8Array> | undefined): Promise<void> {
    if (!reader) return
    await reader.close().catch(() => undefined)
  }

  dispose(): void {
    void this.closeReader(this.reader)
    this.reader = undefined
    this.entryMap.clear()
  }
}