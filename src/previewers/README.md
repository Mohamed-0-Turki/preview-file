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
  canPreview(mimeType: string): boolean
  preview(file: FileInput, options?: PreviewOptions): Promise<PreviewResult>
}
```

`FileInput` is the normalized `{ name, mimeType, data: Uint8Array }` produced by the
sources layer. Only exported via `src/types.ts`.

## Modules

| Module | Content |
| --- | --- |
| `types.ts` | The `Previewer` interface (moved here from `src/previewer.ts`). |
| `registry.ts` | `getPreviewer(mime)`, `registerPreviewer(Class)`, `clearPreviewers()`. Built on the generic `createRegistry` from `src/utils/registry.ts` (keys = `supportedMimeTypes`, predicate = `canPreview`). |
| `result-types.ts` | Result-type constant + discriminators for `result.data` shapes (`isBlobResultData`, `isWordResultData`, `isSpreadsheetResultData`, `isPresentationResultData`, `isCsvResultData`). Renderers use these to narrow `data` safely instead of reimplementing per-vendor MIME checks. |
| `text.ts`, `image.ts`, `csv.ts`, `pdf.ts`, `word.ts`, `excel.ts`, `presentation.ts` | One previewer per format. |

## Result types

| Previewer | Input MIME(s) | Result `type` | Result `data` |
| --- | --- | --- | --- |
| Text | `text/plain` | `text/plain` | `{ text }` |
| Image | any `image/*` | same as input | `{ blob }` |
| CSV | `text/csv` | `text/csv` | `{ text }` |
| PDF | `application/pdf` (+ legacy aliases) | `application/pdf` | `{ blob }` |
| Word | msword / vnd.word family | `application/vnd.word` | `{ blob, format }` (`docx\|docm\|dotx\|dotm\|doc\|dot`) |
| Excel | ms-excel / spreadsheetml | `application/vnd.spreadsheet` | `{ blob, format }` |
| Presentation | ms-powerpoint / presentationml / vnd.oasis.opendocument.presentation | `application/vnd.presentation` | `{ blob, format }` (`pptx\|pptm\|potx\|potm\|ppsx\|ppsm\|ppt\|pps\|pot\|odp`) |

Word, Excel and Presentation normalize every vendor MIME into one result type;
`format` lets the renderer choose between a real render and the legacy fallback card.

## Rules for contributors

- Keep `preview()` free of DOM work and heavy parsing — repackage bytes, don't render.
- When you add a format, (1) implement `Previewer`, (2) register it in `index.ts`,
  (3) add a `data` discriminator in `result-types.ts` if the shape is new.
- Follow the naming convention `{Format}Previewer` + file `{format}.ts`.