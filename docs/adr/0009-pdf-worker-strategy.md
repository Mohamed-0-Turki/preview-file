# ADR-0009: pdf.js worker loaded by URL, never bundled

- **Status:** Accepted
- **Date:** 2026-09-18

## Context

pdf.js runs background work in a worker module (`pdf.worker.mjs`). Bundlers each have a
different idiom for handling a URL/worker (`?url`, `?worker`, `worker-loader`, `?raw`).
Inlining or bundling it breaks cross-bundler identity and inflates bundles.

## Decision

- The worker is **never imported** by the package. `resolvePdfWorkerSrc()` chooses a URL
  and assigns it to `GlobalWorkerOptions.workerSrc`:
  1. `PreviewOptions.workerSrc` (per-preview override, highest priority);
  2. the global `setPdfWorkerSrc(url)`;
  3. a version-pinned copy on a public CDN whose version always matches the resolved
     `pdfjs-dist` (so worker and API cannot drift).
- The worker is only fetched when a PDF is actually rendered — never at import time.
- If the worker URL cannot be loaded, pdf.js falls back to a main-thread "fake worker"
  and the PDF still renders (console warning only).

## Consequences

- Zero bundler configuration is required for PDF previews.
- Self-hosting/CSP/air-gapped setups bake the worker to their own URL via
  `setPdfWorkerSrc()` or per-preview `workerSrc`.
- Tests and consumers that mock the worker do so through `workerSrc`, keeping the
  package itself mock-agnostic.