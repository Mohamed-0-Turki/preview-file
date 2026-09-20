import { innerArchiveName } from './formats.js'
import { looksLikeTar } from './tar.js'
import { TarProvider } from './tar-provider.js'
import type { ArchiveEntry, ArchiveFormat, ArchiveProvider } from './types.js'
import { ArchivePasswordError } from './types.js'

/**
 * Lazy, serialized backend for the 7-Zip WASM build (`7z-wasm`), which bundles
 * 7-Zip 24.09 and decodes 7z, RAR1-5, BZip2, Deflate64, LZMA/LZMA2, PPMd and
 * AES-encrypted streams. Used by {@link SevenZipProvider} for `.7z`, `.rar`,
 * `.cab` and the `bz2`/`xz`/`zst` family, and exposed directly for fixture
 * generation in tests.
 *
 * ## Why this design
 *
 * Emscripten binds TTY output to the `print`/`printErr` options *at
 * instantiation*, so per-invocation capture uses a module-level "active
 * capture" slot that the constructor handlers append to. Every `callMain` gets
 * an explicit `-p <password-or-empty>` so 7-Zip never blocks on a
 * stdin/`window.prompt` password question. `callMain` does not surface wrong
 * passwords as exceptions — 7-Zip reports them through its text channels and a
 * nonzero exit — so password failures are classified by scanning the captured
 * output. All calls are serialized through one promise chain: the wasm module
 * is a singleton and is not reentrant. Binary output never goes through the
 * text channels (`-so` corrupts it), so extraction always targets a scratch
 * directory that is read and then deleted.
 */

