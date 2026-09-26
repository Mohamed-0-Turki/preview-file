import { createArchiveProvider } from '../archives/index.js'
import type { ArchiveProvider } from '../archives/types.js'
import { OoxmlError } from './errors.js'
import { attr, childrenOf, NS, parseXmlOrNull } from './xml.js'

/** The three Office families this engine understands. */
export type OfficeKind = 'word' | 'excel' | 'presentation'

export interface OfficePackagePart {
  /** Normalized part name, no leading slash (e.g. `word/document.xml`). */
  readonly name: string
  readonly contentType: string
  readonly size: number
}

export interface OfficeRelationship {
  readonly id: string
  /** Relationship type URI; its last segment identifies the role. */
  readonly type: string
  /** Raw target exactly as authored (may be relative, absolute or external). */
  readonly target: string
  readonly external: boolean
  /** Absolute in-package part name, for internal relationships only. */
  readonly partName?: string
}

/** OLE2 / Compound File Binary signature: encrypted or legacy binary Office. */
const CFB_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]

export function isCompoundFile(bytes: Uint8Array): boolean {
  if (bytes.length < CFB_MAGIC.length) return false
  for (let i = 0; i < CFB_MAGIC.length; i += 1) {
    if (bytes[i] !== CFB_MAGIC[i]) return false
  }
  return true
}

/** Collapse `.`/`..` and drop the leading slash so part names compare by value. */
export function normalizePartName(name: string): string {
  const segments: string[] = []
  for (const raw of name.split('/')) {
    if (raw === '' || raw === '.') continue
    if (raw === '..') {
      segments.pop()
      continue
    }
    segments.push(raw)
  }
  return segments.join('/')
}

function directoryOf(part: string): string {
  const slash = part.lastIndexOf('/')
  return slash === -1 ? '' : part.slice(0, slash)
}

function relsPartFor(part: string): string {
  const folder = directoryOf(part)
  const file = part.slice(folder === '' ? 0 : folder.length + 1)
  return folder === '' ? `_rels/${file}.rels` : `${folder}/_rels/${file}.rels`
}

function isExternalTarget(target: string, mode: string | undefined): boolean {
  if (mode === 'External') return true
  return /^[a-z][a-z0-9+.-]*:\s*\/\//i.test(target)
}

/**
 * Resolve a relationship target against the part that declared it. Targets are
 * relative to the declaring part's folder, may be absolute (`/word/x.xml`) and
 * routinely contain `..` segments (`../media/image1.png`) that must be
 * collapsed — otherwise media in chart and footnote parts silently fails to
 * resolve.
 */
export function resolvePartName(fromPart: string, target: string): string {
  let path = target.split('#')[0]?.split('?')[0] ?? ''
  if (path === '') return ''
  try {
    path = decodeURIComponent(path)
  } catch {
    /* A malformed escape is more useful verbatim than as a thrown error. */
  }
  if (path.startsWith('/')) return normalizePartName(path)
  const folder = directoryOf(fromPart)
  return normalizePartName(folder === '' ? path : `${folder}/${path}`)
}

const KIND_BY_MAIN_PART: ReadonlyArray<readonly [string, OfficeKind]> = [
  ['word/document.xml', 'word'],
  ['xl/workbook.xml', 'excel'],
  ['ppt/presentation.xml', 'presentation'],
]

/**
 * The order in which a part inherits formatting from the parts around it.
 * PowerPoint uses the full chain; Word and Excel reach their theme directly, so
 * these hops are simply absent for them.
 */
const INHERITANCE_CHAIN: readonly string[] = [
  '/slideLayout',
  '/slideMaster',
  '/notesMaster',
  '/handoutMaster',
  '/theme',
]

function parseRelationships(root: Element | null, fromPart: string): OfficeRelationship[] {
  if (!root) return []
  const out: OfficeRelationship[] = []
  for (const rel of childrenOf(root, 'Relationship', NS.rel)) {
    const id = attr(rel, 'Id')
    const type = attr(rel, 'Type')
    const target = attr(rel, 'Target')
    if (!id || !type || target === undefined) continue
    const mode = attr(rel, 'TargetMode')
    const external = isExternalTarget(target, mode)
    out.push({
      id,
      type,
      target,
      external,
      partName: external ? undefined : resolvePartName(fromPart, target),
    })
  }
  return out
}

function parseContentTypes(root: Element | null): {
  defaults: Map<string, string>
  overrides: Map<string, string>
} {
  const defaults = new Map<string, string>()
  const overrides = new Map<string, string>()
  if (!root) return { defaults, overrides }
  for (const node of childrenOf(root)) {
    if (node.localName === 'Default') {
      const extension = attr(node, 'Extension')
      const contentType = attr(node, 'ContentType')
      if (extension && contentType) defaults.set(extension.toLowerCase(), contentType)
    } else if (node.localName === 'Override') {
      const partName = attr(node, 'PartName')
      const contentType = attr(node, 'ContentType')
      if (partName && contentType) overrides.set(normalizePartName(partName), contentType)
    }
  }
  return { defaults, overrides }
}

