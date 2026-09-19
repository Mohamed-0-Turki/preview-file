import type { ArchiveEntry } from './types.js'

const BLOCK = 512

/** A parsed tar member with the absolute byte offset of its content within the
 *  source buffer, so providers can slice the bytes back out lazily. */
export interface TarMember extends ArchiveEntry {
  readonly offset: number
}

/** Decode a NUL-terminated ASCII/UTF-8 field from a tar header. */
function readField(bytes: Uint8Array, offset: number, length: number): string {
  let end = offset
  const limit = Math.min(offset + length, bytes.length)
  while (end < limit && bytes[end] !== 0) end += 1
  return new TextDecoder().decode(bytes.subarray(offset, end)).trim()
}

/** Parse a numeric tar field. Supports octal ASCII with leading NUL/space
 *  padding (the classic layout) and GNU's base-256 encoding for values that
 *  do not fit octal. */
function parseNumeric(field: Uint8Array): number | undefined {
  if ((field[0] ?? 0) & 0x80) {
    let value = (field[0] ?? 0) & 0x7f
    for (let index = 1; index < field.length; index += 1) {
      value = value * 256 + (field[index] ?? 0)
    }
    return value
  }
  const text = readField(field, 0, field.length)
  if (!text) return undefined
  const value = Number.parseInt(text, 8)
  return Number.isNaN(value) ? undefined : value
}

/** Sum of a 512-byte header block with the checksum field treated as spaces,
 *  which is how the stored checksum is computed. */
function headerSum(block: Uint8Array): number {
  const copy = block.slice()
  for (let index = 148; index < 156; index += 1) copy[index] = 0x20
  let sum = 0
  for (const byte of copy) sum += byte
  return sum
}

function checksumValid(block: Uint8Array): boolean {
  const checksum = parseNumeric(block.subarray(148, 156))
  return typeof checksum !== 'undefined' && checksum === headerSum(block)
}

/** Quick structural check used to tell an actual tar file from a bare gzip
 *  of non-tar data: either the ustar magic is present or the header checksum
 *  validates. */
export function looksLikeTar(bytes: Uint8Array): boolean {
  if (bytes.length < BLOCK) return false
  const block = bytes.subarray(0, BLOCK)
  if (readField(bytes, 257, 6).startsWith('ustar')) return true
  return checksumValid(block)
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

interface PaxRecords {
  path?: string
  linkpath?: string
  size?: number
}

/** Parse a PAX extended header body: a series of ``<len> <key>=<value>\n``
 *  records (record size includes its own length prefix). */
function parsePax(body: string): PaxRecords {
  const records: PaxRecords = {}
  let rest = body
  while (rest) {
    const match = /^(\d+)\s/.exec(rest)
    if (!match) break
    const length = Number.parseInt(match[1] as string, 10)
    if (length <= 0) break
    const record = rest.slice(0, length).trim()
    const sep = record.indexOf('=')
    rest = rest.slice(length)
    if (sep <= 0) continue
    const key = record.slice(0, sep)
    const value = record.slice(sep + 1)
    if (key === 'path') records.path = value
    else if (key === 'linkpath') records.linkpath = value
    else if (key === 'size') records.size = Number(value)
  }
  return records
}

function isZeroBlock(block: Uint8Array): boolean {
  for (const byte of block) {
    if (byte !== 0) return false
  }
  return true
}

/** Parse a (possibly gzip-decompressed) tar archive into a flat entry list.
 *  Supports ustar/POSIX, GNU long-name/long-link pseudo entries and PAX
 *  extended headers, falling back to lenient V7 parsing when no magic is
 *  present. Non-file payloads (devices, FIFOs, GNU sparse/dump entries) are
 *  skipped by design — they hold no previewable content. */
export function parseTar(bytes: Uint8Array): TarMember[] {
  const entries: TarMember[] = []
  let offset = 0
  let pendingName: string | undefined
  let pendingLink: string | undefined
  let pendingSize: number | undefined
  let sawHeader = false

  while (offset + BLOCK <= bytes.length) {
    const block = bytes.subarray(offset, offset + BLOCK)
    if (isZeroBlock(block)) break

    const type = String.fromCharCode(block[156] ?? 0)
    const size = pendingSize ?? parseNumeric(block.subarray(124, 136)) ?? 0
    const dataOffset = offset + BLOCK
    const next = dataOffset + Math.ceil(size / BLOCK) * BLOCK
    if (next > bytes.length) break

    const data = bytes.subarray(dataOffset, Math.min(next, bytes.length))

    /* Pseudo entries that describe the next real entry. */
    if (type === 'L' || type === 'K') {
      const value = new TextDecoder().decode(data).replace(/\0+$/, '')
      if (type === 'L') pendingName = value
      else pendingLink = value
      pendingSize = undefined
      offset = next
      continue
    }

    if (type === 'x' || type === 'g') {
      if (type === 'x') {
        const pax = parsePax(new TextDecoder().decode(data))
        if (pax.path) pendingName = pax.path
        if (pax.linkpath) pendingLink = pax.linkpath
        pendingSize = pax.size
      }
      offset = next
      continue
    }

    /* Skipped content types: device files, FIFOs, GNU sparse/dump/incremental.
       They either have no viewable body or need non-trivial reconstruction. */
    if (type === '3' || type === '4' || type === '6' || type === 'S' || type === 'D' || type === 'I' || type === 'V') {
      pendingSize = undefined
      offset = next
      continue
    }

    sawHeader = true
    const prefix = readField(block, 345, 155)
    const rawName = readField(block, 0, 100)
    const name = pendingName ?? (prefix ? `${prefix}/${rawName}` : rawName)
    const linkPath = pendingLink ?? (readField(block, 157, 100) || undefined)
    const path = sanitizePath(name)
    pendingName = undefined
    pendingLink = undefined
    pendingSize = undefined

    if (!path) {
      offset = next
      continue
    }

    let kind: ArchiveEntry['kind'] = 'file'
    if (type === '5') kind = 'directory'
    else if (type === '2') kind = 'symlink'
    else if (type === '1') kind = 'hardlink'

    entries.push({
      path,
      name: path.split('/').pop() ?? path,
      kind,
      size: size,
      mtime: parseNumeric(block.subarray(136, 148)),
      linkPath,
      offset: dataOffset,
    })
    offset = next
  }

  if (!sawHeader) {
    throw new Error('Not a valid TAR archive')
  }
  return entries
}