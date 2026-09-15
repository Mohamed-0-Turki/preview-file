import './previewers/index.js'

export { getPreviewer, registerPreviewer, clearPreviewers } from './registry.js'
export type { Previewer } from './previewer.js'
export type { FileInput, PreviewOptions, PreviewResult, PreviewerConstructor } from './types.js'