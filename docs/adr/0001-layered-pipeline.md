# ADR-0001: Layered pipeline with one-way dependencies

- **Status:** Accepted
- **Date:** 2026-09-18

## Context

The preview pipeline spans very different concerns: normalizing input, detecting file
type, extracting a typed result, rendering DOM, and mounting UI controls. Without a
strict layering, modules drift into each other (renderers importing preview logic,
utils depending on DOM, circular type imports).

## Decision

The pipeline is `sources → detect → previewers → renderers → controls`, orchestrated
only by `src/preview.ts`. Dependencies flow **downward only**:

- `src/utils/` imports nothing from other layers — it is the dependency bottom.
- `previewers/`, `renderers/`, `controls/`, `sources/` may import `utils/` and `../types.js`.
- `renderers/` may import types from `controls/`/`previewers/` and runtime guards from
  `previewers/result-types.js`; no other cross-layer runtime imports.
- Nothing may import `preview.ts` or `index.ts`.
- Cross-layer runtime imports go through each layer's `index.js` barrel.

## Consequences

- Cross-cutting types live in `src/types.ts` (no imports); per-layer types live in the
  layer (`resolved` types in `sources/`, `Previewer` in `previewers/`, `Renderer` in
  `renderers/`, capability types in `controls/`). `types.ts` must never import a layer,
  else the type-only cycle `types ↔ layer` returns.
- `preview.ts` is the single place that wires layers, so adding a layer is a local change.
- AI agents can assume imports are "safe" if they follow the downward rule; violations
  are caught by typecheck and review.