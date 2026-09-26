# `src/ooxml/` — OPC and OOXML reading, no DOM

This layer answers one question: *what does this file actually say?* It opens the
package, resolves relationships, and returns a **resolved model** in which the
inheritance the format implies has already been applied. It never touches the DOM, so
it can be exercised in Node, and it knows nothing about previews, renderers or the
toolbar.

Consumers are `src/renderers/presentation/index.ts` (which opens a package) and
`src/renderers/ooxml/` (which paints the model). Nothing in `src/ooxml/` imports either.

## Modules

| Module | Content |
| --- | --- |
| `package.ts` | `OfficePackage`: the OPC container. Unzips, resolves relationships to absolute part names, and exposes typed XML/text/blob access. Everything else in the layer goes through it, so relationship resolution is written once. |
| `xml.ts` | Namespace-agnostic DOM helpers. Every lookup is by local name, because producers disagree about prefixes (`p:sp` vs `p14:sp`) and a prefix-sensitive parser silently drops content. |
| `units.ts` | EMU → points/pixels, and the universal measure (`"2in"`, `"50%"`) reader used by `marL`/`indent`/line widths. |
| `color.ts` | `srgbClr`, `schemeClr`, `sysClr`, `prstClr` and the transform set (`tint`, `shade`, `lumMod`/`lumOff`, `alpha`, …). |
| `theme.ts` | `theme1.xml`: the colour scheme, font scheme and format scheme, plus `resolverFor(colorMap)` so a slide's `clrMapOvr` is applied where it belongs. |
| `geom.ts` | Vectors, rectangles, matrices. |
| `geometry.ts` | Preset geometry in the unit box, custom geometry, path scaling. `isUnitBoxPath()` is why the painter can skip a redundant fill. |
| `drawingml.ts` | The shared vocabulary: `ShapeTransform`, `ShapeFill`, `ShapeLine`, `ShapeGeometry`, text bodies, effects. |
| `pptx/parse.ts` | The presentation parser: slide order from `p:sldIdLst`, master → layout → slide placeholder and list-style cascade, backgrounds, shapes, connectors, pictures, tables, frames. |
| `pptx/chart.ts` | Chart parts: cached series and categories, axis ids and positions, plot-area anchoring. Reads the **cache**, because that is the only copy of the numbers that is guaranteed present. |
| `pptx/model.ts` | The resolved model types. If a type is here, the parser resolved it; nothing downstream re-reads XML. |
| `index.ts` | The barrel. Import from here, not from a submodule. |

## Rules for changing this layer

- **Resolve, don't defer.** A renderer that has to re-derive inheritance is a renderer
  that will get it wrong for one producer. Placeholder geometry, `marL`/`indent` and
  default character properties are resolved here, once.
- **Degrade, don't throw.** An unrecognised preset, a missing relationship or a part that
  will not parse resolves to something drawable. A deck that renders as blank is
  unrecoverable; a deck that renders one shape wrong is not.
- **Namespaces by local name.** See `xml.ts`.
- **Authored order is z-order.** `p:spTree` children paint in document order; reversing
  them gets overlapping translucent shapes visibly wrong.
- **Text is verbatim.** `a:t` content is not trimmed: a trailing space is how two runs of
  one sentence are separated.
