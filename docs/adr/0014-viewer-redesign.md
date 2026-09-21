# ADR-0014: Viewer redesign — multi-side glass chrome, zero overlap, no search/theme

- **Status:** Accepted
- **Date:** 2026-09-21

## Context

The earlier two-bar redesign (this ADR's previous revision) moved away from a
single crowded bar, but three decisions aged badly in practice:

1. **Overflow menus hide important controls.** The top chrome bar collapsed
   frequently-used controls behind a **⋯** menu on narrow surfaces, and the
   bottom "document bar" duplicated order/purpose with the top bar. Explicitly
   desired behavior: *every* control is always reachable, on every surface.
2. **Search + dark mode doubled the surface area.** Per-format search
   (`SearchControls`) required renderer-specific find machinery in seven
   renderers, and the theme system (`setPreviewTheme` + `data-pf-theme`)
   persuaded every renderer to double its palette. The product wanted a single
   polished light surface with no search — far less code, far fewer edge cases.
3. **Nested preview overlap.** Opening a file inside an archive mounted a *full
   second preview* (its own chrome bar) on top of the archive's own chrome bar in
   the same container. Sticky/overlay stacking could cover content or controls.
   The architecture needed a structural (not z-index) guarantee.

## Decision

### Multi-side chrome, all controls visible

`mountControls(container, actions)` now renders a single `.pf-controls` flex
column:

- `.pf-top` — file context (icon + ellipsized name + format badge), **Mode**,
  **Text** (copy/wrap), a spacer, and **Download** pinned right.
- `.pf-body` — a row of `[.pf-rail--left] [.pf-body__middle] [.pf-rail--right]`.
  The renderer's stage moves, DOM subtree untouched, into the middle slot
  (the old code appended it after the right rail — a real ordering bug caught
  and fixed here).
  - Left rail: **Sheets** (stacked segmented) and **Thumbnails**.
  - Right rail: **Zoom** (out / % chip / in / actual-size), **Fit** (width /
    page / actual), **Rotate** (ccw / degree input / cw / reset), **View**
    (single/continuous + fullscreen), **Lens**.
- `.pf-bottom` — **Pages** (prev / page input / total / next).

Empty regions get `display: none` (no empty bars). There is **no overflow ⋯
menu**: groups overflow naturally — the top/bottom bars scroll horizontally, the
rails wrap on narrow surfaces — so nothing is ever hidden behind a menu.

### Normal-flow only (the zero-overlap guarantee)

Every chrome surface is an in-flow flex sibling of the stage. Nothing is
`position: sticky`, `fixed`, or an overlay; no z-index is set on controls. Two
control surfaces can therefore *never* overlap content or each other — including
when a renderer nests a full second preview via `context.previewSource`
(archives). This is the architectural invariant the previous revision lacked.

### Liquid Glass light palette only

- `src/utils/theme.ts` holds the single token set, scoped to `.pf-root` and
  injected once per page as `#pf-theme-styles` (`ensureThemeStyles`).
  Renderer-facing tokens keep their names and light values
  (`--pf-ink`, `--pf-line`, `--pf-surface`, `--pf-accent`, `--pf-folder` …),
  plus new glass tokens (`--pf-glass`, `--pf-glass-line`, `--pf-seg-*`,
  `--pf-hover`, `--pf-panel-shadow` …). There is no dark palette.
- The public theme API (`setPreviewTheme`, `getPreviewThemeMode`,
  `onPreviewThemeChange`, `ThemeMode`) is **removed** — it no longer exists in
  `src/index.ts`. `PreviewOptions.theme` is removed. Monaco stays on native
  light (`vs`) with no `setTheme` wiring.

### Search removed

`SearchControls` and the search surface are **removed** from the chrome, the
`PreviewAdapter`/`PreviewActions` contracts, and every renderer (text, code,
markdown, word, pdf, presentation, csv, excel, archive). Per-format search
modules (`text-search.ts`, `monaco-find.ts`, `pdf-search.ts`, `table-search.ts`)
are deleted.

### Archive: professional two-pane explorer

`src/renderers/archive.ts` is rewritten as a split explorer:

- **Left pane** (`.pf-arc-tree`, 264px) owns *all* archive chrome: back /
  forward / up / root navigation, breadcrumbs, format badge, a virtualized entry
  list (folder/file icons, sizes, per-file download, selected row
  `aria-current`), and a footer with folder/file counts.
- **Right pane** (`.pf-arc-pane`) hosts the nested preview (`.pf-arc-host`)
  inside a canvas; when nothing is open an empty-state placeholder shows. The
  nested file's own full chrome mounts inside this pane — a flex sibling of the
  tree — so the two control surfaces are structurally incapable of overlapping.
- **Mobile (≤ 767px):** the tree becomes a slide-in drawer (the pane fills the
  stage), and the pane gains an always-visible `.pf-arc-mobilebar` with a
  "show file list" toggle — the toggle never hides behind the stack and never
  overlaps the nested preview's chrome.

### Responsive + accessibility baselines

- ≤ 760px: `.pf-body` becomes a column, stage first, rails reflow as horizontal
  wrapped strips below it (no overflow menu, everything still reachable).
- Coarse pointers grow icon buttons to ≥ 38px; focus rings are 2px accent;
  segments are radiogroups with roving tabindex; buttons use `aria-pressed`;
  decorative icons are `aria-hidden`.

## Consequences

- **Positive.** Zero-overlap is structural, not a z-index anecdote: the archive
  smoke test mounts a nested preview and asserts its host lives inside
  `.pf-arc-pane` and never under the tree. One palette, one chrome, no hidden
  controls; the codebase sheds seven search modules and the entire theme
  controller.
- **Cost/watch items.**
  - Multi-rail chrome consumes horizontal space; on very narrow surfaces the
    rails wrap beneath the stage and the top/bottom bars scroll — acceptable and
    deliberate, but content is smaller on phones.
  - Removing search and dark mode is a product cut, not a pure engineering win;
    consumers wanting either must implement it in the renderer, out of band.
  - The toolbar's `.pf-body__middle` stage slot is part of the public DOM shape;
    renderers and consumers must not rely on the stage being a direct child of a
    specific rail.
- Renderers keep sourcing colors from `--pf-*` tokens, but only one light palette
  exists now, so the fallback hex in `var(--pf-*, fallback)` should be the light
  value.

## References

- [ADR-0003](0003-capability-driven-toolbar.md) — capability-driven toolbar
  (replaced by this ADR's chrome; each capability still maps to a control group).
- [ADR-0013](0013-monaco-code-preview.md) — Monaco preview (stays on `vs` light;
  no find/decorate search and no `setTheme` wiring remain).