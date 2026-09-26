/**
 * Image parts → object URLs.
 *
 * A shape's `r:embed` is a relationship id, which is only meaningful in the part
 * that declared it, so resolution is `(part, relId) → bytes → object URL`. The
 * URLs are cached per part because the same image is routinely referenced by
 * many shapes, and they are revoked in one place on teardown — an orphaned
 * object URL pins its decoded bitmap for the lifetime of the document.
 *
 * Resolution is async and the renderer is sync, so the first paint can miss an
 * image. That is handled by the `onReady` callback rather than by awaiting
 * inside the walker: the document is laid out immediately and the few images
 * that were not ready yet are filled in when they arrive.
 */

import type { BlipFill, OfficePackage } from '../../ooxml/index.js'

export interface AssetStore {
  /**
   * The `ImageResolver` the painter calls, which is always sync: it returns
   * `null` for an image that has not finished loading, and the caller
   * repaints once `onReady` fires.
   */
  resolveById(part: string, relId: string): string | null
  /** The same lookup from a parsed blip. */
  resolve(blip: BlipFill, part: string): string | null
  /** Resolve every image a set of parts references, then fire `onReady`. */
  preload(parts: readonly string[]): Promise<void>
  /** Revoke every URL this store created. */
  dispose(): void
}

export interface AssetStoreOptions {
  /**
   * Called after a preload pass resolves, so a caller can repaint the shapes
   * that were drawn without their image.
   */
  readonly onReady?: () => void
  /** Injected in tests; default to the global `URL`. */
  readonly createObjectURL?: (bytes: Uint8Array, type: string) => string
  readonly revokeObjectURL?: (url: string) => void
}

/**
 * The image MIME type for a part, from the package's content types with a
 * filename fallback. A wrong content type makes the browser sniff, which
 * silently fails for formats that have no magic number of their own.
 */
const EXTENSION_TYPES: Readonly<Record<string, string>> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  bmp: 'image/bmp',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  ico: 'image/x-icon',
  avif: 'image/avif',
  emf: 'image/emf',
  wmf: 'image/wmf',
}

function mimeFor(pkg: OfficePackage, part: string): string {
  const declared = pkg.contentTypeOf(part)
  if (declared.startsWith('image/')) return declared
  const dot = part.lastIndexOf('.')
  return EXTENSION_TYPES[part.slice(dot + 1).toLowerCase()] ?? 'application/octet-stream'
}

export function createAssetStore(pkg: OfficePackage, options: AssetStoreOptions = {}): AssetStore {
  const create =
    options.createObjectURL ??
    ((bytes: Uint8Array, type: string): string => URL.createObjectURL(new Blob([bytes as BlobPart], { type })))
  const revoke = options.revokeObjectURL ?? ((url: string): void => URL.revokeObjectURL(url))

  // Relationship ids are scoped to their declaring part, so the cache is keyed
  // by part first. A flat `part + relId` string would need a separator that
  // cannot occur in either half.
  const urls = new Map<string, Map<string, string>>()
  const pending = new Map<string, Map<string, Promise<string | null>>>()
  let disposed = false

  const bucket = <T>(store: Map<string, Map<string, T>>, part: string): Map<string, T> => {
    const existing = store.get(part)
    if (existing) return existing
    const created = new Map<string, T>()
    store.set(part, created)
    return created
  }

  const load = async (part: string, relId: string): Promise<string | null> => {
    const done = urls.get(part)?.get(relId)
    if (done) return done
    const inFlight = pending.get(part)?.get(relId)
    if (inFlight) return inFlight

    const work = (async (): Promise<string | null> => {
      const target = await pkg.targetOf(part, relId)
      if (!target || disposed || !pkg.has(target)) return null
      const bytes = await pkg.bytes(target)
      if (disposed || bytes.length === 0) return null
      const url = create(bytes, mimeFor(pkg, target))
      bucket(urls, part).set(relId, url)
      return url
    })().finally(() => {
      pending.get(part)?.delete(relId)
    })

    bucket(pending, part).set(relId, work)
    return work
  }

  return {
    resolveById(part, relId) {
      return urls.get(part)?.get(relId) ?? null
    },
    resolve(blip, part) {
      return urls.get(part)?.get(blip.embedRelId) ?? null
    },

    async preload(parts) {
      const wanted: { part: string; relId: string }[] = []
      for (const source of parts) {
        for (const rel of await pkg.relationships(source)) {
          if (rel.type.endsWith('/image')) wanted.push({ part: source, relId: rel.id })
        }
      }
      await Promise.all(wanted.map((entry) => load(entry.part, entry.relId)))
      if (!disposed) options.onReady?.()
    },

    dispose() {
      disposed = true
      for (const byRel of urls.values()) {
        for (const url of byRel.values()) revoke(url)
      }
      urls.clear()
      pending.clear()
    },
  }
}