export interface SevenZipOptions {
  /** Optional override that resolves the `.wasm` asset URL from a bundler- or
   *  deployment-managed location, e.g. `() => someAssetUrl`. When omitted, the
   *  wasm bytes shipped inside this package are passed straight to the
   *  Emscripten loader, so no fetch of a `.wasm` file ever happens — the safest
   *  mode across Vite/Rollup/webpack (dev and prod) and Node. */
  locateFile?: (path: string, prefix: string) => string
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export type SevenZipModule = {
  FS: any
  callMain(args: string[]): number | void
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export interface SevenZipRunResult {
  code: number
  output: string
  errorOutput: string
}

let configured: SevenZipOptions = {}

/** Register bundler-specific asset resolution before the wasm module is first
 *  instantiated. The default (called with no options) never fetches a `.wasm`
 *  asset: the binary is embedded in this package and handed to the loader
 *  directly, which removes all bundler/asset-path pitfalls. */
export function configureArchiveWasm(options: SevenZipOptions): void {
  configured = options
}

/** Decode the embedded base64 wasm into the bytes the loader expects. Uses the
 *  global `atob`, which exists in browsers and Node >= 16. */
function decodeBase64(encoded: string): Uint8Array {
  const binary = atob(encoded)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

interface Capture {
  output: string
  errorOutput: string
}

let modulePromise: Promise<SevenZipModule> | undefined
let activeCapture: Capture | undefined

async function initModule(): Promise<SevenZipModule> {
  const imported = (await import('7z-wasm')) as { default?: unknown }
  const factory = imported?.default
  if (typeof factory !== 'function') {
    throw new Error('7z-wasm could not be loaded: expected a module factory as the default export')
  }
  /* When the caller provides an explicit `locateFile`, hand the wasm to the
     loader as an external asset. Otherwise embed the shipped bytes: the
     Emscripten loader instantiates from `Module.wasmBinary` and never fetches
     `7zz.wasm`, so bundlers that neither rewrite `new URL("7zz.wasm",
     import.meta.url)` nor serve the file cannot break initialization. */
  const customLocateFile = configured.locateFile
  /* Lazy dynamic import keeps the 2.2 MB base64 chunk out of the main bundle:
     it only loads together with the 7z-wasm factory on first use. */
  const { SEVEN_ZIP_WASM_BASE64 } = await import('./seven-zip-wasm.js')
  const module = (await factory({
    noInitialRun: true,
    print: (line: string): void => {
      if (activeCapture) activeCapture.output += `${line}\n`
    },
    printErr: (line: string): void => {
      if (activeCapture) activeCapture.errorOutput += `${line}\n`
    },
    ...(customLocateFile
      ? { locateFile: customLocateFile }
      : { wasmBinary: decodeBase64(SEVEN_ZIP_WASM_BASE64) }),
  })) as SevenZipModule
  return module
}

/** The singleton wasm module, instantiated once and reused for all archives. */
export function loadSevenZipModule(): Promise<SevenZipModule> {
  modulePromise ??= initModule()
  return modulePromise
}

let runChain: Promise<unknown> = Promise.resolve()

/** Serialize a task behind every previously queued wasm invocation. */
function enqueue<T>(task: () => Promise<T> | T): Promise<T> {
  const result = runChain.then(task, task)
  runChain = result.then(
    () => undefined,
    () => undefined,
  )
  return result
}

/** Run 7-Zip `callMain` with captured stdout/stderr. Serialized process-wide;
 *  safe to call from providers and test fixture generators. */
export function runSevenZip(args: readonly string[]): Promise<SevenZipRunResult> {
  return enqueue(async () => {
    const module = await loadSevenZipModule()
    const capture: Capture = { output: '', errorOutput: '' }
    activeCapture = capture
    let code = 0
    try {
      code = (module.callMain([...args]) as number) ?? 0
    } catch (error) {
      code = (error as { status?: number })?.status ?? 1
    } finally {
      activeCapture = undefined
    }
    return { code, output: capture.output, errorOutput: capture.errorOutput }
  })
}

const WRONG_PASSWORD = /wrong password/i
const DATA_ERROR_IN_ENCRYPTED = /Error in encrypted file.*wrong password/i

function isPasswordFailure(result: SevenZipRunResult): boolean {
  const all = `${result.errorOutput}\n${result.output}`
  return WRONG_PASSWORD.test(all) || DATA_ERROR_IN_ENCRYPTED.test(all)
}

/** Classify the outcome of a listing/extraction run. */
export type SevenZipOutcome = 'ok' | 'password' | 'error'

export function classifySevenZipRun(result: SevenZipRunResult): SevenZipOutcome {
  if (result.code === 0 && !isPasswordFailure(result)) return 'ok'
  if (isPasswordFailure(result)) return 'password'
  return 'error'
}

let providerSeed = 0

/** Parse 7-Zip's technical listing format (`l -slt`) into a container summary
 *  and per-entry field maps. Blocks are delimited by lines of dashes. */
function parseTechnicalListing(output: string): {
  summary: Map<string, string>
  entries: Map<string, string>[]
} {
  const lines = output
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f]/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
  const blocks: string[][] = []
  let current: string[] | undefined
  for (const line of lines) {
    /* Both dash separators and blank lines delimit blocks: 7-Zip separates the
       banner and summary with dashed lines, but entry blocks with blank lines. */
    if (/^-{3,}/.test(line.trim()) || line.trim() === '') {
      if (current && current.length) blocks.push(current)
      current = []
      continue
    }
    if (current) current.push(line)
  }
  if (current && current.length) blocks.push(current)

  const summary = new Map<string, string>()
  const entries: Map<string, string>[] = []
  for (const block of blocks) {
    const fields = new Map<string, string>()
    for (const line of block) {
      const match = /^([A-Za-z ]+?)\s*=\s*(.*)$/.exec(line.trim())
      if (match) fields.set(match[1]!.trim(), match[2]!.trim())
    }
    if (fields.has('Type') && !fields.has('Path')) {
      fields.forEach((value, key) => summary.set(key, value))
    } else if (fields.has('Path') && fields.has('Size')) {
      entries.push(fields)
    }
  }
  return { summary, entries }
}

/** Interpret a `l -slt` listing into a flat archive entry list. */
function entriesFromTechnicalListing(entryFields: Map<string, string>[]): ArchiveEntry[] {
  const entries: ArchiveEntry[] = []
  for (const fields of entryFields) {
    const path = fields.get('Path')
    if (!path || path === '.' || path === '/') continue
    const attributes = fields.get('Attributes') ?? ''
    const kind: ArchiveEntry['kind'] = attributes.startsWith('D') || path.endsWith('/') ? 'directory' : 'file'
    const size = Number.parseInt(fields.get('Size') ?? '0', 10) || 0
    const encrypted = (fields.get('Encrypted') ?? '').includes('+')
    entries.push({
      path,
      name: path.split('/').pop() ?? path,
      kind,
      size,
      mtime: undefined,
      encrypted,
      linkPath: kind === 'file' ? undefined : fields.get('Links'),
    })
  }
  return entries
}

function cleanFsPath(path: string): string {
  const segments: string[] = []
  for (const segment of path.replace(/\\/g, '/').split('/')) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') continue
    segments.push(segment)
  }
  return segments.join('/')
}

function isDir(mode: number): boolean {
  return (mode & 0o170000) === 0o040000
}

/** Recursively delete a directory tree inside the emscripten FS. */
function removeFsTree(fs: { readdir: (path: string) => string[]; stat: (path: string) => { mode: number }; unlink: (path: string) => void; rmdir: (path: string) => void }, path: string): void {
  let remaining = path
  while (remaining.endsWith('/') && remaining !== '/') remaining = remaining.slice(0, -1)
  try {
    const entries = fs.readdir(remaining)
    for (const entry of entries) {
      if (entry === '.' || entry === '..') continue
      const child = `${remaining}/${entry}`
      const stat = fs.stat(child)
      if (isDir(stat.mode)) removeFsTree(fs, child)
      else fs.unlink(child)
    }
    try {
      fs.rmdir(remaining)
    } catch {
      /* already gone */
    }
  } catch {
    /* path did not exist */
  }
}

function mkdirIfMissing(fs: { analyzePath: (path: string) => { exists: boolean }; mkdir: (path: string) => void }, path: string): void {
  if (!fs.analyzePath(path).exists) fs.mkdir(path)
}

/**
 * In-memory provider over archives 7-Zip understands natively: `.7z`, `.rar`
 * and `.cab` are listed/extracted through the wasm backend; `.bz2`, `.xz` and
 * `.zst` single-file streams are decompressed once and handed to a tar provider
 * when the payload is a tar, or exposed as one inner file. Password-protected
 * archives (`7zAES`/AES methods, header-locked 7z) drive
 * {@link ArchivePasswordError} flows exactly like the zip provider.
 */
export class SevenZipProvider implements ArchiveProvider {
  readonly format: ArchiveFormat

