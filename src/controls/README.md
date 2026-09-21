# `src/controls/` — chrome & capability types

The UI layer. Renderers communicate the actions they support through
`PreviewAdapter`; `preview()` converts it into a `PreviewActions` object and
`mountControls()` builds the multi-side chrome that exposes exactly those
capabilities. The chrome never renders a control the active renderer didn't
opt into.

## Modules

| Module | Content |
| --- | --- |
| `types.ts` | The capability contract: `PreviewAdapter`, `PreviewActions`, and each control group (`pages`, `fit`, `rotate`, `zoom`, `sheets`, `text`, `singlePage`, `thumbnails`, `lens`, `download`, `fullscreen`). **This is the contract every renderer implements.** |
| `toolbar.ts` | `mountControls(container, actions)` — DOM build of the Liquid Glass chrome: `.pf-controls` → `.pf-top` / `.pf-body` / `.pf-bottom`, body = `[.pf-rail--left] [.pf-body__middle] [.pf-rail--right]`. `buildToolbar` returns a `{ root, stageHost, cleanup }`; `mountControls` moves the renderer's stage (subtree untouched) into the middle slot. Groups: **File** (top bar, right: Download), **Mode** (Preview/Code), **Text** (copy / word-wrap), **Sheet** + **Thumbnails** (left rail), **Zoom** / **Fit** / **Rotate** / **View** / **Lens** (right rail), **Pages** (bottom bar). Empty regions are `display: none`. No overflow **⋯** menu: bars scroll, rails reflow under the stage ≤ 760 px. Keyboard accessibility: roving tabindex, `radiogroup`, `aria-pressed`. Live page / zoom % / rotation sync. |
| `download.ts` | `downloadBlob(blob, filename)` — programmatic download helper. |
| `index.ts` | Barrel: `mountControls`, `downloadBlob`, all capability types. |

## Adding a new toolbar control

1. Define the capability interface in `types.ts` (e.g. `TextControls`).
2. Implement it on a renderer's `PreviewAdapter`.
3. Add the corresponding control group in `toolbar.ts` — top bar for actions,
   left/right rails for grouped tools, bottom bar for state that reads live
   page/zoom values.

Because the chrome is *derived* from the adapter, renderers never build their own
controls — adding a capability in the renderer is all that's needed for it to appear.

## Zero-overlap layout

Every chrome surface is an **in-flow flex sibling** of the stage inside
`.pf-body` — no `position: sticky/fixed`, no overlays, no z-index on controls.
Containers are split into panes (rails | middle) on wide surfaces and a column
(stage first) on narrow ones, so controllers can never cover preview content.
This is what lets an archive's nested preview keep its whole chrome visible
without colliding with the archive's own navigation.

## Styling

- All colors come from the single light **Liquid Glass** `--pf-*` token set in
  `src/utils/theme.ts`, injected once as `#pf-theme-styles` and scoped to
  `.pf-root`. No dark palette, no theme API, no `data-pf-theme`. Raw hex is only
  ever a fallback.
- One `#pf-glass-styles` `<style>` element; `pf-*` classnames scoped to the
  preview container. No shadow DOM, no framework, no external CSS.
- Responsive rules: coarse pointers grow targets to ≥ 38 px, group labels hide
  at ≤ 480 px, and `prefers-reduced-motion` disables the entrance/transition
  animations.
- Icons are Lucide SVGs from `src/icons/`, inlined at runtime as
  `stroke="currentColor"` so they inherit control styling
  (`scripts/build-icons.mjs` regenerates `src/icons/icons.ts` and copies the raw
  SVG assets into `dist/icons/`).