const decoder = new TextDecoder('utf-8')

/**
 * A read-only OPC (Open Packaging Conventions) package: the ZIP plus
 * `[Content_Types].xml`, the relationship graph, and per-part decode caches.
 *
 * This is the *only* place the engine touches bytes. It knows nothing about
 * documents, themes or rendering; consumers ask for parts and relationships.
 * ZIP reading is delegated to the package's shared archive layer, so the
 * codebase keeps exactly one zip implementation.
 */
export class OfficePackage {
  readonly name: string
  readonly kind: OfficeKind
  readonly mainPart: string

  private readonly provider: ArchiveProvider
  private readonly sizes = new Map<string, number>()
  private readonly defaults = new Map<string, string>()
  private readonly overrides = new Map<string, string>()
  private readonly relsCache = new Map<string, OfficeRelationship[]>()
  private readonly xmlCache = new Map<string, Element | null>()
  private readonly textCache = new Map<string, string | null>()
  private readonly bytesCache = new Map<string, Uint8Array>()
  private readonly rootRels: readonly OfficeRelationship[]
  private disposed = false

  private constructor(
    name: string,
    provider: ArchiveProvider,
    kind: OfficeKind,
    mainPart: string,
    sizes: Map<string, number>,
    defaults: Map<string, string>,
    overrides: Map<string, string>,
    rootRelationships: OfficeRelationship[]
  ) {
    this.name = name
    this.provider = provider
    this.kind = kind
    this.mainPart = mainPart
    this.sizes = sizes
    this.defaults = defaults
    this.overrides = overrides
    this.rootRels = rootRelationships
  }

  static async open(bytes: Uint8Array, name: string): Promise<OfficePackage> {
    if (isCompoundFile(bytes)) {
      throw new OoxmlError(
        'encrypted',
        'This file is an OLE2 compound document — it is either password-protected or a legacy binary Office file, neither of which can be rendered in the browser.'
      )
    }

    let provider: ArchiveProvider
    let entries
    try {
      provider = createArchiveProvider(bytes, 'zip', name)
      entries = await provider.list()
    } catch (error) {
      throw new OoxmlError('not-a-package', `"${name}" is not a readable Office package (${(error as Error).message}).`)
    }

    const sizes = new Map<string, number>()
    for (const entry of entries) {
      if (entry.kind === 'file') sizes.set(entry.path, entry.size)
    }

    const readOptional = async (part: string): Promise<string | null> => {
      if (!sizes.has(part)) return null
      try {
        return decoder.decode(await provider.read(part))
      } catch {
        return null
      }
    }

    const { defaults, overrides } = parseContentTypes(
      parseXmlOrNull(await readOptional('[Content_Types].xml'), '[Content_Types].xml')
    )
    const rootRels = parseRelationships(parseXmlOrNull(await readOptional('_rels/.rels'), '_rels/.rels'), '')

    const declared = rootRels.find((rel) => rel.type.endsWith('/officeDocument') && rel.partName)
    const mainPart = declared?.partName ?? KIND_BY_MAIN_PART.find(([part]) => sizes.has(part))?.[0] ?? null
    if (mainPart === null || !sizes.has(mainPart)) {
      provider.dispose()
      throw new OoxmlError(
        'unsupported-format',
        `"${name}" is a ZIP archive, but not an Office document (no officeDocument relationship).`
      )
    }
    const kind = KIND_BY_MAIN_PART.find(([part]) => part === mainPart)?.[1]
    if (kind === undefined) {
      provider.dispose()
      throw new OoxmlError(
        'unsupported-format',
        `"${name}" is not a Word, Excel or PowerPoint document (main part "${mainPart}").`
      )
    }

    return new OfficePackage(name, provider, kind, mainPart, sizes, defaults, overrides, rootRels)
  }

  /** The package-level relationship graph (`/_rels/.rels`). */
  get rootRelationships(): readonly OfficeRelationship[] {
    return this.rootRels
  }

  partNames(): string[] {
    return [...this.sizes.keys()]
  }

  /** Every part with its resolved content type, for diagnostics and listings. */
  parts(): OfficePackagePart[] {
    return [...this.sizes.keys()].map((name) => ({
      name,
      contentType: this.contentTypeOf(name),
      size: this.sizes.get(name) ?? 0,
    }))
  }

  has(part: string): boolean {
    return this.sizes.has(normalizePartName(part))
  }

  partSize(part: string): number {
    return this.sizes.get(normalizePartName(part)) ?? 0
  }