  private readonly bytes: Uint8Array
  private readonly inputPath: string
  private readonly outDir: string

  private entries: ArchiveEntry[] | undefined
  private _encrypted = false
  private lockedHeader = false
  private password = ''

  private readonly originalName: string

  private payload: Uint8Array | undefined
  private delegate: TarProvider | undefined
  private singlePath: string | undefined

  constructor(bytes: Uint8Array, format: ArchiveFormat, name?: string) {
    this.bytes = bytes
    this.format = format
    this.originalName = name ?? ''
    const id = ++providerSeed
    this.inputPath = `/data/in${id}.bin`
    this.outDir = `/work/out${id}`
  }

  private get isSingleStream(): boolean {
    return (
      this.format === 'bz2' ||
      this.format === 'tbz' ||
      this.format === 'xz' ||
      this.format === 'txz' ||
      this.format === 'zst' ||
      this.format === 'tzst'
    )
  }

  get encrypted(): boolean {
    if (this.entries?.some((entry) => entry.encrypted)) return true
    return this._encrypted
  }

  isLocked(): boolean {
    return (this._encrypted || this.lockedHeader) && this.password === ''
  }

  private passwordArgs(): string[] {
    return this.password !== '' ? [`-p${this.password}`] : ['-p']
  }

  private async ensureModuleFs(): Promise<{ FS: any; mode: undefined }> {
    const module = await loadSevenZipModule()
    mkdirIfMissing(module.FS, '/data')
    mkdirIfMissing(module.FS, '/work')
    return { FS: module.FS, mode: undefined }
  }

  private async ensureInput(): Promise<void> {
    const { FS } = await this.ensureModuleFs()
    if (this.bytes.length > 0 && !FS.analyzePath(this.inputPath).exists) {
      FS.writeFile(this.inputPath, this.bytes)
    }
  }

