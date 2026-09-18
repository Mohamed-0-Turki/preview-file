# ADR-0011: Framework-agnostic single package

- **Status:** Accepted
- **Date:** 2026-09-18

## Context

Library consumers use different frameworks. Splitting into framework-specific wrappers
(e.g. `@preview-file/react`, `@preview-file/vue`) multiplies maintenance and makes
the package look heavier than it is. Meanwhile, all frameworks need the same one
function call: `preview(source, container, options)`.

## Decision

- The package is one unit (`@mohamed-0-turki/preview-file`). No monorepo, no
  framework-specific entry points, no React/Vue/Svelte/Angular peer dependencies.
- React, Vue, Svelte and Angular all call the same `preview()` / `clearPreview()`
  in a side-effect hook (`useEffect`, `onMounted`/`onBeforeUnmount`, `ngOnDestroy`, etc.)
  — the package's API is inherently framework-agnostic because it only touches DOM
  inside the provided container.
- Consuming examples for each framework live in the root `README.md`, not in source.

## Consequences

- `package.json` has exactly one consumer-facing `exports` field and one `dist/index.js`.
- A new framework example means a README section, not a new package.
- `preview()` throws outside a browser (`document` check) which is sufficient for SSR
  safety — consuming frameworks handle SSR at their own layer (React `useEffect`,
  `next/dynamic` with `ssr: false`, etc.).