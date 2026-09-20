# `src/archives/` — archive reading layer

Unified reading of ZIP, 7z, RAR, CAB, TAR and the whole compressed-TAR family plus
`.bz2`/`.xz`/`.zst` single-file streams and bare `.ar`/`cpio` behind a single
interface. This layer is deliberately decoupled from the preview pipeline: it deals in
`bytes`, paths and passwords only, never DOM.

## Interface

```ts
interface ArchiveProvider {
  readonly format: ArchiveFormat           // zip | zipx | 7z | rar | cab | tar | tgz | gz | bz2 | tbz | xz | txz | zst | tzst | ar | cpio
  readonly encrypted: boolean              // archive declares encrypted entries
  requiresPassword(): Promise<boolean>     // detect encryption (may enumerate internally but exposes nothing)
  list(): Promise<ArchiveEntry[]>          // throws ArchivePasswordError while locked
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

Encrypted archives follow a **detect → unlock → browse** contract: the renderer calls
`requiresPassword()` before anything else and, for an encrypted archive, shows only a
prompt until `unlock()` accepts a valid password. While locked, `list()` itself throws
`ArchivePasswordError` so no member names, sizes or structure can ever leak — even for
content-encrypted ZIP/7z/RAR, whose central directory or technical listing can be read
without a password. Detection may therefore enumerate internally (zip central
directory, 7-Zip `l -slt`), but that data is never surfaced pre-unlock.

## Detection (`formats.ts`)

Detection is driven by a single descriptor table rather than scattered MIME fixes:

- `resolveArchiveFormat(name)` — extension-first, longest compound suffix wins
  (`.tar.gz` > `.gz`), from `EXTENSION_INDEX`.
- `sniffArchiveFormat(bytes)` — magic-byte fallback used by the previewer when no
  name resolves (`.7z`, `Rar!\x1a`, `MSCF`, `!<arch>`, `070701`, …).
- `innerArchiveName(name, format)` — strips only the compression suffix (longest-first
  `.gzip/.bzip2/.zstd/.gz/.bz2/.xz/.zst`) so `archive.tar.gz` → `archive.tar` while
  `x.txt.gz` → `x.txt`.
- `allArchiveMimeTypes()` / `isArchiveMimeType()` / `archiveFormatLabel()` — the same
  table feeds the previewer and default exclusion of `application/x-archive` (the
  archive sidebar's own result type).

## Choosing an implementation

Callers use the helpers from `index.ts` and never construct providers directly:

- `resolveArchiveFormat(name) -> ArchiveFormat | undefined`
- `createArchiveProvider(bytes, format, name) -> ArchiveProvider` — builds the right
  provider and throws for unknown formats.

| Provider | Depends on | Notes |
| --- | --- | --- |
| `ZipProvider` (`zip.ts`) | `@zip.js/zip.js` | Lazy central-directory reader; `read` streams the entry. AES + ZipCrypto. Runs zip.js on the main thread (`useWebWorkers: false`) so decryption works where the worker chunk is unavailable; `unlock` validates with the first encrypted entry. |
| `TarProvider` (`tar-provider.ts`) | `tar.ts` (hand-rolled, none) | Parses the 512-byte-block ustar format itself: ustar/POSIX, GNU longname/longlink, PAX `x`/`g`, octal + base-256 numerals, checksum validation, `..`/`.` sanitization. `TarMember` offsets mean reads never copy the whole archive. |
| `CompressedProvider` (`compressed.ts`) | fflate | Abstract single-stream wrapper: decompress once, tar-sniff to delegate to `TarProvider`, else one file entry named via `innerArchiveName`. |
| `GzProvider` (`gz.ts`) | fflate | `gunzipSync` once; `.tar.gz` becomes a browsable TAR, a bare `.gz` becomes a single file. |
| `SevenZipProvider` (`seven-zip.ts`) | `7z-wasm` | 7z, RAR, CAB listing + `.bz2`/`.xz`/`.zst` single-stream decompression. Detection (`requiresPassword`) shares `l -slt`: content-encrypted archives are flagged from `Encrypted`/`AES` fields; header-encrypted ones throw and are reinterpreted as password-required. `list()` is gated until unlocked. |
| `ArProvider` (`ar.ts`) | none (hand-rolled) | GNU long-name table (`//` + one-based `/offset`), BSD `#1/length` extended names, symbol table skip, even-padding. Covers `.deb`. |
| `CpioProvider` (`cpio.ts`) | none (hand-rolled) | `newc`/`crc` (hex) and `odc` (octal) variants, `TRAILER!!!`, dir/symlink/regular kinds. |

## 7z / RAR / CAB through 7z-wasm

`seven-zip.ts` shells out to the Emscripten build of 7-Zip (`7zz`) that ships with the
`7z-wasm` package:

- **The wasm is embedded in this package.** `scripts/generate-7zz-wasm.mjs` turns
  `7zz.wasm` into a base64 module (`seven-zip-wasm.ts`, ~2.2 MB, dynamically imported
  only when a 7z-family archive is opened) and the loader receives it as
  `Module.wasmBinary`. No `.wasm` file is ever fetched, so Vite/Rollup/webpack dev
  servers cannot 404/403 it and no `locateFile` configuration is required. Consumers
  who would rather host the file externally call `configureArchiveWasm({ locateFile })`
  first — with a custom `locateFile`, the embedded bytes are skipped and the external
  asset is used instead.
- The wasm module is a lazy singleton; `print`/`printErr` are captured at factory
  creation and routed to a module-level "active capture" slot around each `callMain`
  call.
- Every invocation passes an explicit `-p <password-or-empty>` so 7-Zip never blocks on
  `stdin`/`window.prompt` for an interactive password.
- Extraction goes to a scratch dir (`x -o`) then `FS.readFile`; `-so` piping is avoided
  because binary data is not safe over the text TTY emulation.
- Wrong passwords are detected three ways: exit 1 + no `Path =` summary line
  (header-encrypted), the `Enter password:` prompt line, or `ERROR: Data Error in
  encrypted file. Wrong password?`.

## Password rules

- Passwords live **on the provider instance** (`dispose()` clears them), never on
  module or archive state.
- `unlock('')` is rejected by the renderer before reaching the provider.
- Wrong passwords return `false` from `unlock` and leave the provider locked.
- `requiresPassword()` is called first and must be `false` before browsing is
  possible; content- and header-encrypted archives alike gate `list()` until a valid
  password is accepted, so no metadata is exposed before authentication.

## Verification

Providers were verified against real fixtures: Python `tarfile`/zipfile outputs (plain
TAR, `.tar.gz`/`.tar.bz2`/`.tar.xz`/`.tar.zst`, bare single-file `.gz`/`.bz2`/`.xz`/
`.zst`, nested ZIP), 7z-wasm-created archives (plain, header-encrypted, content-
encrypted with public + encrypted members), an AES-encrypted ZIP built with zip.js,
hand-crafted `newc` cpio and GNU `ar` (with long-name table and BSD `#1/N` members).
Probe script: `/tmp/opencode/probe-all.mjs` (asserts every format's detection + list +
read, the `requiresPassword`/unlock gates, and cap ability), rerunnable against
`dist/` after `npm run build`.