# Testing Strategy

`preview-file` currently has **no automated test harness** (`npm test` is unscripted).
This document defines *where* tests should live and *what* each layer warrants, so that
when the harness is introduced the placement is a mechanical decision rather than a
debate. Status is tracked in [ADR-0010](adr/0010-testing-strategy.md).

## Current smoke layer (today)

- The manual matrix in the playground: PDF / DOCX / XLSX / CSV / text / image ×
  `File` / `Blob` / URL-string sources × error cases (unsupported type, oversized file,
  corrupt file).
- `playground/` is React + Vite, consumes the **built** package via `file:..`
  (`predev` rebuilds the root package), URL: http://localhost:5173.
- Every renderer change must be smoke-tested for the affected format here.

## Test pyramid for future automated tests

```
        ┌───────────────────────────────────────┐
        │  E2E — Playwright, browsers            │  renderers with real engines
        │  (PDF/Word/Excel rendering, a11y)      │  + controls + errors
        ├───────────────────────────────────────┤
        │  Integration — Vitest + jsdom          │  docview controller, registries,
        │  (no real canvas/engines)              │  toolbar DOM, preview() flow
        ├───────────────────────────────────────┤
        │  Unit — Vitest, Node                   │  utils/ + previewers/ (pure)
        └───────────────────────────────────────┘
```

**Rule of thumb:** the lower a module sits, the cheaper and more valuable its unit tests.

## Recommended test locations

| Area | Location | Environment | Example cases |
| --- | --- | --- | --- |
| Utils (pure) | `src/utils/__tests__/<module>.test.ts` | Vitest (node) | `detectType` precedence, `extensionFrom` edge cases, `parseCsv` quoting/newlines, `clamp`, `createRegistry` first-match + clear |
| Previewers (pure-ish) | `src/previewers/__tests__/<previewer>.test.ts` | Vitest (node) | result `type` normalization, `data` shape snapshots, alias MIME mapping |
| Result guards | `src/previewers/__tests__/result-types.test.ts` | Vitest (node) | `is*ResultData` true/false cases (incl. non-Blob falses) |
| Registries | co-located with the wrappers, e.g. `src/renderers/__tests__/registry.test.ts` | Vitest (node) | register/get/clear, shadowing, fallback `canRender` |
| Paged-doc controller | `src/renderers/__tests__/docview.test.ts` | Vitest + jsdom | fit calc, zoom anchoring, single-page math — assert on virtual `scrollTop`/metrics, never on pixels |
| Toolbar | `src/controls/__tests__/toolbar.test.ts` | Vitest + jsdom + `@testing-library/dom` | group presence driven by actions, overflow hiding, refresh sync, focus/tabindex |
| `preview()` orchestration | `src/__tests__/preview.test.ts` | Vitest + jsdom | generation guard, clearPreview cleanup, error-card branches, adapter→actions mapping |
| Full render (PDF/Word/Excel/image) | `e2e/*.spec.ts` (Playwright, owns `playground/`) | Browser | visual smoke, page navigation, download, error card |

Do **not** attempt canvas-level unit tests — real engine rendering is covered by E2E.

## Proposed tooling (adopt when the harness is added)

```bash
npm i -D vitest jsdom @testing-library/dom playwright
```

Package scripts (proposal):

```jsonc
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test"
  }
}
```

Environment split — run most suites with `environment: 'node'`; enable jsdom only for
suites that need it via a per-file docblock (`@vitest-environment jsdom`) or a
`vitest.workspace.ts` split. Playwright config points at the playground (start Vite first)
with a browser matrix (chromium + webkit at minimum).

## Fixtures

- **Unit/Integration:** small synthetic files under `fixtures/` (a 5-page PDF, a one-sheet
  XLSX, a nested-table DOCX, quote-heavy CSV, a PNG). Prefer tiny generated-at-test-time
  fixtures over binaries-in-git where the generator is cheap (a CSV is a string;
  generate PDFs/DOCX/XLSX once and commit if generation is heavy).
- **E2E:** reuse `fixtures/` plus real-world sample files placed under
  `playground/samples/` for the manual matrix.

## What we deliberately do not test (yet)

- Pixel-level rendering of PDF/Word pages (E2E visual comparison — out of scope unless
  regressions require it).
- Every vendor MIME alias on every browser (covered by guard unit tests + spot E2E).
- Cross-bundler resolution (covered by `playground` using Vite + the README's
  framework examples).

## Checklist when adding tests

1. Pure logic in `utils/` → unit first.
2. Normalization/guards in `previewers/` → unit + a data-shape assertion.
3. Layout/controller math → jsdom, assert on numbers not layout.
4. Toolbar/orchestration → jsdom assertions on DOM structure and cleanup.
5. A real engine path changed → add/verify an E2E spec in `e2e/`.
6. Every suite must run under `npm test` and stay green with
   `npm run typecheck && npm run lint && npm run build`.