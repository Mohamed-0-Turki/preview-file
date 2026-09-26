# ADR-0012: Presentation preview via an external DOM/SVG renderer on the paged-document controller

- **Status:** Superseded by [ADR-0015](0015-in-tree-ooxml-engine.md)
- **Date:** 2026-09-18

> The engine choice here no longer holds. The *architecture* in this ADR still does: slides
> stay pages on the shared paged-document controller, and legacy formats still fall back.
> See ADR-0015 for why the renderer became in-tree.

## Context

We need an in-browser PowerPoint preview: native slide rendering (layout, text, shapes,
images, charts, tables, colors/positioning), slide navigation with current/total counts,
previous/next controls, fit-while-preserving-aspect-ratio, and responsiveness — without
converting to PDF and without modifying the original file.

Candidate libraries were evaluated against our constraints (MIT/open source, small and
lazy-loadable, headless enough to mount inside a renderer-owned stage, truthful rendering):

- `pptx-preview@1.0.7` — disqualified: npm metadata says ISC, but its README declares the
  source closed/paywalled and explicitly forbids turning it into one's own open-source
  project (a licensing red flag for an MIT package), and its `init()` API owns its own
  toolbar/container, which conflicts with our capability-driven toolbar.
- `pptx-browser` — Canvas-only output (rasterizes under our CSS-scale pipeline), zero deps
  but thinner fidelity.
- `pptx-svg` — brand-new Wasm renderer; too early and SVG-string-only.
- `@aiden0z/pptx-renderer` — rich, TS-first, but Apache-2.0 and ~3.5 MB (bundles ECharts);
  far heavier than the rest.
- **`pptx-viewer` (mdurbar)** — chosen: MIT, one small dependency (`fflate`), ~418 KB
  unpacked, TS types, and a headless, per-slide API (`loadPresentation` →
  `renderSlideToElement`), SVG output that stays crisp under CSS transforms.

No mature library renders legacy binary `.ppt`/`.pps`/`.pot` or OpenDocument `.odp`,
so those formats show a fallback card (like legacy Word `.doc`).

## Decision

- Add `pptx-viewer` as the presentation engine, dynamically imported inside the renderer
  (`render()`) per [ADR-0004](0004-lazy-engine-loading.md).
- Normalize all presentation MIMEs under one result type (`application/vnd.presentation`)
  with a `format` field, following the Word/Excel pattern
  ([ADR-0002](0002-normalized-result-types.md)); OOXML family (`pptx|pptm|potx|potm|ppsx|ppsm`)
  renders, binary `.ppt|pps|pot` and `.odp` fall back.
- Treat each slide as a page of the shared `PagedDocController`
  ([ADR-0006](0006-paged-doc-controller.md)), so navigation, zoom, fit,
  continuous/single-page mode and responsive ResizeObserver wiring are inherited, not
  reimplemented. Add a generic `host.initialFit` option so slide decks start
  fit-to-page while PDF/Word keep their historical fit-to-width default.
- Slides render lazily to DOM/SVG inside their stage wrappers (one `IntersectionObserver`
  per preview); the renderer passes explicit width/height so the SVG is sized
  independent of the stage's CSS scale transform. A slide that fails to render degrades
  to an in-slide notice; a presentation that cannot be parsed uses the standard error
  card. `presentation.cleanup()` (fonts, blob URLs, archive) runs on teardown.
- Reuse a shared `renderLegacyFallback()` card (extracted from the Word renderer) for
  non-renderable presentation formats.

## Consequences

- PowerPoint previews reuse the whole paged-document stack: navigation,
  previous/next, current/total count, zoom/fit and responsive behaviors come for free
  and stay consistent with PDF/Word.
- Asset weight grows only when PowerPoint is opened: `pptx-viewer` + `fflate` load on
  first use (lazy), consistent with the other engines.
- Binary `.ppt`/`.pps`/`.pot` and `.odp` remain pre-render fallbacks (Download) — no
  in-browser renderer exists for them today; revisit if a viable MIT/OFC renderer
  appears.
- Rendering is static: transitions, and video/audio are not replayed. Documented as a
  known boundary.
- `pptx-viewer` (v0.2.x) is a young project; its API is small and stable-shaped, and the
  wrapper isolate it behind our renderer boundary so swapping engines later is a
  single-file change.