import { registerRenderer } from './registry.js'

import { CsvRenderer } from './csv.js'
import { ExcelRenderer } from './excel.js'
import { ImageRenderer } from './image.js'
import { PdfRenderer } from './pdf.js'
import { TextRenderer } from './text.js'
import { WordRenderer } from './word.js'

registerRenderer(TextRenderer)
registerRenderer(ImageRenderer)
registerRenderer(CsvRenderer)
registerRenderer(PdfRenderer)
registerRenderer(WordRenderer)
registerRenderer(ExcelRenderer)

export { CsvRenderer } from './csv.js'
export { ExcelRenderer } from './excel.js'
export { ImageRenderer } from './image.js'
export { PdfRenderer } from './pdf.js'
export { TextRenderer } from './text.js'
export { WordRenderer } from './word.js'
export { getRenderer, registerRenderer, clearRenderers } from './registry.js'
export type { Renderer } from './types.js'