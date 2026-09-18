# `src/sources/` — source normalization

The smallest layer: it turns a `SourceInput` into a `ResolvedSource { name, blob }`
so the rest of the pipeline only ever deals with a name and its bytes.

```ts
type SourceInput = File | Blob | string   // string = URL, fetched at this layer
```

| Module | Content |
| --- | --- |
| `types.ts` | `SourceInput`, `ResolvedSource`. |
| `source.ts` | `createSource(input)` — `File` keeps its name; `Blob` defaults to `"file"`; a string is fetched (`arrayBuffer`), its name is derived from the URL path, and MIME falls back to the response `content-type` / extension inference. |
| `index.ts` | Barrel: `createSource` + types. |

Keep this layer free of MIME tables and preview logic — type detection happens later
(`src/utils/detect.ts`) and format handling even later (previewers/renderers).