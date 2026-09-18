# Templates

Copy-paste scaffolding for the standard extension workflows. The `.ts` files here are
**documentation artifacts** — they are not compiled (tsconfig only includes `src/`) and
not unit-tested. They are kept in sync with real code by convention; when you update a
real previewer/renderer, consider updating its template here too.

| Template | Use for | Pair with |
| --- | --- | --- |
| [`CustomPreviewer.ts`](CustomPreviewer.ts) | A new file → typed-result stage | [`docs/adr/0002-normalized-result-types.md`](../adr/0002-normalized-result-types.md) |
| [`CustomRenderer.ts`](CustomRenderer.ts) | A new result → DOM + adapter stage | [`docs/adr/0003-capability-driven-toolbar.md`](../adr/0003-capability-driven-toolbar.md) |
| [`CustomControlGroup.md`](CustomControlGroup.md) | A new toolbar capability/control | `src/controls/types.ts`, `src/controls/toolbar.ts` |

## How to use

1. Copy `template.ts` to `src/previewers/markdown.ts` / `src/renderers/markdown.ts`
   (replace `markdown` with your format; follow the existing class/file naming).
2. Fill in the `???` placeholders, delete the instructional comments.
3. Carry out the registration steps listed at the bottom of each template.
4. Run `npm run typecheck && npm run lint && npm run build`.

## Rules to preserve

- Previewers: no DOM, no heavy parsing, deterministic output from bytes.
- Renderers: heavy engines `await import()`ed **inside** `render()` only; register the
  attachment with `createRenderState`; release everything in `destroy()`.
- Return `void` from `render` for a read-only view with no controls — never a fake adapter.