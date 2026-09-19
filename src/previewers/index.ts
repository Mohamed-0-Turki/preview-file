import { registerPreviewer } from './registry.js'

import { ArchivePreviewer } from './archive.js'
import { CodePreviewer } from './code.js'
import { CsvPreviewer } from './csv.js'
import { ExcelPreviewer } from './excel.js'
import { ImagePreviewer } from './image.js'
import { MarkdownPreviewer } from './markdown.js'
import { PdfPreviewer } from './pdf.js'
import { PresentationPreviewer } from './presentation.js'
import { TextPreviewer } from './text.js'
import { WordPreviewer } from './word.js'

registerPreviewer(CodePreviewer)
registerPreviewer(MarkdownPreviewer)
registerPreviewer(TextPreviewer)
registerPreviewer(ImagePreviewer)
registerPreviewer(CsvPreviewer)
registerPreviewer(PdfPreviewer)
registerPreviewer(WordPreviewer)
registerPreviewer(ExcelPreviewer)
registerPreviewer(PresentationPreviewer)
registerPreviewer(ArchivePreviewer)

export { ArchivePreviewer } from './archive.js'
export { CodePreviewer } from './code.js'
export { CsvPreviewer } from './csv.js'
export { ExcelPreviewer } from './excel.js'
export { ImagePreviewer } from './image.js'
export { MarkdownPreviewer } from './markdown.js'
export { PdfPreviewer } from './pdf.js'
export { PresentationPreviewer } from './presentation.js'
export { TextPreviewer } from './text.js'
export { WordPreviewer } from './word.js'
export { getPreviewer, registerPreviewer, clearPreviewers } from './registry.js'
export type { Previewer, PreviewerConstructor } from './types.js'