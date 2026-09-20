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
  render(container, result, options?, context?): PreviewAdapter | void | Promise<...>
  destroy?(container): void
}

interface RenderContext {
  previewSource(source, container, options?): Promise<...>
  clearPreview(container): void
}
```

`context` is an optional fourth argument threaded in by `preview()` — it exists so a
renderer can recursively preview a secondary source *without importing `preview.ts`
against the dependency direction of the pipeline*. `preview.ts` does **not** depend on
any renderer; renderers must not depend on `preview.ts`. The Archive renderer uses
`context.previewSource` to open files inside an archive with the full pipeline (toolbar,
loaders, teardown) nested inside its own host, and `context.clearPreview` to tear that
nested preview down when navigating.

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
| `types.ts` | The `Renderer` interface and the `RenderContext` handed to `render()` so renderers can preview nested sources without importing `preview.ts`. |
| `registry.ts` | `getRenderer(type)`, `registerRenderer(Class)`, `clearRenderers()`. Built on the generic `createRegistry` from `src/utils/registry.ts`. |
| `docview.ts` | Shared paged-document infrastructure for PDF, Word and PowerPoint: `createDocStage()` (DOM) and `createPagedDocController(host)` (all layout state — scale, fit mode, single-page, current page — plus `PagedDocViewState` callbacks so renderers draw only visible pages). Hosts pick the initial fit via `initialFit` (pages for slide decks). **Do not duplicate paged-doc logic in a new renderer; build on this.** |
| `render-state.ts` | `createRenderState<T>()` → per-container state with `set(container, attachment)` / `destroyFor(container)`. Every renderer uses it instead of hand-rolled `WeakMap` boilerplate. |
| `legacy-fallback.ts` | Shared "Preview unavailable" card + adapter for formats that cannot be rendered in-browser (used by Word and PowerPoint); callers supply the message. |
| `interaction/` | Barrel over `magnifier.ts` (vector-image loupe) and `zoomable.ts` (canvas zoom/pan), sharing `clamp` from `src/utils/`. |
| `virtual-table.ts` | Shared virtualized grid used by Excel and CSV (only visible rows materialized). |
| `monaco-loader.ts` | Lazy AMD loader for Monaco: `loadMonaco(options)` (cached; resets on failure) injects `vs/loader.js`, configures `require`, resolves when `editor.main` is ready. Honors `options.monaco.baseUrl` and `setMonacoBaseUrl` via `resolveMonacoBaseUrl` (`src/monaco.ts`). |
| `monaco-language.ts` | Maps a source file to a Monaco language id without a maintained list: queries `monaco.languages.getLanguages()` — exact filename, then extension, then declared MIME, then a `#!` shebang on the first line — defaulting to `plaintext`. |
| `monaco-types.ts` | Self-contained typing shim for the tiny Monaco surface this package consumes. `monaco-editor` is a devDependency for parity checks only and is never statically imported (see ADR-0013). |
| `text.ts`, `image.ts`, `csv.ts`, `pdf.ts`, `word.ts`, `excel.ts`, `presentation.ts`, `code.ts`, `archive.ts` | One renderer per result type. |

The Code renderer is registered **before** Text in `index.ts` (its key is the exact
`text/code` type, so order is defensive — Code's `canRender` is an equality check,
unlike the previewer side where order genuinely matters). It creates a read-only,
`automaticLayout` Monaco editor inside an absolutely-positioned host, maps zoom to
`fontSize`, reuses the `TextControls` capability for copy + word wrap, and disposes
the editor instance in `destroy()`.

The Archive renderer (`archive.ts`) is registered after Presentation. It builds a
self-contained file browser from `ArchiveProvider` (`src/archives/`): breadcrumb +
history navigation, virtualized rows, per-file download, a nested preview host fed
through `context.previewSource`. Encrypted archives follow a **detect → unlock →
browse** contract: `boot()` calls `provider.requiresPassword()` first and, for an
encrypted archive, renders *only* a password prompt card — no rows, breadcrumbs,
sizes or search are shown, and navigation is inert. Only a valid password unlocks the
archive; `provider.list()` then runs and the normal tree builds. A wrong password
keeps the prompt with an error, and Cancel sets a "remains locked" state with a Retry
button. The renderer returns an empty `PreviewAdapter` (`{}`) so the outer toolbar
still shows **Download** for the *original* archive. It owns
a session counter + a pending-frame guard so navigation races (a slow inner file
resolving after you've moved away, queued rAF paints) can never write into a stale view;
all of it unwinds via the `destroy` attachment and `context.clearPreview`. Depth is
bounded in practice — nesting happens only when an archive contains another archive,
whose preview recurses through the same `previewSource`.

## Rules for contributors

- Add a renderer as `{format}.ts` + `{Format}Renderer`, register it in `index.ts`.
- Return capabilities via `PreviewAdapter` (defined in `src/controls/types.ts`);
  the toolbar picks them up automatically — never render controls yourself.
- Register an attachment with `createRenderState.set(container, ...)` and unwind it
  in `destroy()`. Every resource created in `render()` (observers, rAF loops, dynamic
  imports, canvas contexts) must be torn down in `destroy()`.
- Prefer `src/utils/` for shared math/parsing; never re-implement `clamp`,
  extension parsing, or CSV parsing locally.