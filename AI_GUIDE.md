# AI_GUIDE.md

A bootstrap guide for AI coding agents (OpenCode, Codex, Claude Code, Gemini CLI,
Cursor, Copilot) working on `preview-file`.

**Read this file first.** It tells you what to read, the hard rules, the standard
workflows, and how to verify your changes. It is intentionally short — the details
live in the documents it points to.

---

## 1. Must-read before editing anything

Read these in order (only the first three are mandatory; the rest are for feature work):

1. `CONTRIBUTING.md` — contributor conventions and the verification gate.
2. `ARCHITECTURE.md` — how the pipeline works, module map, extension checklist.
3. This file.
4. The per-layer `README.md` for whatever layer you touch:
   [`src/utils/`](src/utils/README.md), [`src/previewers/`](src/previewers/README.md),
   [`src/renderers/`](src/renderers/README.md), [`src/controls/`](src/controls/README.md),
   [`src/sources/`](src/sources/README.md).
5. `docs/TESTING.md` — testing strategy and where tests should live.
6. `docs/EXTENDING.md` — extension points and plugin-style integration patterns.
7. `docs/templates/` — drop-in templates for new previewers/renderers/controls.
8. `docs/adr/` — architecture decision records (why things are the way they are).
9. The nearest sibling files of whatever you're editing (to match style).

## 2. Repository map

```
preview-file/
  src/
    index.ts            PUBLIC API — the only stable surface. Do not break it.
    preview.ts          Orchestrator: source → detect → previewer → renderer → toolbar
    types.ts            Cross-cutting types (no imports)
    pdf-worker.ts       pdf.js worker URL resolution
    monaco.ts           Monaco AMD base URL resolution (CDN default + setMonacoBaseUrl)
    sources/            SourceInput (File|Blob|string) → ResolvedSource {name, blob}
    utils/              Pure helpers — the dependency bottom (utils imports nothing)
    previewers/         Stage 1: bytes → typed PreviewResult (cheap, pure)
    renderers/          Stage 2: result → DOM + PreviewAdapter (heavy, lazy)
    controls/           Capability types + toolbar renderer
    icons/              Generated Lucide SVG module + assets
  playground/           React + Vite manual smoke app (consumes dist/ via file:..)
  docs/
    adr/                Architecture decision records
    templates/          Copy-paste templates for new code
    TESTING.md          Testing strategy & recommended locations
    EXTENDING.md        Extension points & plugin patterns
  scripts/build-icons.mjs
  .oxlintrc.json  tsconfig.json  package.json
```

## 3. Architecture in one page

```
SourceInput (File | Blob | URL-string)
        │
        ▼
createSource()        src/sources          → { name, blob }
        ▼
detectType()          src/utils/detect     → MIME (declared type trusted, else extension)
        ▼
getPreviewer()        src/previewers/registry → Previewer (or error card)
        │             (exact MIME key; else capability-aware fallback with the
        │              file name — Monaco's own language index, then the other
        │              previewers' predicates, in registration order)
        ▼
previewer.preview()   src/previewers/*     → PreviewResult { type, data }   (bytes only, no DOM)
        ▼
getRenderer()         src/renderers/registry → Renderer (or error card)
        ▼
renderer.render()     src/renderers/*      → DOM + PreviewAdapter | void     (DOM, lazy engines)
        ▼
mountControls()       src/controls/toolbar → multi-side chrome (top + document bar + rails), capability-driven
        ▼
activePreviews        src/preview.ts       → teardown registered per container
```

**Layer rules (direction only downward):**

- `utils/` imports nothing from other layers.
- `previewers/`, `renderers/`, `controls/`, `sources/` may import from `utils/` and from `../types.js`.
- `renderers/` may import **types** from `controls/`/`previewers/` and runtime **guards**
  from `previewers/result-types.js`. No other cross-layer runtime imports.
- Nothing imports from `preview.ts` or `index.ts` (cycle risk).
- `preview.ts` is the only file that wires all layers together — through each layer's
  `index.js` barrel, never deep imports.

## 4. Hard rules (non-negotiable)

