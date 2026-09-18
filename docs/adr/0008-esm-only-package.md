# ADR-0008: ESM-only package with strict type hygiene

- **Status:** Accepted
- **Date:** 2026-09-18

## Context

The package ships to every bundler and to Node. Earlier there was no tooling to stop
type/import drift: mixed relative import specifiers, missing `import type`, and
Bundler-specific module declarations creeping in.

## Decision

- The package is **ESM-only** (`"type": "module"`, NodeNext module resolution).
- All relative imports use explicit `*.js` specifiers (source of truth is TypeScript,
  emit is ESM).
- `tsconfig.json` enables `strict`, `noUnusedLocals`, `noUnusedParameters`, and
  `verbatimModuleSyntax`. Type-only imports/exports must use `import type`/`export type`.
- No bundler-specific module imports (`?raw`, `?url`, `?worker`, CSS imports, etc.) in
  `src/`; the package resolves identically under any bundler and vanilla ESM.

## Consequences

- `tsc --noEmit` catches import-style mistakes (wrong specifier, unused locals, runtime
  import of a type) as hard errors.
- Code reviews/agents get machine-enforced consistency instead of convention-only rules.
- `.js` specifiers mean refactors involving file moves must update imports — `tsc`
  reports any miss ("old paths break loudly", see AI_GUIDE §8).