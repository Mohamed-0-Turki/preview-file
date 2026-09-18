# ADR-0003: Capability-driven toolbar via the `PreviewAdapter` contract

- **Status:** Accepted
- **Date:** 2026-09-18

## Context

Early designs risked each renderer shipping its own floating chrome/controls — duplicated
UI, inconsistent styling and accessibility, and no way to know what a renderer supports
without rendering it.

## Decision

- Renderers return a `PreviewAdapter` (optional; `void` means a plain view) describing
  **which capabilities they support**: zoom, pages, fit, single page, rotate, sheets,
  search, text, lens, thumbnails, download, fullscreen.
- `src/preview.ts` converts the adapter into `PreviewActions` via `buildActions()`
  (adds error handling/retry around each action).
- `mountControls(container, actions)` renders a sticky navbar toolbar that only shows
  groups backed by a present capability. It never renders a dead control.
- Renderers **never build their own controls**. Adding a capability = define its interface
  in `controls/types.ts`, implement it on an adapter, add a group in `controls/toolbar.ts`.

## Consequences

- The toolbar is *derived* from the adapter, so capability, UI and help text can never drift.
- Every control path goes through `buildActions`, so runtime failures surface as an error
  card with Retry/Download instead of a silent break — behavior is uniform across renderers.
- Accessibility and overflow behavior live in exactly one place (`toolbar.ts`).