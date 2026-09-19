# Architecture

This document describes how `preview-file` is organized and how the preview pipeline works. It targets maintainers and anyone extending the package.

---

## Overview

`preview-file` is a small, dependency-light orchestrator. It does **not** render anything itself — it resolves a source, hands it to a format-specific **previewer**, hands the previewer's typed result to a **renderer**, and finally mounts a **capability-driven toolbar** based on what the renderer reports it can do.

```
 source (File | Blob | URL)
        │
        ▼
 createSource()          src/sources/source.ts      → { name, blob }
        │
        ▼
 detectType()            src/utils/detect.ts        → MIME type
        │
        ▼
 getPreviewer(mime)      src/previewers/registry.ts → Previewer (or error card)
        │
        ▼
 previewer.preview()     src/previewers/*.ts        → PreviewResult { type, data }
        │
        ▼
 getRenderer(type)       src/renderers/registry.ts  → Renderer (or error card)
        │
        ▼
 renderer.render()       src/renderers/*.ts         → DOM + PreviewAdapter (optional)
        │
        ▼
 mountControls()         src/controls/toolbar.ts    → glass toolbar UI
        │
        ▼
 activePreviews.set()    src/preview.ts             → teardown is registered
```

## Module map

```
src/
  index.ts             Public API surface (everything exported from here is stable)
  preview.ts           Orchestration: preview(), clearPreview(), error/state cards
  types.ts             Shared types (PreviewResult, PreviewOptions, FileInput, …)
  pdf-worker.ts        pdf.js worker URL resolution (setPdfWorkerSrc, CDN default)
  sources/             SourceInput → ResolvedSource (File / Blob / fetch URL)
  utils/               Framework-agnostic helpers (no imports from other layers)
    detect.ts          MIME resolution from declared type + extension
    extension.ts       extensionFrom(name) shared by detection and vendors
    mime.ts            Extension → MIME table
    csv.ts             parseCsv (moved here so both renderers and previewers reuse it)
    math.ts            clamp()
    registry.ts        createRegistry<T>() — generic register/get/clear factory
    index.ts           Barrel export
  previewers/          One Previewer per format; maps a FileInput to a typed result
    index.ts           Registers all built-in previewers (side effect of import)
    registry.ts        Previewer registry (built on utils/registry's createRegistry)
    types.ts           Previewer interface
    result-types.ts    Discriminators for result.data shapes
  renderers/           One Renderer per result type; produces DOM + PreviewAdapter
    index.ts           Registers all built-in renderers (side effect of import)
    registry.ts        Renderer registry (built on utils/registry's createRegistry)
    types.ts           Renderer interface
    render-state.ts    createRenderState() — per-container render state helper
    legacy-fallback.ts Shared "Preview unavailable" card (Word + Presentation fallbacks)
    docview.ts         Shared "paged document" stage + PagedDocController (PDF + Word + PowerPoint)
    virtual-table.ts   Shared virtualized table (Excel + CSV share it)
    interaction/       Shared pointer/wheel interaction helpers (magnifier, zoomable)
  controls/            Toolbar, download helper, capability types
    toolbar.ts         mountControls(): sticky navbar toolbar + overflow menu
    download.ts        downloadBlob(): Blob → <a download> fallback
    types.ts           PreviewAdapter, PreviewActions, and control group contracts
```

## The pipeline, step by step

### 1. `preview(source, container, options)` — `src/preview.ts`

- Guards on `typeof document === 'undefined'` and throws with a clear message (SSR safety).
- Immediately calls `clearPreview(container)` and bumps a per-container **generation counter** stored in a `WeakMap`. Every `await` after that checks generation through `isCurrent()`; stale work self-aborts so a slow fetch can never overwrite a newer preview.
- Shows a lightweight "Loading…" state, then resolves the source, detects the type, and runs the previewer.

### 2. Resolving the source — `src/sources/source.ts`

`SourceInput = File | Blob | string`.

- `File` → kept as-is, name preserved.
- `Blob` → name defaults to `"file"`.
- `string` → treated as a URL, fetched (arrayBuffer), name derived from the URL path, MIME taken from the response `content-type` (falling back to extension inference).

### 3. Type detection — `src/utils/detect.ts`