| # | Rule |
| --- | --- |
| 1 | **Never break the public API** (`src/index.ts`): `preview`, `clearPreview`, `setPdfWorkerSrc`, `setMonacoBaseUrl`, registry functions, `detectType`, `parseCsv`, and all exported types. Additive changes only. |
| 2 | **Never duplicate shared logic.** `clamp`, `extensionFrom`, `parseCsv`, blob guards, registries, render state, and paged-document layout already exist in shared modules — import them, don't rewrite them (see §7). |
| 3 | **No deep runtime imports across layers.** Use each layer's `index.js` barrel for runtime values; type-only imports may target `types.js`. |
| 4 | **ESM style:** relative imports end in `.js` (NodeNext); use `import type` for type-only imports (`verbatimModuleSyntax`). |
| 5 | **Comments only explain *why***, never restate code. |
| 6 | **Capability-driven UI:** renderers never build their own controls; return a `PreviewAdapter` and the toolbar renders what you support. |
| 7 | **Deterministic teardown:** every resource a renderer creates (observers, rAF, workers, dynamic imports) must be released in `destroy()`, registered via `createRenderState().set(container, attachment)`. |
| 8 | **Lazy engines:** `pdfjs-dist`, `docx-preview`, `xlsx`, `pptx-viewer` are dynamic-imported inside `render()` only — never at module top level. Monaco (Code) is also loaded only inside `render()`, but through its AMD build from a configured base URL (`src/renderers/monaco-loader.ts`), never via a bundler-managed import — see ADR-0013. |
| 9 | **Naming:** file `{format}.ts`, class `{Format}Previewer` / `{Format}Renderer`. |
| 10 | **No tests to add yet** without reading `docs/TESTING.md` first (harness is not yet installed; expect `npm test` to be absent). |

## 5. Standard workflows

### 5.1 Add a new format (e.g. `markdown`)

These are the exact files to touch — in order:

1. `src/previewers/types.ts` — no change (reuse `Previewer`).
2. `src/previewers/{format}.ts` — new `{Format}Previewer` (class implementing `Previewer`).
   Use [`docs/templates/CustomPreviewer.ts`](docs/templates/CustomPreviewer.ts).
3. `src/previewers/result-types.ts` — add `{Format}ResultData` + `is{Format}ResultData` guard if the `data` shape is new.
4. `src/previewers/index.ts` — `import { XPreviewer } from './{format}.js'` and `registerPreviewer(XPreviewer)`.
5. `src/renderers/{format}.ts` — new `{Format}Renderer` implementing `Renderer`.
   Use [`docs/templates/CustomRenderer.ts`](docs/templates/CustomRenderer.ts).
6. `src/renderers/index.ts` — import + `registerRenderer` it.
7. `README.md` — add a row to the format table.
8. Verify (§6). If the format is paged (PDF/Word/PowerPoint-like), build on
   `createPagedDocController` in `src/renderers/docview.ts` instead of inventing layout logic.

### 5.2 Add a toolbar control / capability

1. `src/controls/types.ts` — define the capability interface (e.g. `TextControls`).
2. `src/controls/toolbar.ts` — add the control group to the bar.
3. `src/renderers/…` — implement it on the relevant `PreviewAdapter`s.
   See [`docs/templates/CustomControlGroup.md`](docs/templates/CustomControlGroup.md).
4. If a new type is part of `PreviewAdapter`, add it to `src/controls/index.ts`
   re-exports *only if* it should be part of the public types.

### 5.3 Add a source kind (e.g. `ArrayBuffer`)

`SourceInput` is currently `File | Blob | string`. To extend:

1. `src/sources/types.ts` — extend `SourceInput` and update `ResolvedSource` if needed.
2. `src/sources/source.ts` — handle the new input in `createSource()`.
3. `src/types.ts` / `src/index.ts` — re-export the widened types.
4. Verify — the widened union is a **breaking change** for typed consumers; prefer adding a
   new overload instead, and record it in `docs/adr/` if you intentionally break it.

### 5.4 Add a shared utility

1. Place it in `src/utils/{topic}.ts`.
2. Export it from `src/utils/index.ts`.
3. If it should be public (rare), also export from `src/index.ts`; otherwise keep it internal.
4. **Check for existing implementations first** (`clamp`, `extensionFrom`, `parseCsv`,
   `mimeFromExtension`, `createRegistry`, `createRenderState` already exist).

## 6. Verification loop (run after EVERY change)

