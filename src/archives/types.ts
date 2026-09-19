export type ArchiveFormat = 'zip' | 'tar' | 'tgz' | 'gz'

export type ArchiveEntryKind = 'file' | 'directory' | 'symlink' | 'hardlink'

/** A single member of an archive, listed with a normalized archive-relative
 *  path (``/``-separated, no leading slash, no `..` segments). */
export interface ArchiveEntry {
  /** Normalized path inside the archive. */
  readonly path: string
  /** Base name of the entry (last path segment). */
  readonly name: string
  readonly kind: ArchiveEntryKind
  /** Uncompressed size in bytes (0 for directories). */
  readonly size: number
  /** Last-modified unix timestamp (seconds), when the container records it. */
  readonly mtime?: number
  /** Link target for symlink/hardlink entries, when known up front. */
  readonly linkPath?: string
  /** True when the member is protected by a password (zip only). */
  readonly encrypted?: boolean
}

/** Thrown when reading an entry that requires a password the user has not
 *  provided yet. The archive browser catches it to surface the password
 *  prompt instead of showing an error. */
export class ArchivePasswordError extends Error {
  constructor(message?: string) {
    super(message ?? 'This archive entry is password-protected.')
    this.name = 'ArchivePasswordError'
  }
}

/** Common interface every archive provider implements. Providers own the
 *  archive's reader/decoder and its password state; the renderer only talks to
 *  this surface so zip, tar and gzip browsing behave identically. */
export interface ArchiveProvider {
  readonly format: ArchiveFormat
  /** True when at least one member is password-protected. */
  readonly encrypted: boolean
  /** True while an encrypted archive is waiting for a valid password. */
  isLocked(): boolean
  /** List every member of the archive. The result is cached. */
  list(): Promise<ArchiveEntry[]>
  /** Try to unlock an encrypted archive with `password`. Resolves to true when
   *  the password was accepted, false when it was wrong. No-op for archives
   *  that are not encrypted. */
  unlock(password: string): Promise<boolean>
  /** Read a single file entry as raw bytes. Throws {@link ArchivePasswordError}
   *  for entries that still require a password. */
  read(path: string): Promise<Uint8Array>
  /** Release any open readers/decoders. */
  dispose(): void
}