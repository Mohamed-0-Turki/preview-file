import { extensionFrom } from './extension.js'
import { mimeFromExtension, mimeFromFilename } from './mime.js'
import { EXTENSION_TO_LANGUAGE, FILENAME_TO_LANGUAGE, LANGUAGE_TO_MIMETYPE } from './monaco-languages.js'

/**
 * Generic MIME types that carry no format information and tell us nothing about
 * the file. Browsers report most text-ish and code files this way (`text/plain`)
 * and Chrome reports TypeScript `.ts` as `video/mp2t`, so for these we prefer
 * the file extension over the declared type.
 */
const GENERIC_TYPES = new Set(['application/octet-stream', 'text/plain', 'video/mp2t'])

/** The MIME type previewers use to route a Monaco-recognized file to the code
 *  previewer: the language's own declared MIME when it has one, else a stable
 *  synthetic `text/x-{languageId}` that `isCodeMime` accepts and the code
 *  renderer's resolver can map straight back to the language id. */
function languageMimeType(languageId: string): string {
  return LANGUAGE_TO_MIMETYPE[languageId] ?? `text/x-${languageId}`
}

export function detectType(name: string, declaredType?: string): string {
  const declared = declaredType?.trim()
  if (declared && !GENERIC_TYPES.has(declared)) {
    return declared
  }

  const extension = extensionFrom(name)
  const fromExtension = mimeFromExtension(extension)
  if (fromExtension) return fromExtension

  /* Extension-less source files (Dockerfile, Makefile, tsconfig.json, …) only
     surface through their name. */
  const fromFilename = mimeFromFilename(name)
  if (fromFilename) return fromFilename

  /* Any remaining file whose extension or name Monaco recognizes as one of its
     languages is routed as code. The table is generated from Monaco's own
     registry (see src/utils/monaco-languages.ts), so every language Monaco
     ships is reachable without hand-curating a list. */
  const byLanguageExtension = EXTENSION_TO_LANGUAGE[extension]
  if (byLanguageExtension) return languageMimeType(byLanguageExtension)

  const byLanguageFilename = FILENAME_TO_LANGUAGE[name.toLowerCase()]
  if (byLanguageFilename) return languageMimeType(byLanguageFilename)

  return declared || 'application/octet-stream'
}