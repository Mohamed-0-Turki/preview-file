# ADR-0002: Normalized result types and the previewer/renderer boundary

- **Status:** Accepted
- **Date:** 2026-09-18

## Context

Vendor MIME types are many and messy (Word alone is `application/msword`,
`application/vnd.openxmlformats-officedocument...`, etc.). Renderers originally had to
know every alias. Also unclear was the split of labor: who parses, who renders.

## Decision

- The pipeline has exactly two stages of responsibility:
  - **Previewers** (`src/previewers/`) repackage bytes into a *normalized*
    `PreviewResult { type, data }`. They are cheap and pure — no DOM, no heavy parsing,
    no rendering.
  - **Renderers** (`src/renderers/`) consume the result and own all DOM work, heavy
    parsing and rendering.
- Every previewer returns a stable **one-word result type**: `application/vnd.word`,
  `application/vnd.spreadsheet`, `text/csv`, `application/pdf`, `text/plain`, `image/*`.
  Renderers match on these types only.
- Vendor MIME details that matter are kept out of the result type and carried in
  `data` (e.g. Word's `format: docx|docm|dotx|dotm|doc|dot`).
- `src/previewers/result-types.ts` exports the `data` shape interfaces and `is*ResultData`
  type guards; renderers use the guards instead of re-checking shapes or MIME aliases.

## Consequences

- Adding a vendor alias = changing one previewer; adding a format = one previewer +
  one renderer. Nothing else knows vendor MIMEs.
- The `format` field is what lets the Word renderer choose a real paginated render vs.
  the legacy fallback card.
- New result shapes must add a guard in `result-types.ts` (keeps renderers' `data`
  narrowing uniform).