  private async runProtected(args: string[]): Promise<SevenZipRunResult> {
    const result = await runSevenZip([...args, ...this.passwordArgs()])
    if (classifySevenZipRun(result) === 'password') throw new ArchivePasswordError()
    return result
  }

private async listNative(): Promise<ArchiveEntry[]> {
      await this.ensureInput()
      const result = await this.runProtected(['l', '-slt', this.inputPath])
      const outcome = classifySevenZipRun(result)

    if (outcome === 'password') throw new ArchivePasswordError()
if (outcome === 'error') {
        /* No `Path =` summary line means the header could not be decoded:
           a header-encrypted archive without a (valid) password. For `.7z`
           and `.rar` treat this as a password gate so callers can repeatedly
           try new passwords. */
        if (!/^Path\s*=/m.test(result.output)) {
          if (this.format === '7z' || this.format === 'rar') {
            this.lockedHeader = true
            throw new ArchivePasswordError()
          }
        }
        throw new Error(`Cannot read archive: 7-Zip failed with exit code ${result.code}.`)
      }

    const { summary, entries: entryFields } = parseTechnicalListing(result.output)
    const method = summary.get('Method') ?? ''
    this._encrypted = /AES/i.test(method) || entryFields.some((fields) => (fields.get('Encrypted') ?? '').includes('+'))
    const entries = entriesFromTechnicalListing(entryFields)
    if (!entries.length) throw new Error('Cannot read archive: 7-Zip listed no entries.')
    return entries
  }

  /** Detect whether a password is needed without exposing anything. Content-
   *  encrypted archives list fine (names/`Encrypted` flags come from the
   *  container header); header-encrypted ones throw from `listNative`, which is
   *  reinterpreted as "yes, password required". Single-stream wrappers never
   *  need a password. */
  async requiresPassword(): Promise<boolean> {
    if (this.isSingleStream) return false
    if (this.entries === undefined) {
      try {
        this.entries = await this.listNative()
      } catch (error) {
        if (error instanceof ArchivePasswordError) return true
        throw error
      }
    }
    return this._encrypted || this.lockedHeader
  }

  async list(): Promise<ArchiveEntry[]> {
    if (this.isLocked()) {
      throw new ArchivePasswordError('Enter the password to list the archive contents.')
    }
    if (this.entries) return this.entries
    if (this.isSingleStream) return this.listSingleStream()
    this.entries = await this.listNative()
    return this.entries
  }

  /** Decompress a `.bz2`/`.xz`/`.zst` (or `.tar.*`) wrapper once, then expose
   *  a tar or a single inner file. Listing a wrapper does not report the
   *  member path (7-Zip's `l -slt` shows only the container block), so the
   *  payload is extracted first and named from what was produced. */
  private async listSingleStream(): Promise<ArchiveEntry[]> {
    if (this.delegate) return this.delegate.list()
    if (this.payload !== undefined && this.singlePath !== undefined) {
      return [this.singleEntry(this.singlePath)]
    }

    const { path, data } = await this.extractSingle()
    this.payload = data
    /* 7-Zip names the produced file after the input archive path, not its
       original name — prefer the real name when the caller gave one. */
    this.singlePath = this.originalName ? innerArchiveName(this.originalName, this.format) : path

    if (looksLikeTar(data)) {
      this.delegate = new TarProvider(data, this.format as 'tgz' | 'tbz' | 'txz' | 'tzst')
      return this.delegate.list()
    }
    return [this.singleEntry(this.singlePath)]
  }

  private singleEntry(path: string): ArchiveEntry {
    return {
      path,
      name: path.split('/').pop() ?? path,
      kind: 'file',
      size: this.payload?.length ?? 0,
    }
  }

  private async extractSingle(): Promise<{ path: string; data: Uint8Array }> {
    await this.prepareOutDir()
    const result = await runSevenZip(['x', '-y', '-o' + this.outDir, this.inputPath])
    if (classifySevenZipRun(result) !== 'ok') {
      throw new Error(`Cannot extract archive: 7-Zip failed with exit code ${result.code}.`)
    }
    const { FS } = await this.ensureModuleFs()
    const stat = FS.stat(this.outDir)
    if (!isDir(stat.mode)) throw new Error('Cannot extract archive: not a directory output.')
    const names = FS.readdir(this.outDir)
    /* The produced file keeps its original name inside the wrapper. */
    const file = names.find((name: string) => name !== '.' && name !== '..')
    if (!file) throw new Error('Cannot extract archive: 7-Zip left nothing behind.')
    const data = FS.readFile(`${this.outDir}/${file}`)
    removeFsTree(FS, this.outDir)
    return { path: file, data }
  }

