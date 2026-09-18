# ADR-0004: Lazy loading of heavy engines

- **Status:** Accepted
- **Date:** 2026-09-18

## Context

`pdfjs-dist`, `docx-preview` and `xlsx` are large. Importing any of them at module top
level would put megabytes into every consumer's initial bundle even when the user never
opens a PDF, Word file or spreadsheet.

## Decision

- Heavy engines are loaded with dynamic `import()` **inside the renderer's `render()`
  method** — only when the corresponding format is actually previewed.
- CSV, text and image rendering are dependency-free.
- The worker portion of pdf.js is additionally *never* imported — it is referenced by URL
  (see [ADR-0009](0009-pdf-worker-strategy.md)).

## Consequences

- Consumers that never preview a format never pay for its engine.
- A renderer's `render()` is necessarily async; errors loading an engine surface as a
  readable "parser could not be loaded" error card via the standard failure path.
- Bundlers see no static import, so there is no bundler configuration needed — the same
  dynamic import resolves under Vite, webpack, Rollup, Next.js and vanilla ESM.
- New heavy formats must follow the same rule: dynamic-import inside `render()`, never a
  top-level `import`.