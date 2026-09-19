# Extending `preview-file`

This guide documents every public extension point, how plugin-style integrations should
be packaged, and the full workflow for adding a new format. It complements
[`docs/templates/`](templates/README.md) (copy-paste scaffolding) and the
[`docs/adr/`](adr/README.md) records that motivate the design.

## The extension surface at a glance

| Extension point | Where | Public API | Purpose |
| --- | --- | --- | --- |
| **Previewer registry** | `src/previewers/registry.ts` | `registerPreviewer(Constructor)`, `clearPreviewers()` | Add/replace a file→result stage |
| **Renderer registry** | `src/renderers/registry.ts` | `registerRenderer(Constructor)`, `clearRenderers()` | Add/replace a result→DOM stage |
| **Result data guards** | `src/previewers/result-types.ts` | (internal) `is*ResultData(data)` | Type-safe `data` narrowing |
| **Capabilities** | `src/controls/types.ts` | `PreviewAdapter` fields | New toolbar controls |
| **Toolbar groups** | `src/controls/toolbar.ts` | (internal) `mountControls` | Rendering of new capabilities |
| **Sources** | `src/sources/source.ts` | `SourceInput` | New input kinds (breaking — see below) |
| **PDF worker** | `src/pdf-worker.ts` | `setPdfWorkerSrc`, `options.workerSrc` | Bring-your-own worker |
| **Monaco base URL** | `src/monaco.ts` | `setMonacoBaseUrl`, `options.monaco.baseUrl` | Bring-your-own Monaco AMD build |
| **Utilities** | `src/utils/` | `detectType`, `parseCsv` (+ internal helpers) | Shared logic for all of the above |

Everything a consumer can call at runtime is the functions set in `src/index.ts`. The
registries are the primary extension mechanism; everything else is opt-in surface.

## Plugin-style integration patterns

### 1. An importable plugin module (recommended)

Package a previewer pair as a module that **registers itself on import**. Consumers
import it once (for the side effect) and everything is wired:

```ts
// my-preview-package/dist/index.js
import { registerPreviewer, registerRenderer } from '@mohamed-0-turki/preview-file'
import { MarkdownPreviewer } from './previewer.js'
import { MarkdownRenderer } from './renderer.js'

registerPreviewer(MarkdownPreviewer)
registerRenderer(MarkdownRenderer)
```

```ts
// consumer
import 'my-preview-package'            // registers Markdown support globally
import { preview } from '@mohamed-0-turki/preview-file'
await preview(markdownFile, container)
```

Registration is **additive** — built-ins stay registered, so plugins compose freely.

### 2. Full replacement of a stage

When a plugin must replace the whole set (e.g. a "premium renderers" package):

```ts
import { clearRenderers, registerRenderer } from '@mohamed-0-turki/preview-file'
clearRenderers()
registerRenderer(MyPdfRenderer)
registerRenderer(MyCsvRenderer)
```

Because lookup is **first-match** (exact key, then `canHandle` predicate), and clearing
removes built-ins, a consumer can also *shadow* a single built-in by registering a
replacement first and leaving the rest intact.

### 3. Selective loading

Heavy plugin code should follow the package's own lazy rule — a plugin module should
globally register lightweight constructors whose `render()`/`preview()` dynamic-import
the actual engine only when invoked, mirroring [ADR-0004](adr/0004-lazy-engine-loading.md).
The built-in Code renderer is the reference for a non-`import()` lazy strategy: instead
of a bundler-managed dynamic import, it injects `vs/loader.js` and calls `require.config`
pointed at the configured base URL, mirroring how the PDF worker is loaded by URL
([ADR-0009](adr/0009-pdf-worker-strategy.md), [ADR-0013](adr/0013-monaco-code-preview.md)).

## Full workflow: adding a new format (e.g. Markdown)

References: [`docs/templates/CustomPreviewer.ts`](templates/CustomPreviewer.ts) and
[`docs/templates/CustomRenderer.ts`](templates/CustomRenderer.ts).

1. **Previewer** — `src/previewers/markdown.ts` (or in the plugin package above):
   implement `Previewer`; normalize vendor MIMEs into one stable result `type`
   (`text/markdown`); keep it pure (no DOM). Add an `isMarkdownResultData` guard in
   `result-types.ts` if shape is new. Register it.
2. **Renderer** — `src/renderers/markdown.ts`: implement `Renderer`, `canRender`
   on the stable result type, `render()` builds DOM and returns a `PreviewAdapter`
   (or `void` for a plain view). Register it. Lazy-load heavy engines inside `render()`.
3. **Controls (optional)** — to expose toolbar actions, return the relevant adapter
   capabilities; add a group in `toolbar.ts` only if the capability type doesn't exist.
   See [`docs/templates/CustomControlGroup.md`](templates/CustomControlGroup.md).
4. **Docs** — add a row to the README format table; if the decision is notable, add an ADR.
5. **Verify** — `npm run typecheck && npm run lint && npm run build`, then smoke-test in
   the playground.

### When to build on shared renderer infrastructure

- **Paged document** (real page geometry, zoom/fit/single-page/navigation): build on
  `createPagedDocController` from `src/renderers/docview.ts` — do not write your own
  layout (see [ADR-0006](adr/0006-paged-doc-controller.md)).
- **Tabular data** (virtualized rows): build on `createVirtualTable` from
  `src/renderers/virtual-table.ts`.
- **Interactive image** (zoom/pan/loupe): build on `src/renderers/interaction/`.

## Adding capabilities vs. breaking conventions

- Prefer additive `PreviewAdapter` fields over widening `PreviewActions`.
- A new public utility goes in `src/utils/` and is re-exported from `src/index.ts`
  **only** if consumers genuinely need it (`detectType`, `parseCsv` are the precedent).
- New source kinds (widening `SourceInput`) are a breaking change for typed consumers.
  Prefer an additive overload in `createSource`; if you must break, record it in an ADR
  and bump the major version.