import { registerRenderer } from './registry.js'

import { ArchiveRenderer } from './archive.js'
import { CodeRenderer } from './code.js'
import { CsvRenderer } from './csv.js'
import { ExcelRenderer } from './excel.js'
import { ImageRenderer } from './image.js'
import { MarkdownRenderer } from './markdown.js'
import { PdfRenderer } from './pdf.js'
import { PresentationRenderer } from './presentation/index.js'
import { TextRenderer } from './text.js'
import { WordRenderer } from './word.js'

registerRenderer(ArchiveRenderer)
registerRenderer(CodeRenderer)
registerRenderer(MarkdownRenderer)
registerRenderer(TextRenderer)
registerRenderer(ImageRenderer)
registerRenderer(CsvRenderer)
registerRenderer(PdfRenderer)
registerRenderer(WordRenderer)
registerRenderer(ExcelRenderer)
registerRenderer(PresentationRenderer)

export { ArchiveRenderer } from './archive.js'
export { CodeRenderer } from './code.js'
export { CsvRenderer } from './csv.js'
export { ExcelRenderer } from './excel.js'
export { ImageRenderer } from './image.js'
export { MarkdownRenderer } from './markdown.js'
export { PdfRenderer } from './pdf.js'
export { PresentationRenderer } from './presentation/index.js'
export { TextRenderer } from './text.js'
export { WordRenderer } from './word.js'
export { getRenderer, registerRenderer, clearRenderers } from './registry.js'
export type { RenderContext, Renderer } from './types.js'