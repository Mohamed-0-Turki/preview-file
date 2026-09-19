# `src/previewers/` — file → typed result

Previewers are the **first pipeline stage**. They are cheap and pure: they read the
bytes and repackage them into a normalized `PreviewResult { type, data }` with a
stable, one-word `result.type`. Parsing and DOM work happen later in the renderer.

> Importing `src/previewers/index.js` **registers all built-in previewers** (side
> effect). The root `src/index.ts` does this once at package import time.

## Contract

```ts
interface Previewer {
  readonly name: string
  readonly supportedMimeTypes: readonly string[]
  canPreview(mimeType: string, name?: string): boolean
  preview(file: FileInput, options?: PreviewOptions): Promise<PreviewResult>
}
```

`FileInput` is the normalized `{ name, mimeType, data: Uint8Array }` produced by the
sources layer. Only exported via `src/types.ts`.

## Modules

| Module | Content |
| --- | --- |
| `types.ts` | The `Previewer` interface (moved here from `src/previewer.ts`). |
| `registry.ts` | `getPreviewer(mime, name?)`, `registerPreviewer(Class)`, `clearPreviewers()`. Built on the generic `createRegistry` from `src/utils/registry.ts` (keys = `supportedMimeTypes`, predicate = `canPreview`). The optional file name is passed to every fallback predicate so capability-aware previewers (Code/Monaco) can resolve the file against Monaco's own language metadata. |
| `result-types.ts` | Result-type constant + discriminators for `result.data` shapes (`isBlobResultData`, `isWordResultData`, `isSpreadsheetResultData`, `isPresentationResultData`, `isCsvResultData`, `isCodeResultData`, `isMarkdownResultData`, `isArchiveResultData`). Renderers use these to narrow `data` safely instead of reimplementing per-vendor MIME checks. |
| `text.ts`, `image.ts`, `csv.ts`, `pdf.ts`, `word.ts`, `excel.ts`, `presentation.ts`, `code.ts`, `markdown.ts`, `archive.ts` | One previewer per format. |

## Result types

| Previewer | Input MIME(s) | Result `type` | Result `data` |
| --- | --- | --- | --- |
| Code | any file Monaco's own language metadata recognizes — exact name, extension, or declared MIME (see `canMonacoPreview` in `src/utils/monaco-capabilities.ts`), minus whatever specialized previewers own by exact MIME key | `text/code` | `{ text, name, mimeType }` |
| Markdown | `text/markdown` | `text/markdown` | `{ text, name, mimeType }` |
| Text | `text/plain` | `text/plain` | `{ text }` |
| Image | any `image/*` | same as input | `{ blob }` |
| CSV | `text/csv` | `text/csv` | `{ text }` |
| PDF | `application/pdf` (+ legacy aliases) | `application/pdf` | `{ blob }` |
| Word | msword / vnd.word family | `application/vnd.word` | `{ blob, format }` (`docx\|docm\|dotx\|dotm\|doc\|dot`) |
| Excel | ms-excel / spreadsheetml | `application/vnd.spreadsheet` | `{ blob, format }` |
| Presentation | ms-powerpoint / presentationml / vnd.oasis.opendocument.presentation | `application/vnd.presentation` | `{ blob, format }` (`pptx\|pptm\|potx\|potm\|ppsx\|ppsm\|ppt\|pps\|pot\|odp`) |
| Archive | zip / tar / gzip / x-gzip / x-tar / x-gtar / x-compressed-tar | `application/x-archive` | `{ bytes, name, format }` (`zip\|tar\|tgz\|gz`; `tgz` covers `.tar.gz`) |

Word, Excel and Presentation normalize every vendor MIME into one result type;
`format` lets the renderer choose between a real render and the legacy fallback card.
The Archive previewer keeps the raw bytes and the resolved `format` in its result;
the actual format detection is delegated to `resolveArchiveFormat` (`src/archives/`),
which keys on the file name (`sample.tar.gz`, `x.tgz`) and then on MIME.

> **Registration order matters for Code vs Text.** `CodePreviewer` and
> `MarkdownPreviewer` are registered before `TextPreviewer` in `index.ts`.
> `TextPreviewer`'s predicate is `mimeType.startsWith('text/')`, which would otherwise
> capture every code and markdown MIME; the registry resolves predicates in registration
> order, so Code and Markdown must stay ahead of Text. Code is also *capability-aware,
> not a blanket `text/x-*` catch-all*: it claims a file only when Monaco's own language
> index resolves it (`canMonacoPreview`), so declared `type="text/plain"` files (`.txt`,
> `.log`) stay on the lightweight text renderer and unknown `text/x-*` types are never
> forced into Monaco.
>
> **Markdown owns `text/markdown` by exact key.** It is deliberately absent from
> `CODE_MIME_TYPES`, so `.md`/`.markdown` resolve to `MarkdownPreviewer` (the exact
> `supportedMimeTypes` key wins over Text's predicate) while `.mdx` stays on Code.

## Rules for contributors

- Keep `preview()` free of DOM work and heavy parsing — repackage bytes, don't render.
- When you add a format, (1) implement `Previewer`, (2) register it in `index.ts`,
  (3) add a `data` discriminator in `result-types.ts` if the shape is new.
- Follow the naming convention `{Format}Previewer` + file `{format}.ts`.