# `src/archives/` — archive reading layer

Unified reading of ZIP, TAR, TAR.GZ / TGZ and bare `.gz` behind a single interface.
This layer is deliberately decoupled from the preview pipeline: it deals in `bytes`,
paths and passwords only, never DOM.

## Interface

```ts
interface ArchiveProvider {
  readonly format: ArchiveFormat           // 'zip' | 'tar' | 'tgz' | 'gz'
  readonly name: string                    // original archive file name
  readonly encrypted: boolean              // archive declares encrypted entries
  list(): Promise<ArchiveEntry[]>
  read(path: string): Promise<Uint8Array>  // throws ArchivePasswordError if locked
  unlock(password: string): Promise<boolean>
  isLocked(): boolean                      // encrypted but password not yet accepted
  dispose(): void                          // drops any cached password + readers
}

interface ArchiveEntry {
  path: string                             // normalized, '' = root (never returned)
  name: string                             // last path segment
  kind: 'file' | 'directory' | 'symlink' | 'hardlink'
  size: number
  mtime?: number                           // epoch ms
  linkPath?: string                        // symlink/hardlink target
  encrypted?: boolean
}
```

`ArchivePasswordError` signals a read that needs a password. `list()` never throws on
encryption — a locked archive is fully browsable; only encrypted entries refuse to read.

## Choosing an implementation

Callers use the two helpers from `index.ts` and never construct providers directly:

- `resolveArchiveFormat(name) -> ArchiveFormat | undefined` — keys on the file name
  (`.tar.gz` / `.tgz` win over `.gz`; `.zip`, `.tar`, `.gz`), then on nothing — MIME is
  resolved by the previewer's `supportedMimeTypes` before this is reached.
- `createArchiveProvider(bytes, format, name) -> ArchiveProvider` — builds the right
  provider and throws for unknown formats.

| Provider | Depends on | Notes |
| --- | --- | --- |
| `ZipProvider` (`zip.ts`) | `@zip.js/zip.js` | Lazy central-directory reader; `read` streams the entry. AES + ZipCrypto; `unlock` validates by reading the first encrypted non-directory entry and caches the password on the instance only. |
| `TarProvider` (`tar-provider.ts`) | `tar.ts` (hand-rolled, none) | No TAR support exists in `fflate`, so `tar.ts` parses the 512-byte-block ustar format itself: ustar/POSIX, GNU longname/longlink, PAX `x`/`g`, octal and base-256 numerals, checksum validation, and `..`/`.` path segment sanitization. `TarMember` = `{ header, dataStart }` offsets so reads never copy the whole archive. |
| `GzProvider` (`gz.ts`) | `fflate` | `gunzipSync` once on construction, then TAR-sniff (`looksLikeTar`) — a gzipped TAR is browsed as TAR (`tgz`-style); any other single file appears as one file entry named after the archive minus `.gz`. |

## Password rules

- Passwords are held **on the provider instance** (`dispose()` clears them), never on
  module state, never on the archive's entries.
- `unlock('')` is rejected by the renderer before reaching the provider.
- Wrong passwords return `false` from `unlock` and leave the provider locked.

## Verification

Providers were verified against real fixtures: Python `tarfile` outputs (plain TAR,
`.tar.gz` bundles, a bare gzipped TAR, a single-file `.gz`, a symlink TAR) and
zip.js-made ZIPs (plain, ZipCrypto, AES). Probes live under `/tmp/opencode/` and are
rerunnable against `dist/` after a build.