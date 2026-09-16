# preview-file

A dependency-free-by-design, browser-only file preview library. Drop PDF, Word, Excel, CSV, text and image files into any element and get a rich, self-managed preview — real page geometry for PDF/Word, spreadsheet-style data views for Excel/CSV, and a sticky top toolbar that behaves like a navbar and only shows the controls the active preview supports.

- **No framework required.** Vanilla JS is a first-class citizen; React, Vue, Svelte and Angular use the exact same `preview()` call.
- **Capability-driven controls.** Each previewer declares what it can do and the toolbar renders exactly that (zoom, pages, sheets, search, rotate, thumbnails, lens, download, fullscreen).
- **Lazy by default.** Heavy engines (pdf.js, docx-preview, SheetJS) are loaded on demand, only when their format is actually previewed.
- **Layout-free.** The library renders inside whatever element you provide. It never opens a modal and never owns your page.

---

## Supported formats

| Type | Extensions | Preview | Notes |
| --- | --- | --- | --- |
| PDF | `.pdf` | Rendered pages with real A4 geometry, page shadows, continuous / single-page mode, go-to-page | pdf.js |
| Word | `.docx`, `.docm`, `.dotx`, `.dotm` | Paginated document with headings, tables and embedded images | docx-preview |
| Word (legacy) | `.doc`, `.dot` | In-preview fallback card with a Download button | Binary format not rendered |
| Excel | `.xlsx`, `.xlsm`, `.xlsb`, `.xls`, `.xltx`, `.xltm`, `.xlt` | Sheet tabs, navigation, search | SheetJS |
| CSV | `.csv` | Virtualized table, sheet-style navigation, search | Built-in (no dependency) |
| Text | `.txt`, `.md` (as `text/plain`) | Copy, word-wrap toggle | Built-in |
| Images | `.jpg`, `.png`, `.gif`, `.webp`, `.svg`, `.avif`, `.bmp`, `.apng` | Zoom/fit, inspection loupe, rotate | Built-in |

Unsupported or oversized files render a retriable error card (with a Download button) inside the container instead of breaking your layout.

---

## Install

```bash
npm install @mohamed-0-turki/preview-file
```

The package is ESM-only and ships its own TypeScript types (`dist/index.d.ts`).

