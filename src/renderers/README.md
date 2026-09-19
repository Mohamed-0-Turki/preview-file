# `src/renderers/` — result → DOM + capabilities

Renderers are the **second pipeline stage**: they turn a previewer's typed
`PreviewResult` into DOM inside the container and return a `PreviewAdapter`
describing which toolbar actions they support. `undefined`/`void` means a plain,
non-interactive view — no toolbar mounts.

> Importing `src/renderers/index.js` **registers all built-in renderers** (side
> effect). The root `src/index.ts` does this once at package import time.

## Contract

```ts
interface Renderer {
  readonly name: string
  readonly supportedTypes: readonly string[]
  canRender(type: string): boolean
  render(container, result, options?): PreviewAdapter | void | Promise<...>
  destroy?(container): void
}
```

Heavy engines are loaded **only inside `render()`**: `pdfjs-dist` is dynamic-imported
(PDF), `docx-preview` (Word), `xlsx` (Excel), `pptx-viewer` (PowerPoint); Monaco Editor
(Code) is loaded lazily through its AMD build — `monaco-loader.ts` injects
`vs/loader.js` as a classic script, calls `require.config({ baseUrl, paths: { vs } })`
(which makes the workers and CSS resolve cross-origin), then `require(['vs/editor/editor.main'])`.
A consumer that never opens a PDF never pays for pdf.js; one that never previews code
never fetches Monaco.

## Modules

| Module | Content |
| --- | --- |
| `types.ts` | The `Renderer` interface. |
| `registry.ts` | `getRenderer(type)`, `registerRenderer(Class)`, `clearRenderers()`. Built on the generic `createRegistry` from `src/utils/registry.ts`. |
| `docview.ts` | Shared paged-document infrastructure for PDF, Word and PowerPoint: `createDocStage()` (DOM) and `createPagedDocController(host)` (all layout state — scale, fit mode, single-page, current page — plus `PagedDocViewState` callbacks so renderers draw only visible pages). Hosts pick the initial fit via `initialFit` (pages for slide decks). **Do not duplicate paged-doc logic in a new renderer; build on this.** |
| `render-state.ts` | `createRenderState<T>()` → per-container state with `set(container, attachment)` / `destroyFor(container)`. Every renderer uses it instead of hand-rolled `WeakMap` boilerplate. |
| `legacy-fallback.ts` | Shared "Preview unavailable" card + adapter for formats that cannot be rendered in-browser (used by Word and PowerPoint); callers supply the message. |
| `interaction/` | Barrel over `magnifier.ts` (vector-image loupe) and `zoomable.ts` (canvas zoom/pan), sharing `clamp` from `src/utils/`. |
| `virtual-table.ts` | Shared virtualized grid used by Excel and CSV (only visible rows materialized). |
| `monaco-loader.ts` | Lazy AMD loader for Monaco: `loadMonaco(options)` (cached; resets on failure) injects `vs/loader.js`, configures `require`, resolves when `editor.main` is ready. Honors `options.monaco.baseUrl` and `setMonacoBaseUrl` via `resolveMonacoBaseUrl` (`src/monaco.ts`). |
| `monaco-language.ts` | Maps a source file to a Monaco language id without a maintained list: queries `monaco.languages.getLanguages()` — exact filename, then extension, then declared MIME, then a `#!` shebang on the first line — defaulting to `plaintext`. |
| `monaco-types.ts` | Self-contained typing shim for the tiny Monaco surface this package consumes. `monaco-editor` is a devDependency for parity checks only and is never statically imported (see ADR-0013). |
| `text.ts`, `image.ts`, `csv.ts`, `pdf.ts`, `word.ts`, `excel.ts`, `presentation.ts`, `code.ts` | One renderer per result type. |

The Code renderer is registered **before** Text in `index.ts` (its key is the exact
`text/code` type, so order is defensive — Code's `canRender` is an equality check,
unlike the previewer side where order genuinely matters). It creates a read-only,
`automaticLayout` Monaco editor inside an absolutely-positioned host, maps zoom to
`fontSize`, reuses the `TextControls` capability for copy + word wrap, and disposes
the editor instance in `destroy()`.

## Rules for contributors

- Add a renderer as `{format}.ts` + `{Format}Renderer`, register it in `index.ts`.
- Return capabilities via `PreviewAdapter` (defined in `src/controls/types.ts`);
  the toolbar picks them up automatically — never render controls yourself.
- Register an attachment with `createRenderState.set(container, ...)` and unwind it
  in `destroy()`. Every resource created in `render()` (observers, rAF loops, dynamic
  imports, canvas contexts) must be torn down in `destroy()`.
- Prefer `src/utils/` for shared math/parsing; never re-implement `clamp`,
  extension parsing, or CSV parsing locally.