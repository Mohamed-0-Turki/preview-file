# ADR-0013: Monaco Editor for source-code previews

- **Status:** Accepted
- **Date:** 2026-09-19

## Context

The text previewer handled every `text/*` file with a plain `<pre>` — no syntax
highlighting, folding, minimap-alternative, or large-file performance. Source code
(`.js`, `.ts`, `.py`, …) deserved a real editor experience, but the package is
ESM-only and bundler-agnostic (ADR-0008), so any code engine must load without
configuration in Vite, webpack, Rollup, Next.js and vanilla `<script type="module">`.

Monaco Editor was the target engine. Two loading strategies were evaluated:

- **Vendored ESM (`import('monaco-editor/esm/...')`).** Statically analyzing the
  installed 0.56.0 package shows the ESM graph pulls in 57 CSS imports (editor.api)
  / 105 CSS imports (editor.main) across a 3600-edge dependency graph. A bare
  dynamic `import()` of a CDN URL therefore cannot work in a browser, and any
  bundler-based path breaks the cross-bundler promise of ADR-0008.
- **AMD build from a URL.** Monaco still ships `min/vs/loader.js` + an
  `editor.main.js` bootstrap (7 KB) that loads the editor from AMD chunks. Its
  `editor.main.js` self-configures `MonacoEnvironment.getWorker` and injects its own
  CSS `<link>`; the worker URLs and the CSS resolve against `require.config.baseUrl`,
  so pointing `baseUrl` (and `paths.vs`) at the CDN folder makes the whole thing work
  cross-origin. Verified end-to-end in a real (headless) browser: 91 languages from
  `monaco.languages.getLanguages()`, tokenized rendering, workers load, and when the
  worker cannot load Monaco falls back to main-thread tokenization and still renders.

## Decision

- Source code previews are rendered by **Monaco Editor**, loaded lazily from a
  version-pinned AMD build on a public CDN — only the first time a code file is
  actually previewed. Nothing is fetched or parsed at module import time.
- `setMonacoBaseUrl(url)` + `options.monaco.baseUrl` let consumers self-host
  (`monaco-editor/min/` in their own assets, CSP, offline), mirroring
  [ADR-0009](0009-pdf-worker-strategy.md)'s worker strategy.
- `monaco-editor` is a **devDependency only**: it is never statically imported.
  The published package ships no bundler-metadata and adds no runtime dependency.
  Runtime code uses a small self-contained type shim
  (`src/renderers/monaco-types.ts`) describing exactly the API surface consumed,
  pinned against the CDN version in `src/monaco.ts`.
- A new `CodePreviewer` (registered **before** `TextPreviewer`, whose predicate is
  `text/*`) produces a new result type `text/code` with `{ text, name, mimeType }`.
  A new `CodeRenderer` resolves the language via Monaco's own metadata
  (`monaco.languages.getLanguages()`), in order: exact filename → extension →
  declared MIME → `firstLine` shebang → `plaintext`. No language list is maintained.
- `detectType` treats `application/octet-stream`, `text/plain` and `video/mp2t`
  (Chrome reports `.ts` files as `video/mp2t`) as generic, preferring the file
  extension (and a small filename table for `Dockerfile`, `Makefile`, `tsconfig.json`,
  `.gitignore`, …) over the declared type. `.txt`/`.log` still resolve to
  `text/plain` and stay on the text renderer.
- The editor is created read-only with `automaticLayout: true`; zoom maps to
  `fontSize`, and the text-controls group (copy, word wrap) is reused so the toolbar
  needs no new capability. Teardown disposes the editor instance via
  `createRenderState` and `Renderer.destroy()`.

## Consequences

- Code files that previously rendered (or errored) as plain text now get
  syntax-highlighted, folding, read-only Monaco views with zoom and word-wrap.
- `.md`/`.markdown` now preview instead of erroring on generic declared types.
- The AMD/CDN path is a runtime choice: consumers that want full control self-host
  the AMD build and point `setMonacoBaseUrl` at it (same-origin workers then load
  without any CORS consideration). Cross-origin CDN workers work via the `baseUrl`
  trick; if they cannot load, Monaco degrades to main-thread tokenization.
- Known limitations, watch items:
  - The AMD build is deprecated upstream ("still shipped for a while, no support").
    The pinning in `src/monaco.ts` makes adoption-bearing upgrades deliberate; if the
    AMD build disappears, the CDN URL can be pinned permanently or replaced with a
    vendored self-host.
  - Activating the loaded scripts relies on the page-global AMD `require`. A page
    that already uses `require.config` for other purposes could see its `baseUrl`
    overridden the first time a code file is previewed. This is a documented
    trade-off of the zero-config CDN default; self-hosting avoids it.
  - `.ts` is unambiguously treated as TypeScript (never as a video transport
    stream), which is the overwhelmingly common case.