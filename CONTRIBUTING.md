# Contributing to `preview-file`

This guide is written to be read by humans and AI coding agents alike. If you are an
agent, read this entire file (root `CONTRIBUTING.md`) plus the per-layer
`README.md` files before editing:

- [`src/utils/README.md`](src/utils/README.md) — shared helpers, layered last
- [`src/previewers/README.md`](src/previewers/README.md) — file → typed result
- [`src/renderers/README.md`](src/renderers/README.md) — result → DOM + capabilities
- [`src/controls/README.md`](src/controls/README.md) — toolbar & capability contract
- [`src/sources/README.md`](src/sources/README.md) — source normalization

The full design lives in [ARCHITECTURE.md](ARCHITECTURE.md).

## Reference documents

| Document | Audience | Contents |
| --- | --- | --- |
| [AI_GUIDE.md](AI_GUIDE.md) | AI agents (primary) | Onboarding, hard rules, standard workflows, verification loop, pitfalls, handoff checklist |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Maintainers | Pipeline walkthrough, module map, rendering philosophy, extension checklist |
| [docs/adr/](docs/adr/README.md) | Maintainers | Architecture decision records (the *why* behind decisions) |
| [docs/EXTENDING.md](docs/EXTENDING.md) | Extension authors | Extension points, plugin-style integration, new-format workflow |
| [docs/templates/](docs/templates/README.md) | Extension authors + agents | Copy-paste scaffolding for previewers, renderers, controls |
| [docs/TESTING.md](docs/TESTING.md) | Maintainers + agents | Testing strategy and recommended test locations |
| `src/*/README.md` | Contributors + agents | Per-layer contracts and rules |

---

## Environment

- Node ≥ 18, npm. TypeScript 5.5+ (repo currently resolves ~5.9).
- The package is **ESM-only** (`"type": "module"`). NodeNext module resolution.
- Dependency graph rule: `utils/` imports nothing from other layers; `controls/`
  and `renderers/` may import from `utils/`; nothing may import from `preview.ts`
  or `index.ts` (that would create a cycle).

## Conventions (must follow)

1. **No breaking public API changes.** `src/index.ts` is the stable surface:
   `preview`, `clearPreview`, `setPdfWorkerSrc`, the `getPreviewer` /
   `registerPreviewer` / `clearPreviewers` and `getRenderer` / `registerRenderer` /
   `clearRenderers` families, `detectType`, `parseCsv`, and every exported type.
   Preserve signatures; additive changes are preferred.
2. **Relative imports with explicit `.js` specifiers** (NodeNext), e.g.
   `from './registry.js'`, `from '../utils/index.js'`.
3. **`import type` for type-only imports** (`verbatimModuleSyntax` is on).
4. **No comments unless they explain *why*** — never restate what the code does.
5. **One class/function per responsibility; no duplicated logic.** Shared code must
   live in `src/utils/` or the relevant shared module (see the "known duplicates"
   list below — do not reintroduce them).
6. **Naming:** files `{format}.ts`, classes `{Format}Previewer` / `{Format}Renderer`.
7. **DOM/state hygiene in renderers:** register per-container state via
   `createRenderState().set(container, attachment)`; tear down every resource
   (observers, rAF loops, imported engines, canvas contexts) in `destroy()`.
8. **Capability-driven UI:** never build your own controls in a renderer — return a
   `PreviewAdapter` and let the toolbar render what you support.

### Known duplicates (must not reintroduce)

- `clamp` → `src/utils/math.ts` only.
- `extensionFrom` → `src/utils/extension.ts` only (detect + Word + Excel use it).
- `parseCsv` → `src/utils/csv.ts` only (shared by the CSV previewer and renderer).
- Blob-guard helpers (`isBlobResultData`) → `src/previewers/result-types.ts`.
- Registry register/get/clear → `createRegistry` in `src/utils/registry.ts`
  (both `previewers/registry.ts` and `renderers/registry.ts` are thin wrappers).
- Per-container state `WeakMap` pattern → `createRenderState` in
  `src/renderers/render-state.ts`.
- Paged-document layout (scale/fit/single-page/current-page) → only via
  `createPagedDocController` in `src/renderers/docview.ts` (PDF, Word, PowerPoint).

## Known (accepted) limits

- **Word pagination** is explicit-breaks-only (`docx-preview`); automatic page
  estimates are not computed. See ARCHITECTURE.md → "Word pagination".
- **No automated tests** (harness not installed). The smoke layer is manual: the
  React+Vite [`playground/`](playground) (consumes the built package via `file:..`) plus
  a manual matrix (PDF/DOCX/XLSX/CSV/images × file/URL/blob sources × error cases).
  If you change a renderer, verify the affected format in the playground. The strategy
  and future test locations are defined in [`docs/TESTING.md`](docs/TESTING.md).

## Verification (run all three before finishing)

```bash
npm run typecheck   # tsc --noEmit — strict, noUnused*, verbatimModuleSyntax
npm run lint        # oxlint — correctness + TS/oxc plugins (.oxlintrc.json)
npm run build       # node scripts/build-icons.mjs && tsc → emits dist/
```

All three must pass with zero errors. `prepublishOnly` also runs all three, so a
successful `npm publish` implies they passed.

### Manual smoke test

```bash
npm run build        # root first (playground consumes dist/ via file:..)
cd playground
npm install
npm run dev          # predev rebuilds the package; http://localhost:5173
```

Then open PDF, Word (.docx), Excel (.xlsx), a PowerPoint deck (.pptx, try the sample in
`playground/samples/`), CSV, a text file, and an image; also
test an unsupported/corrupt file (error card) and the Close-preview button.

## How to add a new format (née `ARCHITECTURE.md` → Extension checklist)

1. **Previewer** — `src/previewers/{format}.ts` implementing `Previewer`
   (`name`, `supportedMimeTypes`, `canPreview`, `preview` → normalized
   `PreviewResult`); register in `src/previewers/index.ts`.
2. **Result type** — return a stable `result.type` + self-describing `data`; add a
   discriminator guard in `src/previewers/result-types.ts` if the shape is new.
3. **Renderer** — `src/renderers/{format}.ts` implementing `Renderer`
   (`canRender`, `render` → `PreviewAdapter | void`, `destroy?`); register in
   `src/renderers/index.ts`. Dynamic-import any heavy engine inside `render()`.
4. **Controls** — return the relevant `PreviewAdapter` capabilities; the toolbar
   picks them up automatically (add a new group only if the capability type doesn't
   exist yet in `src/controls/types.ts` + `src/controls/toolbar.ts`).
5. **Docs** — update the format table in the root `README.md`.
6. **Verify** — `npm run typecheck && npm run lint && npm run build`, then smoke
   test the new format in the playground.