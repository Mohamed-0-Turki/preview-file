import { registerRenderer } from './registry.js'

import { CodeRenderer } from './code.js'
import { CsvRenderer } from './csv.js'
import { ExcelRenderer } from './excel.js'
import { ImageRenderer } from './image.js'
import { MarkdownRenderer } from './markdown.js'
import { PdfRenderer } from './pdf.js'
import { PresentationRenderer } from './presentation.js'
import { TextRenderer } from './text.js'
import { WordRenderer } from './word.js'

registerRenderer(CodeRenderer)
registerRenderer(MarkdownRenderer)
registerRenderer(TextRenderer)
registerRenderer(ImageRenderer)
registerRenderer(CsvRenderer)
registerRenderer(PdfRenderer)
registerRenderer(WordRenderer)
registerRenderer(ExcelRenderer)
registerRenderer(PresentationRenderer)

export { CodeRenderer } from './code.js'
export { CsvRenderer } from './csv.js'
export { ExcelRenderer } from './excel.js'
export { ImageRenderer } from './image.js'
export { MarkdownRenderer } from './markdown.js'
export { PdfRenderer } from './pdf.js'
export { PresentationRenderer } from './presentation.js'
export { TextRenderer } from './text.js'
export { WordRenderer } from './word.js'
export { getRenderer, registerRenderer, clearRenderers } from './registry.js'
export type { Renderer } from './types.js'