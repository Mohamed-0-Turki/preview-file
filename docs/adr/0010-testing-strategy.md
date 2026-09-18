# ADR-0010: Testing strategy — manual smoke today, Vitest + Playwright path documented

- **Status:** Accepted
- **Date:** 2026-09-18

## Context

The project has no automated test harness (`npm test` is unscripted). Rendering depends
on real browser APIs (canvas, `IntersectionObserver`, fonts, workers, Blob), so naive
unit tests of renderers are brittle. Adding a harness is real infrastructure work and was
kept out of scope to avoid over-engineering — but the right shape should be agreed now so
tests land in predictable locations.

## Decision

- **Today:** the smoke layer is manual — the React+Vite `playground/` (consumes the built
  package via `file:..`) plus a manual matrix (PDF/DOCX/XLSX/CSV/image/text ×
  File/Blob/URL sources × error cases).
- **Adopted direction** (documented in `docs/TESTING.md`, to be implemented later):
  - Pure layers (`utils/`, mostly `previewers/`) → Vitest unit tests in Node.
  - DOM layers (`renderers/`, `controls/`) → Vitest + jsdom for structural logic; real
    rendering (canvas/PDF/Word) stays in Playwright E2E against the playground.
  - Test files colocated at `<module>/__tests__/<name>.test.ts`; fixtures and the manual
    matrix curated under `playground/`.
- `npm test` remains unscripted until the harness is created (recorded as a follow-up in
  `docs/TESTING.md`, not silently added).

## Consequences

- Contributors and agents know exactly where tests will go and at what layer each kind of
  behavior is testable — no Rorschach-test placement when the time comes.
- Renderers keep real-browser rendering manual until Playwright is added, avoiding brittle
  canvas mocks.
- JSON snapshots of `PreviewResult` shapes for previewers are cheap and valuable even
  today — a natural first Vitest target.