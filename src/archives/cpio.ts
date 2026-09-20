import type { ArchiveEntry, ArchiveFormat, ArchiveProvider } from './types.js'

/**
 * In-memory provider for the cpio archive family (newc, crc and odc formats
 * are covered — the same byte layout newc/crc share and the compact ASCII odc
 * variant; legacy binary "crc old" and the empty `0707zz` are recognised by
 * detection but not streamed). Content is sliced out of the source buffer on
 * demand.
 */

interface CpioVariant {
  magic: string
  header: number
  pad: number
  /** ASCII-hex field offsets and widths within the header. */
  mode: readonly [number, number]
  mtime: readonly [number, number]
  namesize: readonly [number, number]
  filesize: readonly [number, number]
}

const VARIANTS: readonly CpioVariant[] = [
  {
    magic: '070701',
    header: 110,
    pad: 4,
    mode: [14, 8],
    mtime: [46, 8],
    namesize: [94, 8],
    filesize: [54, 8],
  }, /* newc */
  {
    magic: '070702',
    header: 110,
    pad: 4,
    mode: [14, 8],
    mtime: [46, 8],
    namesize: [94, 8],
    filesize: [54, 8],
  }, /* crc */
  {
    magic: '070707',
    header: 76,
    pad: 2,
    mode: [18, 6],
    mtime: [48, 11],
    namesize: [59, 6],
    filesize: [65, 11],
  }, /* odc (ASCII, octal fields) */
]

const TRAILER = 'TRAILER!!!'

function asciiField(bytes: Uint8Array, offset: number, length: number, radix: number): number {
  let text = ''
  for (let index = 0; index < length; index += 1) {
    text += String.fromCharCode(bytes[offset + index] ?? 0)
  }
  const value = Number.parseInt(text.trim(), radix)
  return Number.isNaN(value) ? 0 : value
}

function textField(bytes: Uint8Array, offset: number, length: number): string {
  let out = ''
  for (let index = 0; index < length; index += 1) {
    const char = bytes[offset + index]
    if (char === 0) break
    out += String.fromCharCode(char)
  }
  return out
}

export function looksLikeCpio(bytes: Uint8Array): boolean {
  const prefix = textField(bytes, 0, 6)
  return VARIANTS.some((variant) => variant.magic === prefix) || prefix === '0707zz'
}

function padTo(value: number, alignment: number): number {
  return Math.ceil(value / alignment) * alignment
}

/** Parse a cpio buffer into entries with absolute content offsets. */
export function parseCpio(bytes: Uint8Array): { path: string; kind: ArchiveEntry['kind']; size: number; mtime?: number; offset: number }[] {
  const entries: { path: string; kind: ArchiveEntry['kind']; size: number; mtime?: number; offset: number }[] = []
  let offset = 0
  let sawMagic = false

  while (offset + VARIANTS[0]!.header <= bytes.length) {
    const magic = textField(bytes, offset, 6)
    const variant = VARIANTS.find((candidate) => candidate.magic === magic)
    if (!variant) {
      if (!sawMagic) throw new Error('Not a valid CPIO archive')
      break
    }
    sawMagic = true
    const base = offset + variant.header

    const [modeOffset, modeWidth] = variant.mode
    const [mtimeOffset, mtimeWidth] = variant.mtime
    const [nameSizeOffset, nameSizeWidth] = variant.namesize
    const [sizeOffset, sizeWidth] = variant.filesize
    /* odc stores values in octal, newc/crc in hexadecimal. */
    const radix = variant.header === 76 ? 8 : 16

    const mode = asciiField(bytes, offset + modeOffset, modeWidth, radix)
    const mtime = asciiField(bytes, offset + mtimeOffset, mtimeWidth, radix)
    const nameSize = asciiField(bytes, offset + nameSizeOffset, nameSizeWidth, radix)
    const fileSize = asciiField(bytes, offset + sizeOffset, sizeWidth, radix)

    if (nameSize <= 0) break
    const nameOffset = base
    const name = textField(bytes, nameOffset, nameSize - 1)
    const dataOffset = padTo(base + nameSize, variant.pad)
    if (dataOffset > bytes.length) break

    if (name === TRAILER) break

    const type = mode & 0o170000
    let kind: ArchiveEntry['kind'] = 'file'
    if (type === 0o040000) kind = 'directory'
    else if (type === 0o120000) kind = 'symlink'
    else if (type !== 0o100000 && type !== 0) {
      /* device, fifo, socket — no previewable body */
      offset = padTo(dataOffset + fileSize, variant.pad)
      continue
    }

    if (!name) {
      offset = padTo(dataOffset + fileSize, variant.pad)
      continue
    }

    entries.push({ path: name, kind, size: fileSize, mtime, offset: dataOffset })
    offset = padTo(dataOffset + fileSize, variant.pad)
  }

  if (!entries.length) throw new Error('Not a valid CPIO archive')
  return entries
}

export class CpioProvider implements ArchiveProvider {
  readonly format: ArchiveFormat = 'cpio'

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
    const members = parseCpio(this.bytes)
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