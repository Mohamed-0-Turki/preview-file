# `src/controls/` — toolbar & capability types

The UI layer. Renderers communicate the actions they support through
`PreviewAdapter`; `preview()` converts it into a `PreviewActions` object and
`mountControls()` builds a sticky navbar toolbar that exposes exactly those
capabilities. The toolbar never renders a control the active renderer didn't
opt into.

## Modules

| Module | Content |
| --- | --- |
| `types.ts` | The capability contract: `PreviewAdapter`, `PreviewActions`, and each control group (`pages`, `fit`, `rotate`, `zoom`, `sheets`, `search`, `text`, `singlePage`, `thumbnails`, `lens`, `download`, `fullscreen`). **This is the contract every renderer implements.** |
| `toolbar.ts` | `mountControls(container, actions)` — DOM build of the sticky toolbar, grouped controls, overflow **⋯** menu on narrow containers, keyboard accessibility (roving tabindex, `radiogroup`, `aria-pressed`), live zoom-% / rotation sync. |
| `download.ts` | `downloadBlob(blob, filename)` — programmatic download helper. |
| `index.ts` | Barrel: `mountControls`, `downloadBlob`, all capability types. |

## Adding a new toolbar control

1. Define the capability interface in `types.ts` (e.g. `TextControls`).
2. Implement it on a renderer's `PreviewAdapter`.
3. Add the corresponding control group in `toolbar.ts`.

Because the toolbar is *derived* from the adapter, renderers never build their own
controls — adding a capability in the renderer is all that's needed for it to appear.

## Styling

- One globally-injected `#pf-glass-styles` `<style>` element; `pf-*` classnames
  scoped to the preview container. No shadow DOM, no framework, no external CSS.
- Icons are Lucide SVGs from `src/icons/`, inlined at runtime as
  `stroke="currentColor"` so they inherit control styling
  (`scripts/build-icons.mjs` regenerates `src/icons/icons.ts` and copies the raw
  SVG assets into `dist/icons/`).