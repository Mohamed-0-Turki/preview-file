# `src/utils/` — framework-agnostic helpers

Small, pure helpers shared across layers. **No file in this directory imports from
any other layer** (`src/previewers/`, `src/renderers/`, `src/controls/`, `src/sources/`);
it is the dependency bottom of the package. New shared logic belongs here.

| Module | Export | Purpose |
| --- | --- | --- |
| `registry.ts` | `createRegistry<T>(spec)` | Generic register/get/clear factory. `spec.getKeys(entry)` returns the key aliases for an entry, `spec.canHandle(entry, key)` refines lookup. Powers both `previewers/registry.ts` and `renderers/registry.ts`, so lookups are consistent across layers. |
| `detect.ts` | `detectType(name, declaredType?)` | Resolve the effective MIME type from a declared type plus the file extension. Trusts a declared non-`application/octet-stream` type; falls back to `mimeFromExtension()`. |
| `extension.ts` | `extensionFrom(name)` | Lowercased extension of a file name, or `''` (no dot, no trailing dot artifacts). Shared by MIME detection and the Word/Excel previewers. |
| `mime.ts` | `mimeFromExtension(extension)` | Extension → MIME table lookup. |
| `csv.ts` | `parseCsv(text)` | CSV text → rows (`string[][]`). Moved here so both the CSV renderer and CSV previewer can use it (parse cost is shared and matched). |
| `math.ts` | `clamp(value, min, max)` | Clamp helper shared by the magnifier and zoomable image logic. |

## Rules for contributors

- No imports from other layers — only `types.ts` (cross-cutting) and standard lib.
- Pure functions where possible; no DOM access.
- Anything used by more than one module should be moved here instead of being
  re-implemented per module (see the history: duplicated `clamp`, duplicated
  extension parsing, and a renderer-only `parseCsv` were consolidated here).