`detectType(name, declaredType)` trusts a declared non-`application/octet-stream` type, otherwise falls back to `mimeFromExtension()`. The registry then resolves a previewer by exact MIME match, then by `canPreview()` predicate — with the file name passed along so the Code (Monaco) previewer's fallback predicate answers "does Monaco recognize this file?" from Monaco's own language index (see `src/utils/monaco-capabilities.ts`) rather than a hand-maintained MIME list. Exact MIME keys always outrank the fallback, keeping PDF/Word/Excel/Presentation/image/Markdown/CSV/text ownership intact.

### 4. Previewers — `src/previewers/*.ts`

Previewers are *cheap and pure*: they repackage the bytes into a normalized `PreviewResult` plus a **stable, one-word result type**. This separation is deliberate — parsing and DOM work happen in the renderer, not here.

| Previewer | Source MIME(s) | Result type | Result data |
| --- | --- | --- | --- |
| Code | any file Monaco's own language metadata recognizes (name, extension, or declared MIME) — capability-aware, excluding what specialized previewers own | `text/code` | `{ text, name, mimeType }` |
| Text | `text/plain` | `text/plain` | `{ text }` |
| Image | `image/*` | same as input | `{ blob }` |
| CSV | `text/csv` | `text/csv` | `{ text }` |
| PDF | `application/pdf` (and `x-pdf`/`acrobat`/`text/pdf` aliases) | `application/pdf` | `{ blob }` |
| Word | `application/msword`, `application/vnd.word`-family MIMEs | `application/vnd.word` | `{ blob, format }` |
| Excel | `application/vnd.ms-excel`, `spreadsheetml`, `ms-excel` | `application/vnd.spreadsheet` | `{ blob, format }` |
| Presentation | `application/vnd.ms-powerpoint` (+ `presentationml` family), `application/vnd.oasis.opendocument.presentation` | `application/vnd.presentation` | `{ blob, format }` |

Word, Excel and Presentation result types are normalized so that renderers don't need to know every vendor MIME. Their `format` fields let the renderer decide between a real render and the legacy fallback: Word's `docx|docm|dotx|dotm` render, the rest fall back; Presentation's `pptx|pptm|potx|potm|ppsx|ppsm` render, while binary `ppt|pps|pot` and OpenDocument `odp` fall back.

### 5. Renderers — `src/renderers/*.ts`

Each renderer is lazy about its heavy dependency:

- PDF → `await import('pdfjs-dist')`; the worker is *not* bundled. `pdf.worker.mjs` is referenced by URL (`GlobalWorkerOptions.workerSrc`): a version-pinned CDN build by default, overridable via `setPdfWorkerSrc()` or `PreviewOptions.workerSrc` for self-hosted / CSP-locked deployments. This keeps the library free of bundler-specific imports (`?raw`, `?url`, `?worker`) so it resolves identically under Vite, webpack, Rollup, Next.js and vanilla ESM. If the worker URL cannot be loaded, pdf.js falls back to a main-thread fake worker and the preview still renders.
- Word → `await import('docx-preview')`.
- Excel → `await import('xlsx')`.
- Presentation → `await import('pptx-viewer')`. Slides are parsed once via `loadPresentation()` (returns `slideSize` in px + slide models + a `cleanup()`), then rendered to per-slide DOM/SVG with `renderSlideToElement()`. Each slide is a page in the shared paged-document controller, so navigation, zoom, fit and continuous/single-page mode come from `docview.ts`; visible slides are materialized lazily via `IntersectionObserver`, wrapped so a failed slide degrades to an in-slide notice. The host requests `initialFit: 'page'` so a whole slide always fits the container.

CSV, text and image are dependency-free. Because these imports happen only inside `render()`, a consumer that never opens a PDF never pays for pdf.js.

Shared infrastructure:

