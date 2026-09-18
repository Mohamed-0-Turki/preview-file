import { registerPreviewer } from './registry.js'

import { CsvPreviewer } from './csv.js'
import { ExcelPreviewer } from './excel.js'
import { ImagePreviewer } from './image.js'
import { PdfPreviewer } from './pdf.js'
import { TextPreviewer } from './text.js'
import { WordPreviewer } from './word.js'

registerPreviewer(TextPreviewer)
registerPreviewer(ImagePreviewer)
registerPreviewer(CsvPreviewer)
registerPreviewer(PdfPreviewer)
registerPreviewer(WordPreviewer)
registerPreviewer(ExcelPreviewer)

export { CsvPreviewer } from './csv.js'
export { ExcelPreviewer } from './excel.js'
export { ImagePreviewer } from './image.js'
export { PdfPreviewer } from './pdf.js'
export { TextPreviewer } from './text.js'
export { WordPreviewer } from './word.js'
export { getPreviewer, registerPreviewer, clearPreviewers } from './registry.js'
export type { Previewer, PreviewerConstructor } from './types.js'