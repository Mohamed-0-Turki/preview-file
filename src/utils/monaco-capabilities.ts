import { extensionFrom } from './extension.js'
import {
  EXTENSION_TO_LANGUAGE,
  FILENAME_TO_LANGUAGE,
  LANGUAGE_TO_MIMETYPE,
  MONACO_MIME_TYPES,
} from './monaco-languages.js'

/**
 * Pre-fetch Monaco capability questions, answered from the generated routing
 * index (`src/utils/monaco-languages.ts`) so preview resolution never has to
 * load Monaco just to decide whether it could render a file.
 *
 * These functions decide **"does Monaco know this file?"** — by exact file
 * name, extension or declared MIME — exactly the way Monaco autodetects at
 * render time (`src/renderers/monaco-language.ts`), so routing can never drift
 * from what Monaco actually supports. They are capability-aware: a file is
 * routed to Monaco only when Monaco's own language metadata recognizes it.
 */

/** Monaco languages owned by a dedicated previewer. Monaco declares them, but
 *  routing them to the code previewer would steal the file from its specialized
 *  previewer. Only `plaintext` qualifies: `.txt`/`.log` must stay on the text
 *  renderer. `markdown` is deliberately NOT excluded — Monaco resolves `.md*`
 *  to its `markdown` language, the exact-`text/markdown` key keeps the Markdown
 *  previewer's priority, and the raw Monaco "Code" view is today's behavior for
 *  markdown-family files with non-`text/markdown` MIMEs. */
const NON_CODE_LANGUAGES = new Set(['plaintext'])

/** MIME types Monaco's `plaintext` language declares for itself. They describe
 *  plain text (`.txt`, `.log`), not source code, so Monaco must never claim
 *  them. */
const NON_CODE_MIMES = new Set(['text/plain', 'text/plaintext'])

const MONACO_MIME_SET = new Set(MONACO_MIME_TYPES)

/** Every language id Monaco ships, collected across its extension, filename and
 *  MIME registration. */
const MONACO_LANGUAGE_IDS = new Set<string>()
for (const id of Object.values(EXTENSION_TO_LANGUAGE)) MONACO_LANGUAGE_IDS.add(id)
for (const id of Object.values(FILENAME_TO_LANGUAGE)) MONACO_LANGUAGE_IDS.add(id)
for (const id of Object.keys(LANGUAGE_TO_MIMETYPE)) MONACO_LANGUAGE_IDS.add(id)

/** Routing index → the language that declares it. Built from the first declared
 *  MIME per language, mirroring `detectType`'s `text/x-{id}` synthesis. */
const MIME_TO_LANGUAGE = new Map<string, string>()
for (const [languageId, mime] of Object.entries(LANGUAGE_TO_MIMETYPE)) {
  MIME_TO_LANGUAGE.set(mime, languageId)
}

/** Normalize a MIME type for comparison: lowercase, drop any `;charset=…`
 *  parameters browsers sometimes append. */
function normalizeMimeType(mimeType: string): string {
  return mimeType.split(';')[0].trim().toLowerCase()
}

/**
 * Resolve a file to the Monaco language id it maps to, using only the generated
 * routing index. Order mirrors render-time resolution: exact file name, then
 * extension, then declared MIME (including the synthetic `text/x-{id}` MIME the
 * router assigns to languages without a declared one). Returns `undefined` when
 * Monaco has no metadata for the file.
 */
export function resolveMonacoLanguageId(name: string, mimeType: string): string | undefined {
  if (name) {
    const byFilename = FILENAME_TO_LANGUAGE[name.toLowerCase()]
    if (byFilename) return byFilename

    const extension = extensionFrom(name)
    if (extension) {
      const byExtension = EXTENSION_TO_LANGUAGE[extension]
      if (byExtension) return byExtension
    }
  }

  const mime = normalizeMimeType(mimeType)
  if (mime) {
    const byMime = MIME_TO_LANGUAGE.get(mime)
    if (byMime) return byMime

    if (mime.startsWith('text/x-')) {
      const fromSynthetic = mime.slice('text/x-'.length)
      if (MONACO_LANGUAGE_IDS.has(fromSynthetic)) return fromSynthetic
    }
  }

  return undefined
}

/**
 * Can Monaco preview this file? `true` exactly when Monaco's own language
 * metadata recognizes it — by file name, extension or declared MIME — and the
 * file is not owned by a more specialized previewer (`plaintext` and its MIME
 * types). Unknown files are never forced into Monaco.
 */
export function canMonacoPreview(name: string, mimeType: string): boolean {
  const byNameOrExtension = resolveMonacoLanguageId(name, mimeType)
  if (byNameOrExtension) return !NON_CODE_LANGUAGES.has(byNameOrExtension)

  const mime = normalizeMimeType(mimeType)
  if (!mime) return false

  /* A MIME Monaco declares for one of its languages is Monaco-supported, even
     when the owning language is not in the first-MIME routing table. */
  if (MONACO_MIME_SET.has(mime)) return !NON_CODE_MIMES.has(mime)

  /* Synthetic `text/x-{id}` assigned by `detectType` to Monaco languages that
     declare no MIME — recover the id and confirm it is a real language. */
  if (mime.startsWith('text/x-')) {
    const languageId = mime.slice('text/x-'.length)
    return MONACO_LANGUAGE_IDS.has(languageId) && !NON_CODE_LANGUAGES.has(languageId)
  }

  return false
}