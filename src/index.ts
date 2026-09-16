import './previewers/index.js'

export { preview, clearPreview } from './preview.js'
export { setPdfWorkerSrc } from './pdf-worker.js'
export { getPreviewer, registerPreviewer, clearPreviewers } from './registry.js'
export { getRenderer, registerRenderer, clearRenderers } from './renderers/index.js'
export { detectType } from './utils/detect.js'
export { parseCsv } from './renderers/csv.js'
export type { Previewer } from './previewer.js'
export type { FileInput, MagnifierOptions, PreviewOptions, PreviewResult, PreviewerConstructor } from './types.js'
export type { Renderer } from './renderers/types.js'
export type {
  FitControls,
  FullscreenControls,
  LensAdapter,
  PageNavigation,
  PreviewActions,
  PreviewAdapter,
  RotateControls,
  SearchControls,
  SheetNavigation,
  SinglePageMode,
  TextControls,
  ThumbnailControls,
} from './controls/index.js'
export type { ResolvedSource, SourceInput } from './sources/index.js'