# `src/utils/` — framework-agnostic helpers

Small, pure helpers shared across layers. **No file in this directory imports from
any other layer** (`src/previewers/`, `src/renderers/`, `src/controls/`, `src/sources/`);
it is the dependency bottom of the package. New shared logic belongs here.

| Module | Export | Purpose |
| --- | --- | --- |
| `registry.ts` | `createRegistry<T, C>(spec)` | Generic register/get/clear factory. `spec.getKeys(entry)` returns the key aliases for an entry, `spec.canHandle(entry, key, context?)` refines lookup (context is optional — e.g. the file name, so a fallback can decide on more than the key alone). Powers both `previewers/registry.ts` and `renderers/registry.ts`, so lookups are consistent across layers. |
| `detect.ts` | `detectType(name, declaredType?)` | Resolve the effective MIME type from a declared type plus the file extension. Trusts a declared non-`application/octet-stream` type; falls back to `mimeFromExtension()` then Monaco's extension/file-name index. |
| `extension.ts` | `extensionFrom(name)` | Lowercased extension of a file name, or `''` (no dot, no trailing dot artifacts). Shared by MIME detection and the Word/Excel previewers. |
| `mime.ts` | `mimeFromExtension(extension)`, `isCodeMime(mimeType)`, `CODE_MIME_TYPES` | Extension → MIME table lookup. `CODE_MIME_TYPES` are the code previewer's exact-match keys; `isCodeMime` is the MIME-only view of Monaco's capability check. |
| `monaco-capabilities.ts` | `canMonacoPreview(name, mimeType)`, `resolveMonacoLanguageId(name, mimeType)` | Ask "does Monaco know this file?" from the generated routing index before Monaco is loaded — exact filename, extension, declared MIME, or synthetic `text/x-{id}`. This is what makes the code previewer capability-aware instead of MIME-list-aware. |
| `monaco-languages.ts` | `EXTENSION_TO_LANGUAGE`, `FILENAME_TO_LANGUAGE`, `LANGUAGE_TO_MIMETYPE`, `MONACO_MIME_TYPES` | Auto-generated routing index built from Monaco's own language registry (see `scripts/generate-monaco-languages.mjs`). Do not edit by hand. |
| `csv.ts` | `parseCsv(text)` | CSV text → rows (`string[][]`). Moved here so both the CSV renderer and CSV previewer can use it (parse cost is shared and matched). |
| `math.ts` | `clamp(value, min, max)` | Clamp helper shared by the magnifier and zoomable image logic. |

## Rules for contributors

- No imports from other layers — only `types.ts` (cross-cutting) and standard lib.
- Pure functions where possible; no DOM access.
- Anything used by more than one module should be moved here instead of being
  re-implemented per module (see the history: duplicated `clamp`, duplicated
  extension parsing, and a renderer-only `parseCsv` were consolidated here).