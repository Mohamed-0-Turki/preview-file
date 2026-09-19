import { extensionFrom } from '../utils/index.js'
import type { MonacoGlobal } from './monaco-types.js'

function stripDot(value: string): string {
  return value.startsWith('.') ? value.slice(1) : value
}

/** Normalize a MIME type for comparison: lowercase, drop any `;charset=…`
 *  parameters browsers sometimes append. */
function normalizeMimeType(mimeType: string): string {
  return mimeType.split(';')[0].trim().toLowerCase()
}

/** Compare a (possibly parameterized) MIME type against a registry candidate. */
function mimeMatches(candidate: string, mimeType: string): boolean {
  return candidate.toLowerCase() === normalizeMimeType(mimeType)
}

/**
 * Resolve the Monaco language id for a code file. Monaco registers each language
 * with its own metadata (`MonacoLanguage`), so the resolution order is:
 *
 * 1. exact file name (`Dockerfile`, `Makefile`, `tsconfig.json`, …)
 * 2. file extension (the most reliable signal)
 * 3. the declared MIME type — including the synthetic `text/x-{id}` MIME the
 *    router assigns to Monaco languages without a declared one
 * 4. the first-line shebang, when the language defines a `firstLine` sniffing regex
 * 5. `plaintext`, when nothing matches
 *
 * Everything is derived from `monaco.languages.getLanguages()` — the same table
 * Monaco itself uses to autodetect — so no language list needs to be maintained.
 */
export function resolveLanguageId(
  monaco: MonacoGlobal,
  name: string,
  mimeType: string,
  text: string
): string {
  const languages = monaco.languages.getLanguages()
  const extension = extensionFrom(name)

  if (name) {
    const byFilename = languages.find((language) =>
      language.filenames?.some((candidate) => candidate === name)
    )
    if (byFilename) return byFilename.id
  }

  if (extension) {
    const byExtension = languages.find((language) =>
      language.extensions?.some((candidate) => stripDot(candidate).toLowerCase() === extension)
    )
    if (byExtension) return byExtension.id
  }

  const normalizedMime = normalizeMimeType(mimeType)
  if (normalizedMime) {
    const byMime = languages.find((language) =>
      language.mimetypes?.some((candidate) => mimeMatches(candidate, normalizedMime))
    )
    if (byMime) return byMime.id

    /* The router assigns `text/x-{id}` to Monaco languages without a declared
       MIME type; recover the id from the suffix. */
    if (normalizedMime.startsWith('text/x-')) {
      const fromSynthetic = normalizedMime.slice('text/x-'.length)
      if (languages.some((language) => language.id === fromSynthetic)) return fromSynthetic
    }
  }

  if (text.startsWith('#!/') && languages.some((language) => language.firstLine)) {
    const firstLine = text.slice(0, text.indexOf('\n') === -1 ? text.length : text.indexOf('\n'))
    const byShebang = languages.find((language) => {
      if (!language.firstLine) return false
      try {
        return new RegExp(language.firstLine).test(firstLine)
      } catch {
        return false
      }
    })
    if (byShebang) return byShebang.id
  }

  return 'plaintext'
}

export interface FenceLanguage {
  readonly id: string
  readonly label: string
}

/**
 * Resolve the language for a Markdown fenced code block from its label
 * (```` ```python ````): exact language id, then case-insensitive alias
 * (`bash`, `shell`, `sh`), then a dotted extension (`.tsx`). `undefined` means
 * "plain fenced block — render without highlighting".
 *
 * Direct `tokenize` labels are mapped first so shortcuts like `cpp` or `html`
 * need no disambiguation: unlike alias matching, this is exact and greedy.
 */
export function resolveFenceLanguage(
  monaco: MonacoGlobal,
  label: string
): FenceLanguage | undefined {
  const trimmed = label.trim().toLowerCase()
  if (!trimmed) return undefined

  /* Common shortcuts with a single, deterministic id — avoids alias matches
     like `shell` also hitting csharp/fsharp/powershell. */
  const shortcuts: Readonly<Record<string, string>> = {
    sh: 'shell',
    bash: 'shell',
    shell: 'shell',
    zsh: 'shell',
    js: 'javascript',
    jsx: 'javascript',
    mjs: 'javascript',
    cjs: 'javascript',
    ts: 'typescript',
    tsx: 'typescript',
    mts: 'typescript',
    cts: 'typescript',
    py: 'python',
    python: 'python',
    rb: 'ruby',
    rs: 'rust',
    golang: 'go',
    cs: 'csharp',
    json: 'json',
    jsonc: 'json',
    html: 'html',
    htm: 'html',
    xml: 'xml',
    css: 'css',
    md: 'markdown',
    markdown: 'markdown',
  }
  const byShortcut = shortcuts[trimmed]
  if (byShortcut) {
    const language = monaco.languages.getLanguages().find((candidate) => candidate.id === byShortcut)
    if (language) return { id: language.id, label: byShortcut }
  }

  const languages = monaco.languages.getLanguages()

  const byId = languages.find((language) => language.id.toLowerCase() === trimmed)
  if (byId) return { id: byId.id, label: byId.id }

  for (const language of languages) {
    const alias = (language.aliases ?? []).find(
      (candidate) => candidate.toLowerCase() === trimmed
    )
    if (alias) return { id: language.id, label: alias }
  }

  if (trimmed.startsWith('.')) {
    const bare = trimmed.slice(1)
    const byExtension = languages.find((language) =>
      language.extensions?.some((candidate) => stripDot(candidate).toLowerCase() === bare)
    )
    if (byExtension) return { id: byExtension.id, label: byExtension.id }
  }

  return undefined
}