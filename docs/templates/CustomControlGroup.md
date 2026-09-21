# Adding a Toolbar Control / Capability

The toolbar never renders a control the active renderer didn't opt into. Adding a new
control is a three-part change spanning `src/controls/` and your renderer.

## Contract recap (from `src/controls/types.ts`)

```ts
interface PreviewAdapter {
  canZoom?: boolean
  canDownload?: boolean
  canFullscreen?: boolean
  zoomPercent?: number
  zoomIn?(): void
  zoomOut?(): void
  resetZoom?(): void
  download?(): void
  lens?: LensAdapter
  pages?: PageNavigation
  fit?: FitControls
  rotate?: RotateControls
  sheets?: SheetNavigation
  text?: TextControls
  singlePage?: SinglePageMode
  thumbnails?: ThumbnailControls
  fullscreen?: FullscreenControls
}

interface PreviewActions {
  // Same surface, but wrapped with error handling by src/preview.ts#buildActions.
  // The toolbar consumes ONLY PreviewActions — never the adapter directly.
}
```

## Workflow

### 1. Define the capability interface — `src/controls/types.ts`

Add a small interface describing the state and methods the control needs. Existing
examples: `PageNavigation`, `TextControls`, `LensAdapter`.

```ts
/** TEMPLATE: a capability describing a "word count" control. */
export interface WordCountControls {
  get count(): number // live value (e.g. updated on text changes)
}
```

Then add it to `PreviewAdapter`:

```ts
interface PreviewAdapter {
  // …
  wordCount?: WordCountControls
}
```

Export it from `src/controls/index.ts` **only if** it should be part of the package's
public types (type-only re-export).

### 2. Forward it through the actions bridge — `src/preview.ts`

`buildActions()` maps adapter capabilities into `PreviewActions`. Add the forwarding line
next to the existing ones (`pages: adapter?.pages`, `text: adapter?.text`, …):

```ts
return {
  // …existing entries…
  wordCount: adapter?.wordCount,
}
```

### 3. Render it in the toolbar — `src/controls/toolbar.ts`

Add a control group. Follow the existing structure: build groups guarded by their
capability and append buttons into a row. The chrome has no overflow **⋯** menu:
top bar (`.pf-top`) is for single actions and the file context, left/right rails
(`.pf-rail--left` / `.pf-rail--right`) hold grouped tools, and the bottom bar
(`.pf-bottom`) holds live-state pagination (Pages). Empty regions are
`display: none`, so pick the surface that matches your control's lifetime.

Layout of `mountControls` today, roughly:

1. group builders (`makeButton`, segmented controls as `radiogroup`s)
2. `buildRail`/`buildBar` helpers append each group into its flex slot
   (`.pf-top` → body rails → `.pf-bottom`); `preview.ts` moves the renderer's
   stage into `.pf-body__middle` via the `stageHost` returned by `buildToolbar`
3. `refresh()` re-syncs live values (zoom %, rotation, current page)

Add your group in the same style. Because `refresh()` re-reads state, live
capabilities (zoom %, count, page) stay current with the polling already in
place.

### 4. Implement the capability in a renderer

Return the new field from the renderer's `PreviewAdapter`:

```ts
const adapter: PreviewAdapter = {
  // …
  wordCount: {
    get count() {
      return countWords()
    },
  },
}
```

That's it — the toolbar picks the group up automatically. Re-expose nothing else.

## Verification

- `npm run typecheck && npm run lint && npm run build`
- Smoke-test the affected renderer in the playground, including narrow-container
  rails-wrap behaviour of the new group.

## Design rules

- One capability = one interface + one group. Don't overload a bundle of options into one.
- The group must be a no-op when the capability is absent — guards do this automatically.
- Keep state in the renderer; the toolbar only *reads* the adapter/actions.