  contentTypeOf(part: string): string {
    const name = normalizePartName(part)
    const override = this.overrides.get(name)
    if (override !== undefined) return override
    const dot = name.lastIndexOf('.')
    const extension = dot === -1 ? '' : name.slice(dot + 1).toLowerCase()
    return this.defaults.get(extension) ?? ''
  }

  async bytes(part: string): Promise<Uint8Array> {
    const name = normalizePartName(part)
    if (this.disposed) throw new OoxmlError('parse-failed', 'This document package has been closed.', name)
    const cached = this.bytesCache.get(name)
    if (cached) return cached
    if (!this.sizes.has(name)) {
      throw new OoxmlError('missing-part', `The package has no part "${name}".`, name)
    }
    const data = await this.provider.read(name)
    this.bytesCache.set(name, data)
    return data
  }

  async text(part: string): Promise<string | null> {
    const name = normalizePartName(part)
    if (this.textCache.has(name)) return this.textCache.get(name) ?? null
    if (!this.sizes.has(name)) return null
    const value = decoder.decode(await this.bytes(name))
    this.textCache.set(name, value)
    return value
  }

  async xml(part: string): Promise<Element | null> {
    const name = normalizePartName(part)
    if (this.xmlCache.has(name)) return this.xmlCache.get(name) ?? null
    const root = parseXmlOrNull(await this.text(name), name)
    this.xmlCache.set(name, root)
    return root
  }

  /** Parse a part that must exist; a missing one is a hard, attributable error. */
  async requireXml(part: string): Promise<Element> {
    const name = normalizePartName(part)
    const source = await this.text(name)
    if (source === null) {
      throw new OoxmlError('missing-part', `The package is missing the required part "${name}".`, name)
    }
    return parseXmlOrNull(source, name) as Element
  }

  /**
   * Relationship graph declared by `part` (`''` for the package root). Parsed
   * once and cached: theme, style, numbering, header/footer and media lookups
   * all funnel through here.
   */
  async relationships(part: string): Promise<readonly OfficeRelationship[]> {
    const name = normalizePartName(part)
    const cached = this.relsCache.get(name)
    if (cached) return cached
    const rels = parseRelationships(await this.xml(relsPartFor(name)), name)
    this.relsCache.set(name, rels)
    return rels
  }

  /** Look up one relationship by id, with its resolved in-package part name. */
  async relationship(part: string, id: string | undefined): Promise<OfficeRelationship | null> {
    if (!id) return null
    const rels = await this.relationships(part)
    return rels.find((rel) => rel.id === id) ?? null
  }

  /** The part name a relationship points at, or `null` for external targets. */
  async targetOf(part: string, id: string | undefined): Promise<string | null> {
    const rel = await this.relationship(part, id)
    if (!rel || rel.external || !rel.partName) return null
    return rel.partName
  }

  /**
   * Follow the inheritance chain from `part` until a relationship of
   * `typeSuffix` is found — for PowerPoint, slide → layout → master → theme.
   *
   * The walk is driven by `chain` rather than "whatever relationship comes
   * first", because a slide's first relationship is frequently an image: a
   * naive walk resolves the slide's theme to nothing and the deck silently
   * falls back to Office defaults. This is the single most common way a
   * hand-rolled OOXML reader gets themes wrong.
   */
  async followRelationship(
    part: string,
    typeSuffix: string,
    chain: readonly string[] = INHERITANCE_CHAIN,
    maxHops = 8
  ): Promise<string | null> {
    let current: string | null = normalizePartName(part)
    for (let hop = 0; hop < maxHops && current; hop += 1) {
      const rels = await this.relationships(current)
      const match = rels.find((rel) => !rel.external && rel.type.endsWith(typeSuffix))
      if (match?.partName) return match.partName
      current = null
      for (const step of chain) {
        const onward = rels.find((rel) => !rel.external && rel.type.endsWith(step))
        if (onward?.partName) {
          current = onward.partName
          break
        }
      }
    }
    return null
  }

  /**
   * The theme that governs `part`, following the relationship chain (a slide
   * reaches its master's theme, a worksheet its workbook's). Falls back to the
   * package's only theme, which covers documents whose main part omits the
   * relationship and rely on the conventional part name.
   */
  async themeFor(part: string): Promise<string | null> {
    const followed = await this.followRelationship(part, '/theme')
    if (followed) return followed
    const themes = this.partNames().filter((name) => name.includes('theme'))
    return themes.length === 1 ? themes[0] : (themes[0] ?? null)
  }

  dispose(): void {
    this.disposed = true
    this.sizes.clear()
    this.defaults.clear()
    this.overrides.clear()
    this.relsCache.clear()
    this.xmlCache.clear()
    this.textCache.clear()
    this.bytesCache.clear()
    this.provider.dispose()
  }
}
