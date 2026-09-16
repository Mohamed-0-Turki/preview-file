export interface LensAdapter {
  readonly magnification: number
  readonly lensSize: number
  readonly magnificationOptions: readonly number[]
  readonly lensSizeOptions: readonly number[]
  setMagnification(value: number): void
  setLensSize(value: number): void
}

export interface PageNavigation {
  readonly page: number
  readonly pageCount: number
  previousPage(): void
  nextPage(): void
  goToPage(page: number): void
  onPageChange?(listener: () => void): () => void
}

export interface FitControls {
  fitWidth(): void
  fitPage(): void
  /** Fit at true scale (100 %). */
  actualSize?(): void
}

/** Toggle between continuous scrolling and single-page viewing. */
export interface SinglePageMode {
  readonly enabled: boolean
  toggle(): void
}

/**
 * Sidebar-style auxiliary navigation (e.g. slide thumbnails in presentation
 * previewers). The renderer owns the sidebar element; this group only exposes
 * its visibility to the shared toolbar.
 */
export interface ThumbnailControls {
  readonly visible: boolean
  setVisible(visible: boolean): void
}

export interface RotateControls {
  /** Current rotation in degrees, normalized to [0, 360). Only present when
   *  the renderer can report it. */
  readonly rotation?: number
  rotateClockwise(): void
  rotateCounterclockwise(): void
  /** Rotate to an exact degree value. Accepts any real number (negative,
   *  fractional, > 360); the renderer normalizes it. Optional: renderers that
   *  only support ±90° steps may omit it. */
  setRotation?(degrees: number): void
  /** Return the preview subject to its original 0° orientation. Optional:
   *  renderers that can't reset (or have nothing to reset) may omit it. */
  resetRotation?(): void
}

export interface SheetNavigation {
  readonly sheets: readonly string[]
  readonly activeSheet: string
  switchSheet(name: string): void
}

export interface SearchControls {
  search(query: string): void
  readonly resultCount?: number
  clear?(): void
}

export interface TextControls {
  readonly canCopy: boolean
  copy(): void
  readonly canWordWrap: boolean
  readonly wordWrap: boolean
  toggleWordWrap(): void
}

export interface FullscreenControls {
  request(): void | Promise<void>
}

/**
 * The contract a renderer returns to describe the controls it supports.
 * Every group is optional; the previewer declares only the capabilities it
 * implements, and preview-file renders exactly those controls.
 */
export interface PreviewAdapter {
  readonly canZoom?: boolean
  readonly canDownload?: boolean
  readonly canFullscreen?: boolean
  /** Current zoom level as a percentage (100 = actual size). Optional: when
   *  present the toolbar shows a live "current zoom" indicator. */
  readonly zoomPercent?: number
  zoomIn?(): void
  zoomOut?(): void
  resetZoom?(): void
  download?(): void
  readonly lens?: LensAdapter
  readonly pages?: PageNavigation
  readonly fit?: FitControls
  readonly rotate?: RotateControls
  readonly sheets?: SheetNavigation
  readonly search?: SearchControls
  readonly text?: TextControls
  readonly singlePage?: SinglePageMode
  readonly thumbnails?: ThumbnailControls
  readonly fullscreen?: FullscreenControls
}

export interface PreviewActions {
  readonly canZoom: boolean
  readonly canDownload: boolean
  readonly canFullscreen: boolean
  /** Live current zoom percentage (100 = actual size), if the renderer reports it. */
  readonly zoomPercent?: number
  zoomIn(): void
  zoomOut(): void
  resetZoom(): void
  download(): void
  fullscreen(): void | Promise<void>
  readonly lens?: LensAdapter
  readonly pages?: PageNavigation
  readonly fit?: FitControls
  readonly rotate?: RotateControls
  readonly sheets?: SheetNavigation
  readonly search?: SearchControls
  readonly text?: TextControls
  readonly singlePage?: SinglePageMode
  readonly thumbnails?: ThumbnailControls
}