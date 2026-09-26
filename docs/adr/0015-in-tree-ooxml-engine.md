# ADR-0015: PowerPoint preview via an in-tree OOXML engine

- **Status:** Accepted
- **Date:** 2026-09-26
- **Supersedes:** [ADR-0012](0012-presentation-preview.md)

## Context

[ADR-0012](0012-presentation-preview.md) chose `pptx-viewer` to render PowerPoint on the
shared paged-document controller. It worked, but it put a dependency between us and every
correctness question about a slide, and three of its behaviours were wrong in ways that
showed up on real decks:

- Text run styling bled between adjacent runs, so a bold lead-in repainted the rest of the
  sentence.
- Shapes filled with a preset geometry that had no outline rendered as their own bounding
  box, because the stroke's default `fill: 'none'` overrode the path's fill. Every
  unoutlined triangle, ellipse and arrow came out invisible.
- `font-weight` was emitted as a length (`700px`), which CSS rejects, so bold was silently
  dropped document-wide.

Each of those is a one-line fix that we cannot make in a dependency, and each is invisible
until someone opens a specific deck. Beyond that, the fidelity ceiling is set by someone
else's priorities, and the parse and paint steps are split across a package boundary that
also owns its own DOM helpers.

The deck format is not exotic: an OPC zip of XML, and the geometry is coordinates. The
parts we needed — relationships, theme and colour resolution, the placeholder cascade,
text inheritance, geometry, pictures, charts, tables — are all things this codebase already
does for other formats.

## Decision

Parse and paint PowerPoint in-tree, in two layers, and drop `pptx-viewer`.

- **`src/ooxml/`** — OPC and OOXML reading, no DOM. `OfficePackage` opens the container and
  resolves relationships; `parsePresentation()` returns a resolved model where placeholder
  geometry and list styles have already been inherited through master → layout → slide.
  Nothing here knows about rendering, so it is testable without a browser.
- **`src/renderers/ooxml/`** — painting. DrawingML is bridged to CSS plus SVG overlays
  (`paint.ts`, `path.ts`), text and tables become positioned DOM, charts become inline SVG,
  and images are resolved by `assets.ts` into object URLs that are revoked on teardown.
- **`src/renderers/presentation/index.ts`** — the only file that knows about previews. It
  opens the package, mounts the shared `createDocStage`, and makes each slide a page in the
  shared paged-document controller, so navigation, zoom, fit and single-page mode are
  unchanged and still come from `docview.ts` (ADR-0006).

Consequences worth stating plainly:

- **No lazy import for PowerPoint** (ADR-0004 still governs pdf.js, Word and Excel). There
  is nothing to fetch; the engine is in the package the consumer already has.
- **Legacy `.ppt`/`.pps`/`.pot` and `.odp` are unchanged**: still the fallback card, because
  they are not OOXML packages and a browser cannot read them.
- **A modern deck that fails to parse now renders the error card** rather than silently
  falling back to a second engine, because there is no second engine. Per-slide resilience
  is unchanged: a slide that fails to paint degrades to an in-slide notice.

## Alternatives considered

- **Keep `pptx-viewer` and file bugs upstream** — rejected: the three defects above are in
  its paint path, so there is no patch we can carry, and each fix would wait on a release.
- **Wrap the fix in our own renderer over its parser** — rejected: its model is a
  slide-shaped view of the deck, so the placeholder and list-style cascade is already
  resolved or already lost by the time we see it. Rebuilding the cascade is most of the
  work, which leaves only its zip handling.
- **Convert to PDF and reuse the PDF path** — rejected: needs a converter in the browser
  (Wasm), gives up selectable text and search, and stops being a PowerPoint preview.

## Consequences

- The dependency tree loses `pptx-viewer`; the bundle a consumer ships for PowerPoint drops
  by roughly the size of that package.
- Fidelity is ours to fix. The known boundaries are written down in `ARCHITECTURE.md`
  instead of being a library's changelog.
- `scripts/ooxml-conformance/` asserts the engine in a real browser against the built
  package, because the assertions that matter are about layout and painting. It is the
  interim layer for this engine only; the general harness is still ADR-0010.