```bash
npm run typecheck   # tsc --noEmit (strict, noUnused*, verbatimModuleSyntax)
npm run lint        # oxlint (correctness + TS/oxc plugins)
npm run build       # scripts/build-icons.mjs && tsc → dist/
```

All three must pass with **zero errors**. When you change renderer behavior, smoke-test
in the playground:

```bash
npm run build && cd playground && npm install && npm run dev   # http://localhost:5173
```

`prepublishOnly` runs all three, so a successful `npm publish` implies they passed.

## 7. Known composed abstractions — import, never reinvent

| Concern | Where | Used by |
| --- | --- | --- |
| register/get/clear registries | `createRegistry` in `src/utils/registry.ts` | `previewers/registry.ts`, `renderers/registry.ts` |
| per-container attachment + destroy | `createRenderState` in `src/renderers/render-state.ts` | all renderers |
| paged document layout (scale/fit/single-page/page nav) | `createPagedDocController` in `src/renderers/docview.ts` | `pdf.ts`, `word.ts`, `presentation.ts` |
| virtualized grid | `createVirtualTable` in `src/renderers/virtual-table.ts` | `excel.ts`, `csv.ts` |
| blob/word/spreadsheet/presentation/csv guards | `is*ResultData` in `src/previewers/result-types.ts` | previewers + renderers |
| loupe + zoom/pan | `src/renderers/interaction/` | `image.ts` |
| extension parsing | `extensionFrom` in `src/utils/extension.ts` | `detect.ts`, word/excel previewers |
| CSV parsing | `parseCsv` in `src/utils/csv.ts` | `csv.ts` previewer + renderer |
| number clamp | `clamp` in `src/utils/math.ts` | magnifier, zoomable |

## 8. Common pitfalls

- **Moving imports to deleted paths** — files were relocated during a restructure
  (`src/previewer.ts`→`src/previewers/types.ts`, `src/registry.ts`→`src/previewers/registry.ts`).
  The test for a stale path: `tsc` fails loudly. Run typecheck before assuming a code fix
  you made is the only problem.
- **Circular type imports** — `types.ts` must not import from layers. Keep cross-cutting
  types in `types.ts`; per-layer types in the layer (`Previewer`/`PreviewerConstructor`
  live in `previewers/types.ts`, `Renderer` in `renderers/types.ts`, capabilities in
  `controls/types.ts`).
- **Adding layout logic to a paged renderer** — route it through `createPagedDocController`
  or `docview.ts`. The whole point of that module is that neither PDF nor Word owns layout.
- **Spawning controls in a renderer** — never. Return the adapter.
- **Leaving resources untorn** — a renderer that sets up an observer/rAF without undoing it
  in `destroy()` leaks. Payload destroy does `unmountControls()` + `renderer.destroy(stage)`.
- **Forgotten registration** — a new `{Format}Previewer`/`{Format}Renderer` that is written
  but not `register*`-ed never runs, and the package still typechecks.
- **Overlapping predicates** — the registry is first-match in registration order.
  `TextPreviewer`'s predicate is `text/*`, so `CodePreviewer` (whose MIME list is mostly
  `text/x-*`) must stay registered before it. If you add a renderer whose key is a
  prefix-predicate, register the more specific one first.
- **Monaco base URL must point at the `min/` build folder** — `setMonacoBaseUrl` expects
  a directory that directly contains `vs/loader.js` (e.g. `…/monaco-editor@0.56.0/min`).
  The loader then configures AMD with `baseUrl` + `paths.vs`, which is also what makes
  Monaco's workers and CSS resolve cross-origin (or same-origin when self-hosted).
- **Public-adjacent mistakes** — the renderer/previewer classes are internal; the public
  surface is functions + types only. Don't export new symbols from `src/index.ts` casually.

## 9. Handoff checklist (do all before finishing)

- [ ] `npm run typecheck && npm run lint && npm run build` → zero errors
- [ ] No new duplicated logic (checked §7 table)
- [ ] Cross-layer runtime imports go through `index.js` barrels
- [ ] All resources created are destroyed in `destroy()`
- [ ] Public API unchanged (or recorded in `docs/adr/` + README changelog)
- [ ] Format table updated in `README.md` when formats change
- [ ] Smoke-tested changed formats in the playground when renderer code changed