  private async prepareOutDir(): Promise<void> {
    await this.ensureInput()
    const { FS } = await this.ensureModuleFs()
    removeFsTree(FS, this.outDir)
    FS.mkdir(this.outDir)
  }

  async read(path: string): Promise<Uint8Array> {
    if (this.delegate) return this.delegate.read(path)
    if (this.payload !== undefined && this.singlePath !== undefined) {
      if (cleanFsPath(path) !== this.singlePath) throw new ArchivePasswordError()
      return this.payload.slice()
    }

    await this.list()
    if (this._encrypted && this.password === '') throw new ArchivePasswordError()

    const cleanPath = cleanFsPath(path)
    await this.prepareOutDir()
    const result = await this.runProtected(['x', '-y', '-o' + this.outDir, this.inputPath])
    if (classifySevenZipRun(result) !== 'ok') {
      throw new Error(`Cannot extract archive: 7-Zip failed with exit code ${result.code}.`)
    }
    const { FS } = await this.ensureModuleFs()
    try {
      const target = `${this.outDir}/${cleanPath}`
      const stat = FS.analyzePath(target)
      if (!stat.exists || isDir(stat.object.mode)) throw new ArchivePasswordError()
      return FS.readFile(target).slice()
    } finally {
      removeFsTree(FS, this.outDir)
    }
  }

  async unlock(password: string): Promise<boolean> {
    if (!this.encrypted && !this.lockedHeader) return true
    if (password === '') return false

    const previous = this.password
    this.password = password
    try {
      if (this.entries) {
        const protectedEntry = this.entries.find((entry) => entry.encrypted)
        if (protectedEntry) await this.read(protectedEntry.path)
      } else {
        /* Header-locked archive: listing itself validates the password. */
        this.entries = await this.listNative()
        this.lockedHeader = false
      }
    } catch (error) {
      this.password = previous
      if (error instanceof ArchivePasswordError) return false
      throw error
    }
    return true
  }

  dispose(): void {
    this.delegate?.dispose()
    this.delegate = undefined
    this.entries = undefined
    this.payload = undefined
    this.singlePath = undefined
    void enqueue(async () => {
      const module = await loadSevenZipModule().catch(() => undefined)
      if (!module) return
      removeFsTree(module.FS, this.outDir)
      try {
        module.FS.unlink(this.inputPath)
      } catch {
        /* already gone */
      }
    })
  }
}

/** Create a `.7z` archive (optionally password / header-encrypted) from a map
 *  of virtual paths to bytes. Intended for test fixtures. */
export async function createSevenZipArchive(
  files: Record<string, Uint8Array>,
  options?: { password?: string; headerEncrypted?: boolean },
): Promise<Uint8Array> {
  const id = ++providerSeed
  const sourceDir = `/work/src${id}`
  const target = `/work/arch${id}.7z`
  await enqueue(async () => {
    const module = await loadSevenZipModule()
    mkdirIfMissing(module.FS, '/work')
    removeFsTree(module.FS, sourceDir)
    module.FS.mkdir(sourceDir)
    for (const [path, bytes] of Object.entries(files)) {
      const dirs = cleanFsPath(path).split('/').slice(0, -1)
      let current = sourceDir
      for (const segment of dirs) {
        current = `${current}/${segment}`
        if (!module.FS.analyzePath(current).exists) module.FS.mkdir(current)
      }
      module.FS.writeFile(`${sourceDir}/${cleanFsPath(path)}`, bytes)
    }
  })
  const passwordArgs = options?.password ? [`-p${options.password}`] : []
  const headerArgs = options?.headerEncrypted ? ['-mhe=on'] : []
  const result = await runSevenZip(['a', '-t7z', '-y', ...passwordArgs, ...headerArgs, target, `${sourceDir}/.`])
  if (classifySevenZipRun(result) !== 'ok') {
    throw new Error(`Failed to create 7z fixture: 7-Zip exited ${result.code}.`)
  }
  const module = await loadSevenZipModule()
  const bytes = module.FS.readFile(target).slice()
  await enqueue(async () => {
    removeFsTree(module.FS, sourceDir)
    try {
      module.FS.unlink(target)
    } catch {
      /* already gone */
    }
  })
  return bytes
}