- **`docview.ts`** — the paged-document canvas used by PDF, Word and PowerPoint: real page geometry, page shadows, continuous vs. single-page layout, zoom/fit transforms. `createPagedDocController(host)` centralizes *all* page-layout state (scale, fit mode, current page, single-page mode, listeners); `createDocStage()` owns the DOM stage. Formats drive it by providing page metrics and (optionally) a rendering callback; the controller turns them into the `PreviewAdapter`'s `pages`/`fit`/`singlePage`/`zoom` surface. Hosts can pick their initial fit via `host.initialFit` (slide decks use `'page'` so whole slides are visible). `PagedDocViewState` (scale + metrics) flows back through `onLayout`/`onScrollFrame` so renderers only draw visible pages.
- **`render-state.ts`** — `createRenderState<T>()` replaces the per-renderer `WeakMap<container, T>` boilerplate; every renderer registers its attachment and a single `destroy()` unwinds it.
- **`virtual-table.ts`** — the virtualized table used by Excel and CSV: only visible rows/windows are materialized in the DOM, so huge sheets stay cheap.
- **`interaction/`** — shared pointer capture, wheel-to-zoom, and drag handling (magnifier lens + zoomable canvas).
- **`utils/registry.ts`** — `createRegistry<T>()` is the single register/get/clear factory behind both `previewers/registry.ts` and `renderers/registry.ts`, so lookup rules (exact key match, then `canHandle` predicate) are consistent across layers.

### 6. The capability contract — `PreviewAdapter` (in `src/controls/types.ts`)

Renderers return a `PreviewAdapter` describing **what they support**, and `preview()` converts it into a `PreviewActions` the toolbar consumes. The contract is deliberately wide and entirely optional:

```ts
interface PreviewAdapter {
  canZoom?: boolean
  canDownload?: boolean
  canFullscreen?: boolean
  zoomPercent?: number        // live % (100 = actual size); toolbar shows a click-to-reset indicator
  zoomIn?(): void
  zoomOut?(): void
  resetZoom?(): void
  download?(): void
  lens?: LensAdapter          // magnification + lens size (images)
  pages?: PageNavigation      // page, pageCount, previous/next/goToPage
  fit?: FitControls           // fitWidth / fitPage / actualSize
  rotate?: RotateControls     // rotation getter, ±90 steps, exact-degree setRotation, reset
  sheets?: SheetNavigation    // tabs, switchSheet
  search?: SearchControls     // search(query), resultCount, clear
  text?: TextControls         // copy, word-wrap
  singlePage?: SinglePageMode // continuous ↔ single page
  thumbnails?: ThumbnailControls
  fullscreen?: FullscreenControls
}
```

`RotateControls` supports exact arbitrary degrees on renderers that can do it:

```ts
interface RotateControls {
  rotation?: number           // current degrees, normalized to [0, 360)
  rotateClockwise(): void     // +90°
  rotateCounterclockwise(): void // −90°
  setRotation?(degrees: number): void // any real number, normalized internally
  resetRotation?(): void      // back to 0°
}
```

A renderer returns `void` (or `undefined`) for a plain, non-interactive view — no toolbar mounts.

### 7. Toolbar — `src/controls/toolbar.ts`

`preview()` builds a preview **shell** (a flex column filling the container): the toolbar on top, the renderer's content in a **stage** below it. `mountControls(container, actions)` prepends the bar into that shell — it is a sticky navbar, not an overlay:

- The bar uses `position: sticky; top: 0` inside the preview container, so it stays pinned at the top while the content scrolls beneath it and moves naturally with the page (it is never `fixed` to the browser viewport).
- The renderer's content lives in the **stage** element below the bar, so the toolbar never covers preview content.
- Grouped controls: **Pages**, **View**, **Zoom**, **Rotate**, **Sheet**, **Search**, **Text**, **Lens**, **File**. Only groups backed by an existing capability render.
- **Overflow strategy:** Pages, Zoom, View and Sheet are pinned to the bar; lower-priority groups collapse into a **⋯** menu when the container is narrow, so the bar never wraps. If pinned groups still exceed the width, the bar scrolls horizontally instead of hiding controls.
- Styling is injected as a single `#pf-glass-styles` `style` element — one `pf-*` classnames namespace, scoped to the container, no shadow DOM or external styles were introduced.
- Accessibility: segmented controls are `radiogroup` with roving tabindex + arrow keys; toggles expose `aria-pressed`; focus-visible rings everywhere; `prefers-reduced-motion` respected; coarse-pointer targets are ≥ 38 px.
- **Icons:** local Lucide SVG assets in `src/icons/` (shipped to `dist/icons/`), inlined at runtime as `stroke="currentColor"` markup so each icon inherits the surrounding control styling. `scripts/build-icons.mjs` generates the `src/icons/icons.ts` string module from those assets and copies the raw SVGs (`+ NOTICE.md`) into `dist/` for the published package; icons are rendered at uniform 18px and marked `aria-hidden` (buttons carry their own `aria-label`/`title`).
- The live zoom `%` indicator (when `zoomPercent` exists) polls the adapter roughly every 300 ms to stay current after wheel/fit interactions; the rotation input syncs from `rotate.rotation` the same way.
- Fullscreen is a single button in the **View** group; download lives in the **File** group.

