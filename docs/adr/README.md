# Architecture Decision Records

ADRs document the **why** behind `preview-file`'s design so future contributors and AI
agents don't reverse decisions unknowingly. Decisions are immutable once accepted; if a
decision changes, write a new ADR that supersedes it.

## Index

| № | Decision |
| --- | --- |
| [ADR-0001](0001-layered-pipeline.md) | Layered pipeline with one-way dependencies; `utils/` is the dependency bottom |
| [ADR-0002](0002-normalized-result-types.md) | Normalized result types + guards define the previewer/renderer boundary |
| [ADR-0003](0003-capability-driven-toolbar.md) | Capability-driven toolbar via the `PreviewAdapter` contract |
| [ADR-0004](0004-lazy-engine-loading.md) | Heavy engines load lazily inside `render()`, never at import time |
| [ADR-0005](0005-single-registry-factory.md) | One generic `createRegistry` factory behind all registries |
| [ADR-0006](0006-paged-doc-controller.md) | Single `PagedDocController` owns PDF and Word page layout |
| [ADR-0007](0007-per-container-state.md) | Per-container render state with deterministic teardown |
| [ADR-0008](0008-esm-only-package.md) | ESM-only package: explicit `.js` specifiers, `verbatimModuleSyntax`, no bundler-specific imports |
| [ADR-0009](0009-pdf-worker-strategy.md) | pdf.js worker loaded by URL (CDN default, configurable), never bundled |
| [ADR-0010](0010-testing-strategy.md) | Testing: manual playground smoke today, documented path to Vitest + Playwright |
| [ADR-0011](0011-framework-agnostic-package.md) | Framework-agnostic single package; no monorepo, no framework-specific entry points |
| [ADR-0012](0012-presentation-preview.md) | Presentation preview: external DOM/SVG renderer (`pptx-viewer`) on the paged-document controller; legacy formats fall back |

## Status values

`Accepted` — we are committed to this. `Deprecated` / `Superseded by ADR-XXXX` — recorded
for history, no longer governing.

## Template for new ADRs

```markdown
# ADR-XXXX: Title

- **Status:** Accepted | Deprecated | Superseded by ADR-YYYY
- **Date:** YYYY-MM-DD

## Context

What problem exists, what was considered, which constraints matter.

## Decision

What we decided to do, concisely.

## Consequences

Positive and negative effects, and what later contributors should watch for.
```