# ADR-0006: One `PagedDocController` for PDF and Word layout

- **Status:** Accepted
- **Date:** 2026-09-18

## Context

PDF and Word render both need the same paged-document behavior: real page geometry,
page shadows, continuous vs. single-page mode, fit-width/fit-page/actual-size, zoom with
scroll anchoring, go-to-page, and live page indicators. Historically this logic was
**copied** between the two renderers (~150 duplicated lines), diverging subtly.

## Decision

- `src/renderers/docview.ts` owns everything about paged layout:
  - `createDocStage(container)` — the scrolling, centered DOM stage.
  - `createPagedDocController(host)` — the state machine: scale, fit mode, single-page
    mode, active page, page-change listeners; emits `PagedDocViewState { scale, metrics }`
    through the host's `onLayout`/`onScrollFrame` hooks.
  - `computePageMetrics`, `pageIndexAtCenter`, `pageTopFromIndex` — geometry helpers.
- Renderers keep only what is format-specific: producing the page geometry
  (`PagedDocHost.metrics`) and drawing page content (the hooks). Both return the
  controller's `adapter` (the zoom/pages/fit/singlePage slice) plus their own extras
  (PDF rotation, Word legacy fallback).

## Consequences

- Layout bugs are fixed once, not twice; the PDF and Word layouts can never diverge again.
- A future paged format gets all navigation/zoom/fit behavior for free.
- The PDF and Word renderers shrank by ~150 lines each and are now mostly about `metrics`
  and rendering pages.