Because the toolbar is *derived* from the adapter, adding a new control is: (1) define a capability interface, (2) implement it in a renderer, (3) add a group in `toolbar.ts`.

### 8. Teardown

`activePreviews` (a `WeakMap<HTMLElement, cleanup>`) records a per-container cleanup: unmount controls + `renderer.destroy(container)`. `clearPreview()` invokes it, bumps the generation, and empties the container. Containers never leak: after `clearPreview()` the `WeakMap` entry is dropped.

## Rendering philosophy

- **The library never owns the layout.** It renders at 100 % of whatever element the caller provides (auto-set to `position: relative` if static). No modals, no full-page takeover, no injected page chrome — the toolbar lives *inside* the box as a sticky navbar with the renderer's content in a stage below it.
- **Real geometry, not stretch-to-fit.** PDF and Word pages keep their intrinsic size and are paginated/navigated, rather than being squeezed to the preview box; PowerPoint slides keep their native aspect ratio and are fitted as whole slides.
- **Read-only data view.** Excel/CSV are rendered as tabular data views (virtualized), focused on inspection speed.

## Word pagination (known boundary)

Word documents are paginated by `docx-preview` using *explicit* breaks only (`w:br w:type="page"`, `pageBreakBefore`, section properties, page size/orientation changes). Automatic page estimates cannot be reconstructed exactly — flowing text is not measured back into a page model. `breakPages: true` keeps explicit page breaks faithful. If you need exact, computed pagination, recommend converting the document to PDF and previewing that instead (the PDF pipeline then applies its own exact geometry).

## Presentation rendering (known boundaries)

PowerPoint slides are rendered natively in the browser by `pptx-viewer` (MIT, single `fflate` dependency) against the OOXML package. It covers slide geometry, text (including master/layout default text styles), shapes, images, charts, tables, SmartArt-flattened diagrams, themes, gradients, patterns and embedded fonts.

Limitations to be aware of:

- **No time-based content**: slide transitions, and video/audio are not replayed (static rendering only).
- **Legacy binary formats**: `.ppt`/`.pps`/`.pot` are not OOXML packages and are not rendered — they show the standard fallback card with a Download button.
- **OpenDocument (.odp)** is not rendered either (no mature browser renderer); same fallback card.
- **Per-slide resilience**: a slide that fails to render (e.g. an unusual construct) degrades to an in-slide notice instead of failing the whole preview. A presentation that cannot be parsed at all renders the standard error card.

## Extension checklist

1. **Previewer** — implement `Previewer` (name, `supportedMimeTypes`, `canPreview`, `preview`) and call `registerPreviewer(Class)`.
2. **Result type** — return a stable `result.type` and a self-describing `data` (add a discriminator in `src/previewers/result-types.ts` if you want helpers).
3. **Renderer** — implement `Renderer` (`canRender`, `render` → `PreviewAdapter | void`) and call `registerRenderer(Class)`.
4. **Controls** — return the relevant `PreviewAdapter` capabilities from `render`; the toolbar picks them up automatically.

## Verification

- `npm run typecheck` — TSC no-emit (`strict`, `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax`; every internal import uses explicit `.js` specifiers and `import type` for type-only imports).
- `npm run lint` — oxlint (default correctness rules + TS/oxc plugins; configured in `.oxlintrc.json`).
- `npm run build` — emits `dist/`.
- `npm test` is not scripted; the interactive demo ([`playground/`](playground), a React + Vite app consuming the built package via `file:..`) and the manual matrix (PDF/DOCX/XLSX/CSV/images, file/URL/blob sources) are the current smoke layer.