import type { ArchiveEntry, ArchiveFormat, ArchiveProvider } from './types.js'

/**
 * In-memory provider for Unix `ar` archives, which is the container format of
 * Debian `.deb` packages. Covers all four GNU long-name schemes — plain
 * truncated names, the `//` long-name table with `/offset` references, BSD
 * `#1/length` extended names and the trailing-slash convention — plus symbol
 * tables (`/`) that are skipped. Content is sliced out of the source buffer on
 * demand.
 */

const AR_MAGIC = '!<arch>\n'

export function looksLikeAr(bytes: Uint8Array): boolean {
  if (bytes.length < 8) return false
  for (let index = 0; index < 8; index += 1) {
    if (String.fromCharCode(bytes[index]!) !== AR_MAGIC[index]) return false
  }
  return true
}

function textField(bytes: Uint8Array, offset: number, length: number): string {
  let out = ''
  for (let index = 0; index < length; index += 1) {
    const char = bytes[offset + index]
    if (char === 0 || char === 0x20) break /* NUL or space padding */
    out += String.fromCharCode(char)
  }
  return out.trim()
}

/** Exact-length name field (BSD extended names): stop only at NUL, keep inner
 *  spaces. */
function nameField(bytes: Uint8Array, offset: number, length: number): string {
  let out = ''
  for (let index = 0; index < length; index += 1) {
    const char = bytes[offset + index]
    if (char === 0) break
    out += String.fromCharCode(char)
  }
  return out
}

function octalField(bytes: Uint8Array, offset: number, length: number): number {
  const value = Number.parseInt(textField(bytes, offset, length), 8)
  return Number.isNaN(value) ? 0 : value
}

function padEven(value: number): number {
  return value % 2 === 0 ? value : value + 1
}

export interface ArMember {
  path: string
  kind: ArchiveEntry['kind']
  size: number
  mtime?: number
  offset: number
}

/** Parse an `ar`/`deb` buffer, resolving GNU and BSD extended names. */
export function parseAr(bytes: Uint8Array): ArMember[] {
  if (!looksLikeAr(bytes)) throw new Error('Not a valid AR archive')
  const entries: ArMember[] = []
  let longNames: string[] | undefined
  let offset = 8

  while (offset + 60 <= bytes.length) {
    const header = bytes.subarray(offset, offset + 60)
    if (header[58] !== 0x60 || header[59] !== 0x0a) break /* `\n terminator */

    const rawName = textField(header, 0, 16)
    const size = Number.parseInt(textField(bytes, offset + 48, 10), 10) || 0
    const mtime = octalField(bytes, offset + 16, 12)
    const mode = octalField(bytes, offset + 40, 8)
    const dataOffset = offset + 60
    const next = dataOffset + padEven(size)
    if (dataOffset + size > bytes.length) break

    const data = bytes.subarray(dataOffset, dataOffset + size)

    /* Symbol tables and the long-name table itself. */
    if (rawName === '/' || rawName.startsWith('/SYM64')) {
      offset = next
      continue
    }
    if (rawName === '//') {
      longNames = decodeLongNameTable(data)
      offset = next
      continue
    }

    const gnuRef = /^\/(\d+)$/.exec(rawName)
    if (gnuRef) {
      if (!longNames) break
      /* GNU flag fields are one-based: `/1` is the first table entry. */
      const name = longNames[Number.parseInt(gnuRef[1]!, 10) - 1]
      if (name === undefined) break
      const type = mode & 0o170000
      const kind: ArchiveEntry['kind'] = type === 0o040000 ? 'directory' : 'file'
      if (!name) {
        offset = next
        continue
      }
      entries.push({ path: name, kind, size, mtime, offset: dataOffset })
      offset = next
      continue
    }

    const bsdRef = /^#1\/(\d+)$/.exec(rawName)
    if (bsdRef) {
      const nameLength = Number.parseInt(bsdRef[1]!, 10)
      const name = nameField(data, 0, nameLength)
      const contentOffset = dataOffset + nameLength
      const contentSize = size - nameLength
      const type = mode & 0o170000
      const kind: ArchiveEntry['kind'] = type === 0o040000 ? 'directory' : 'file'
      if (!name) {
        offset = next
        continue
      }
      entries.push({ path: name, kind, size: Math.max(0, contentSize), mtime, offset: contentOffset })
      offset = next
      continue
    }

    const name = rawName.endsWith('/') ? rawName.slice(0, -1) : rawName
    const type = mode & 0o170000
    const kind: ArchiveEntry['kind'] = type === 0o040000 ? 'directory' : 'file'
    if (!name) {
      offset = next
      continue
    }
    entries.push({ path: name, kind, size, mtime, offset: dataOffset })
    offset = next
  }

  if (!entries.length) throw new Error('Not a valid AR archive')
  return entries
}

/** Decode the GNU `ar` `//` long-name table (NUL-delimited names, each
 *  conventionally terminated by a slash then a newline before the NUL). */
function decodeLongNameTable(data: Uint8Array): string[] {
  const joined = new TextDecoder().decode(data)
  const names: string[] = []
  let start = 0
  for (let index = 0; index <= joined.length; index += 1) {
    if (joined[index] === '\0' || index === joined.length) {
      const segment = joined.slice(start, index)
      if (segment) names.push(segment.replace(/\s+$/, '').replace(/\/$/, ''))
      start = index + 1
    }
  }
  return names
}

export class ArProvider implements ArchiveProvider {
  readonly format: ArchiveFormat = 'ar'

  private readonly bytes: Uint8Array
  private readonly locations = new Map<string, { offset: number; size: number }>()
  private entries: ArchiveEntry[] | undefined

  constructor(bytes: Uint8Array) {
    this.bytes = bytes
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
    const members = parseAr(this.bytes)
    for (const member of members) {
      this.locations.set(member.path, { offset: member.offset, size: member.size })
    }
    this.entries = members.map((member) => ({
      path: member.path,
      name: member.path.split('/').pop() ?? member.path,
      kind: member.kind,
      size: member.size,
      mtime: member.mtime,
    }))
    return this.entries
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