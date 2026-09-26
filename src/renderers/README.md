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
any renderer; renderers must not depend on `preview.ts`. Renderers that nest a
secondary source use `context.previewSource` to mount it with the full pipeline
(toolbar, loaders, teardown) inside their own host and `context.clearPreview` to tear
the nested preview down when navigating. The Archive renderer is intentionally the
exception: it is explorer-only and does not consume the `RenderContext`.

Heavy engines are loaded **only inside `render()`**: `pdfjs-dist` is dynamic-imported
(PDF), `docx-preview` (Word), `xlsx` (Excel). PowerPoint loads nothing — it is parsed and
painted in-tree; see [ADR-0015](../../docs/adr/0015-in-tree-ooxml-engine.md); Monaco Editor
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
| `archive-ui.ts` | Shared archive explorer DOM/format helpers used by the Archive renderer: `ROW_HEIGHT`, `formatSize`, `iconEl`, `iconButton`. |
| `archive-styles.ts` | The Archive renderer's stylesheet + injection: `ARCHIVE_CSS`, `ARCHIVE_STYLE_ID`, `ensureArchiveStyles()`. |
| `text.ts`, `image.ts`, `csv.ts`, `pdf.ts`, `word.ts`, `excel.ts`, `code.ts`, `archive.ts` | One renderer per result type. |
| `presentation/index.ts` | The PowerPoint renderer. Opens the OPC package with `src/ooxml/`, paints slides with `ooxml/render.ts`, and makes each slide a page in the shared paged-document controller. The only PowerPoint file that knows about previews. |
| `ooxml/` | The in-tree OOXML painter: `render.ts` (slide walker), `paint.ts` (DrawingML → CSS/SVG), `path.ts` (preset/custom geometry), `text.ts`, `table.ts`, `chart.ts`, `assets.ts` (object URLs), `dom.ts`. Knows nothing about previews or the toolbar. |

The Code renderer is registered **before** Text in `index.ts` (its key is the exact
`text/code` type, so order is defensive — Code's `canRender` is an equality check,
unlike the previewer side where order genuinely matters). It creates a read-only,
`automaticLayout` Monaco editor inside an absolutely-positioned host, maps zoom to
`fontSize`, reuses the `TextControls` capability for copy + word wrap, and disposes
the editor instance in `destroy()`.

The Archive renderer (`archive.ts`) is registered after Presentation. It renders a
**single-pane structure explorer** — no nested preview, no second pane, no mobile
drawer. `.pf-arc-tree` owns all archive chrome: back/forward/up/root history,
breadcrumbs, format badge, virtualized rows with sizes and per-file download, and
a footer with counts. Folders navigate; **selecting a file only highlights the
row** (`.pf-arc-row--cur` + `aria-current`/`aria-selected`) — it never opens a
nested preview, so the explorer and the outer chrome (top/bottom/rails) never
share space and the outer toolbar's **Download** stays the archive's only
content action.
Encrypted archives follow a **detect → unlock → browse** contract: `render()` calls
`provider.requiresPassword()` first and, for an encrypted archive, shows *only* a
Liquid Glass unlock card (`.pf-arc-lockcard`) behind a `.pf-arc-lock` overlay
spanning the whole explorer — no rows, breadcrumbs, badge or footer counts are
rendered (they're cleared and inert), so no metadata leaks. The card has a lock
icon, title, hint, password field with a show/hide toggle (eye/eye-off), an
Unlock primary button with a spinner while validating, a Cancel ghost button
(Escape also cancels), and inline `role=alert` errors ("Please enter a password.",
"Incorrect password. Try again."). A valid password calls `provider.unlock()`
then `provider.list()` and builds the normal tree; a wrong one keeps the modal
with the field flagged red and the input re-selected. The renderer returns an
empty `PreviewAdapter` (`{}`). It owns a session counter + a pending-frame guard
so navigation races (a slow unlock/list resolving after a cancellation, queued
rAF paints) can never write into a stale view; everything unwinds via the
`destroy` attachment.

## Rules for contributors

- Add a renderer as `{format}.ts` + `{Format}Renderer`, register it in `index.ts`.
- Return capabilities via `PreviewAdapter` (defined in `src/controls/types.ts`);
  the toolbar picks them up automatically — never render controls yourself.
- **Theme from tokens.** Every color must come from the light-only `--pf-*`
  Liquid Glass tokens (`var(--pf-xxx, fallback)`); never hardcode a hex that
  isn't a token fallback. There is no dark theme and no theme API.
- Register an attachment with `createRenderState.set(container, ...)` and unwind it
  in `destroy()`. Every resource created in `render()` (observers, rAF loops, dynamic
  imports, canvas contexts) must be torn down in `destroy()`.
- Prefer `src/utils/` for shared math/parsing; never re-implement `clamp`,
  extension parsing, or CSV parsing locally.