> `preview()` requires a browser environment (`document`, canvas, workers). It throws in Node/SSR — see [Framework usage](#framework-usage).

---

## Quick start

```ts
import { preview, clearPreview } from '@mohamed-0-turki/preview-file'
```

### From a `File`

```ts
const input = document.getElementById('file') as HTMLInputElement

input.addEventListener('change', async () => {
  const file = input.files?.[0]
  if (!file) return

  const container = document.getElementById('preview')!

  try {
    await preview(file, container)
  } catch (error) {
    console.error(error) // container already shows the error card
  }
})
```

### From a URL (string)

```ts
await preview('https://example.com/report.pdf', container)
```

Strings are treated as URLs. The library `fetch`es them, infers the file name from the URL, and keeps the response's content type.

> Remote files must be served with permissive [CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS) headers. Blocked/missing URLs render the error card.

### From a `Blob` (fetch result, canvas output, …)

```ts
const res = await fetch('/data/report.xlsx')
const blob = await res.blob()

await preview(blob, container) // name is inferred as "file"; prefer File when you have a name
```

### Clearing

```ts
// Unmounts controls, destroys renderer state, empties the container.
clearPreview(container)
```

---

## Options

```ts
interface PreviewOptions {
  /** Maximum accepted file size, in bytes. Larger files show an error card. */
  maxBytes?: number

  /** URL of the pdf.js worker module (`pdf.worker.mjs`). Use to point a single
   *  preview at a self-hosted worker, overriding `setPdfWorkerSrc()` and the
   *  built-in CDN default. */
  workerSrc?: string

  /** Image magnifier (loupe) configuration. */
  magnifier?: {
    lensSize?: number      // lens diameter in px (default 160)
    magnification?: number // 2 | 4 | 8 | 12 | 16 (default 8)
    borderWidth?: number   // lens border thickness in px
  }
}
```

```ts
await preview(file, container, {
  maxBytes: 25 * 1024 * 1024, // 25 MB
  workerSrc: '/workers/pdf.worker.min.mjs', // optional, self-hosted worker
  magnifier: { lensSize: 180, magnification: 12 },
})
```

---

## PDF rendering & the worker

PDF pages are rendered by [pdf.js](https://mozilla.github.io/pdf.js/), which runs its
worker in a separate thread via `pdf.worker.mjs`. This package never reads or inlines
that worker through a bundler-specific import, so it works identically in Vite, Webpack,
Rollup, Next.js, Nuxt, Remix, Astro and vanilla `<script type="module">`.

**Default worker URL.** The library points pdf.js at a version-pinned copy of the worker
hosted on a public CDN (`cdn.jsdelivr.net`), so PDF previews work out of the box with no
bundler configuration. The version always matches the `pdfjs-dist` instance this package
resolved, so the worker and the pdf.js API can never drift.

**Bring your own worker.** `setPdfWorkerSrc(url)` changes the worker globally; the
per-preview `options.workerSrc` overrides it for a single call. Provide your own worker
whenever you:

- self-host your assets (recommended for production), or
- run behind a [CSP](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP) that blocks
  third-party scripts, or
- need to render PDFs offline / in an air-gapped environment.

The worker is only fetched when a PDF is actually rendered — never at import time.

```ts
// Global option, set once before previewing any PDF:
import { preview, setPdfWorkerSrc } from '@mohamed-0-turki/preview-file'

setPdfWorkerSrc('/workers/pdf.worker.min.mjs')
await preview(pdfUrl, container)
```

```ts
// Per-preview option:
await preview(pdfUrl, container, { workerSrc: '/workers/pdf.worker.min.mjs' })
```

### Making the worker available in each build setup

The worker file lives at `node_modules/pdfjs-dist/build/pdf.worker.min.mjs`. How you serve
it depends on your setup:

**Vanilla JS / any static server** — copy the file next to your app:

```bash
cp node_modules/pdfjs-dist/build/pdf.worker.min.mjs public/workers/
```

**Vite** — copy or import it as a URL (the library itself never needs `?raw` — this is
your app's choice, if you want to self-host):

```ts
import { setPdfWorkerSrc } from '@mohamed-0-turki/preview-file'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

setPdfWorkerSrc(workerUrl as string)
```

**Next.js** — copy the worker into `public/`:

```bash
mkdir -p public/workers
cp node_modules/pdfjs-dist/build/pdf.worker.min.mjs public/workers/
```

```ts
// lib/preview.ts
import { setPdfWorkerSrc } from '@mohamed-0-turki/preview-file'
setPdfWorkerSrc('/workers/pdf.worker.min.mjs')
```

**Webpack** — copy it to your output directory (or use `worker-loader`/`?file-loader`
semantics) and point at the emitted URL. If the worker is served cross-origin, pdf.js
wraps it in a same-origin loader automatically.

If the worker URL can't be loaded, pdf.js falls back to running its worker code on the
main thread (a console warning appears) and the PDF still renders.

---

## The toolbar & previewer capabilities

After a successful render, `preview()` mounts a sticky toolbar pinned to the top of the preview container. It behaves like a normal website navbar: it is part of the preview layout (never an overlay), stays visible while the preview content scrolls beneath it, and uses `position: sticky`, so it moves naturally with the page instead of being fixed to the browser viewport. Only the controls the active previewer actually implements appear:

- **Pages** — previous / next / go-to-page (PDF, Word)
- **View** — continuous ↔ single page (PDF, Word), thumbnails
- **Zoom** — zoom in/out, reset, fit width / fit page / actual size, live % indicator
- **Rotate** — clockwise / counter-clockwise, exact-degree input, reset rotation (PDF, images)
- **Sheet** — sheet tabs (Excel, CSV)
- **Search** — in-sheet/in-document search with result count (Excel, CSV, PDF)
- **Text** — copy, word-wrap (text)
- **Lens** — magnifier magnification & size (images)
- **File** — download (all), fullscreen (all)

On narrow containers the least-critical groups collapse into a **⋯** overflow menu while Pages, Zoom, View and Sheet stay pinned to the bar, so rotation and view controls remain one tap away. The toolbar is keyboard-accessible (`radiogroup` segments with roving tabindex, arrow keys, visible focus rings) and honors `prefers-reduced-motion`.

---

## Framework usage

All frameworks share one call: `preview(source, container, options)`. The only requirement is that it runs on the **client**, after the container exists in the DOM.

### React

Call it in an effect, once per source. Use `clearPreview` on unmount/source change to avoid leaks.

```tsx
import { useEffect, useRef } from 'react'
import { preview, clearPreview } from '@mohamed-0-turki/preview-file'

export function FilePreview({ source }: { source: File | string | null }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (source == null) return
    let cancelled = false
    preview(source, el).catch((error) => console.error(error))
    return () => {
      cancelled = true
      clearPreview(el)
    }
  }, [source])

  return <div ref={ref} className="h-96 w-full" />
}
```

### Next.js (App Router)

Preview components must be **client** components (`"use client"`). To keep the heavy preview engine out of the server bundle entirely, load the previewer itself with `next/dynamic` and `ssr: false`. See the interactive demo in [`site/app/examples`](site/app/examples).

```tsx
// components/FilePreview.tsx
'use client'
import { useEffect, useRef } from 'react'
import dynamic from 'next/dynamic'

const DynamicPreview = dynamic(() => import('./DynamicPreview'), {
  ssr: false,
  loading: () => <p>Loading previewer…</p>,
})

export function FilePreview({ source }: { source: File | string | null }) {
  // ...
}
```

```tsx
// components/DynamicPreview.tsx
'use client'
import { useEffect, useRef } from 'react'
import { preview, clearPreview } from '@mohamed-0-turki/preview-file'

export default function DynamicPreview({ source }: { source: File | string | null }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || source == null) return
    preview(source, el).catch((error) => console.error(error))
    return () => clearPreview(el)
  }, [source])
  return <div ref={ref} className="h-96 w-full" />
}
```

> **SSR note:** `preview-file` only touches the DOM inside `preview()`/`clearPreview()`, which you call inside a side effect — so the module is safe to import statically. `next/dynamic(..., { ssr: false })` is an extra guarantee that keeps parsing / pdf.js out of the server bundle.

### Next.js (Pages Router)

Identical pattern, with a `.tsx` client component; if you prefer, disable SSR per component. Effects only ever run on the client.

### Vue / Nuxt

Vue composition:

```html
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { preview, clearPreview } from '@mohamed-0-turki/preview-file'

const el = ref<HTMLDivElement>()
const source = ref<File | null>(null)

onMounted(async () => {
  if (el.value && source.value) await preview(source.value, el.value)
})
onBeforeUnmount(() => {
  if (el.value) clearPreview(el.value)
})
</script>

<template>
  <div ref="el" class="preview-box" />
</template>
```

In Nuxt, keep the component in `components/` (client-rendered by default for interactive components) or mark it with `client-only` when the source is generated at runtime.

### Svelte / SvelteKit

```svelte
<script lang="ts">
  import { onDestroy } from 'svelte'
  import { preview, clearPreview } from '@mohamed-0-turki/preview-file'

  export let source: File | string | null = null
  let container: HTMLDivElement

  $: if (source && container) {
    preview(source, container).catch(console.error)
  }

  onDestroy(() => {
    if (container) clearPreview(container)
  })
</script>

<div bind:this={container} class="preview-box" />
```

### Angular

```ts
import { Component, ElementRef, OnDestroy, Input, AfterViewInit } from '@angular/core'
import { preview, clearPreview } from '@mohamed-0-turki/preview-file'

@Component({
  selector: 'app-file-preview',
  template: `<div #box class="preview-box"></div>`,
  standalone: true,
})
export class FilePreviewComponent implements AfterViewInit, OnDestroy {
  @Input({ required: true }) source!: File | string
  private el!: HTMLDivElement

  constructor(private host: ElementRef) {}

  ngAfterViewInit() {
    this.el = this.host.nativeElement.querySelector('div')!
    preview(this.source, this.el).catch(console.error)
  }

  ngOnDestroy() {
    clearPreview(this.el)
  }
}
```

### Vanilla JS

```html
<input type="file" id="file" />
<div id="preview" style="width: 100%; height: 70vh"></div>

<script type="module">
  import { preview, clearPreview } from '@mohamed-0-turki/preview-file'

  const container = document.getElementById('preview')
  let current = null

  document.getElementById('file').addEventListener('change', (e) => {
    if (current) clearPreview(container)
    current = e.target.files[0]
    preview(current, container).catch(console.error)
  })
</script>
```

### Container requirements

- Give the container an explicit size (`width`/`height`). The library renders at 100 % of the container and its controls float inside it.
- The container's `position` is set to `relative` automatically if it is `static`.

---

## API reference

### Functions

| Signature | Description |
| --- | --- |
| `preview(source, container, options?)` | Resolve, detect, parse, render and mount controls for a file into `container`. Resolves when the preview is mounted (parsing is async). Throws on failure — the container also shows an error card. |
| `clearPreview(container)` | Tear down the active preview in `container` (controls, renderer state) and empty it. |
| `setPdfWorkerSrc(url)` | Point pdf.js at a worker module URL (self-hosted, bundler-emitted, or blob). Global; overrides the CDN default. See [PDF rendering & the worker](#pdf-rendering--the-worker). |
| `getPreviewer(mimeType)` | Return the first previewer that can handle `mimeType`, or `undefined`. |
| `registerPreviewer(PreviewerConstructor)` | Register a custom previewer (see [Extending](#extending)). |
| `clearPreviewers()` | Remove all registered previewers. |
| `getRenderer(resultType)` / `registerRenderer(RendererConstructor)` / `clearRenderers()` | The renderer registry, mirrored on the previewer one (see [Extending](#extending)). |
| `detectType(name, declaredType?)` | Resolve the effective MIME type from a declared type plus the file extension. |
| `parseCsv(text)` | Parse CSV text into rows (`string[][]`) at 1 MB a time. Exported for reuse. |

### Types

```ts
type SourceInput = File | Blob | string

interface ResolvedSource {
  readonly name: string
  readonly blob: Blob
}

interface PreviewResult {
  readonly type: string      // e.g. "application/pdf", "application/vnd.word",
                             // "application/vnd.spreadsheet", "text/csv", "text/plain", "image/png"
  readonly data: unknown
}

interface FileInput {
  readonly name: string
  readonly mimeType: string
  readonly data: Uint8Array<ArrayBuffer>
}

interface Previewer {
  readonly name: string
  readonly supportedMimeTypes: readonly string[]
  canPreview(mimeType: string): boolean
  preview(file: FileInput, options?: PreviewOptions): Promise<PreviewResult>
}

type PreviewerConstructor = new () => Previewer

interface Renderer {
  readonly name: string
  readonly supportedTypes: readonly string[]
  canRender(type: string): boolean
  render(
    container: HTMLElement,
    result: PreviewResult,
    options?: PreviewOptions
  ): PreviewAdapter | void | Promise<PreviewAdapter | void>
  destroy?(container: HTMLElement): void
}
```

The full capability contract returned by renderers is `PreviewAdapter` (see [`src/controls/types.ts`](src/controls/types.ts)): optional `canZoom`, `canDownload`, `canFullscreen`, `zoomPercent`, `zoomIn/Out/reset`, `download`, `fullscreen`, plus `lens`, `pages`, `fit`, `rotate`, `sheets`, `search`, `text`, `singlePage`, `thumbnails`.

---

## Extending

The full pipeline is extensible at both ends: **previewers** turn a file into a typed `PreviewResult`, **renderers** turn a result into DOM plus an optional `PreviewAdapter`.

### Custom previewer

```ts
import { registerPreviewer, preview } from '@mohamed-0-turki/preview-file'
import type { FileInput, PreviewOptions, PreviewResult } from '@mohamed-0-turki/preview-file'

class MarkdownPreviewer {
  readonly name = 'markdown'
  readonly supportedMimeTypes = ['text/markdown']

  canPreview(mimeType: string): boolean {
    return mimeType === 'text/markdown'
  }

  async preview(file: FileInput, options?: PreviewOptions): Promise<PreviewResult> {
    return { type: 'text/markdown', data: { text: new TextDecoder().decode(file.data) } }
  }
}

registerPreviewer(MarkdownPreviewer)

await preview(markdownFile, container)
```

### Custom renderer

```ts
import { registerRenderer } from '@mohamed-0-turki/preview-file'
import type { Renderer, PreviewResult } from '@mohamed-0-turki/preview-file'
import type { PreviewAdapter } from '@mohamed-0-turki/preview-file'

class MarkdownRenderer implements Renderer {
  readonly name = 'markdown'
  readonly supportedTypes = ['text/markdown']
  canRender(type: string): boolean {
    return type === 'text/markdown'
  }
  render(container: HTMLElement, result: PreviewResult): PreviewAdapter | void {
    const { text } = result.data as { text: string }
    const pre = document.createElement('pre')
    pre.textContent = text
    container.appendChild(pre)
    // Return an adapter to opt into toolbar actions, or omit it for a plain view.
  }
}

registerRenderer(MarkdownRenderer)
```

> Calls to `registerPreviewer` / `registerRenderer` are additive — the built-in previewers remain registered. Use `clearPreviewers()` / `clearRenderers()` when you need to fully replace the set.

---

## Performance notes

- **Lazy loading.** `pdfjs-dist`, `docx-preview` and `xlsx` are dynamic-imported only when their format is first previewed. The demo site's initial bundle never includes them.
- **Virtualization.** Excel sheets and large CSV files render as virtualized tables — only the visible rows are in the DOM; 80 000-row CSV files stay responsive.
- **Independent containers.** `preview()` is container-scoped; multiple previews on one page don't interfere.
- **Cancellation.** A generation guard makes stale async work inert: calling `clearPreview()` or a new `preview()` on the same container discards in-flight work from the previous call.

---

## Browser support

Modern evergreen browsers (Chrome, Edge, Firefox, Safari). The package uses `WeakMap`, `Uint8Array`, `AbortController`-free `fetch`, dynamic `import()` and fullscreen/pointer APIs.

---

## Development

```bash
npm install
npm run typecheck   # tsc --noEmit
npm run build       # emits dist/
```

Docs and interactive demo live in [`site/`](site) — a Next.js app that consumes the **built** package through its public API:

```bash
npm run build        # root first, so site/ installs a fresh dist/
cd site
npm install
npm run dev          # http://localhost:3000
```

---

## License

MIT — see [LICENSE](LICENSE).

## Icons

The toolbar and preview controls use icons from the [Lucide](https://lucide.dev)
icon set (lucide-static v0.460.0), which are shipped as local SVG assets in
`dist/icons/` and inlined into the controls at runtime so they inherit the
control styling via `currentColor`. Lucide is licensed under the ISC license —
see `dist/icons/NOTICE.md` (source: `src/icons/NOTICE.md`) for the full
attribution and license text.