# ADR-0005: One generic registry factory

- **Status:** Accepted
- **Date:** 2026-09-18

## Context

Previewers and renderers each needed a register/get/clear registry over a set of entries,
looked up by a key (MIME / result type) with alias support and a predicate fallback. Two
hand-rolled registries accumulated near-identical logic (dedup keys, alias maps,
predicate fallback, clear).

## Decision

- `src/utils/registry.ts` exports a single generic factory:

  ```ts
  createRegistry<T>({ getKeys(entry): readonly string[], canHandle?(entry, key): boolean })
    → { register(entry), get(key): T | undefined, clear() }
  ```

- `src/previewers/registry.ts` and `src/renderers/registry.ts` are thin wrappers that
  supply keys and predicates and expose the exact names the pipeline uses
  (`getPreviewer`/`registerPreviewer`/`clearPreviewers`, mirror for renderers).
- Lookup order is fixed and identical in both layers: exact key match, then the
  `canHandle` predicate over registered entries.

## Consequences

- Lookup behavior is identical across layers, so agents can reason about registries once.
- Both public registry function surfaces are preserved unchanged (the wrappers just got
  simpler).
- New registries (e.g. a capability registry) get it for free without new logic.