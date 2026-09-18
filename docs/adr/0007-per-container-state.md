# ADR-0007: Per-container render state with deterministic teardown

- **Status:** Accepted
- **Date:** 2026-09-18

## Context

Every renderer manages per-container lifetime state (observers, rAF loops, imported
engine instances, canvas contexts) keyed by the container. Each renderer originally
rolled its own `WeakMap<HTMLElement, T>` with ad hoc destroy logic, and leaks were hard
to audit.

## Decision

- `src/renderers/render-state.ts` exports `createRenderState<T>()` returning
  `{ set(container, attachment), destroyFor(container) }`.
- Every renderer stores exactly one attachment per container and implements
  `destroy(container)` that calls `destroyFor(container)`, releasing everything it
  created in `render()` (disconnect observers, cancel rAF, call engine teardown such as
  `loadingTask.destroy()` for PDF).
- Orchestration (`src/preview.ts`) owns the container lifecycle: on `preview()`,
  `clearPreview()` runs the previous cleanup (`unmountControls()` + `renderer.destroy(stage)`),
  and a per-container **generation counter** makes stale async work from an older preview
  self-abort (`isCurrent()` checks) so it can never overwrite a newer preview.

## Consequences

- The destroy contract is uniform: "everything created in `render()` for this container
  is undone in `destroy()`".
- Multiple previews on one page are independent (container-scoped state).
- A renderer that skips cleanup is trivially caught in review because the shape is uniform.