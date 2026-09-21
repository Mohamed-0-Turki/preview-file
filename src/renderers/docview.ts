import type { PageNavigation, PreviewAdapter } from '../controls/types.js'

export const DOCVIEW_BACKGROUND = '#525659'
export const DOCVIEW_PADDING = 16
export const DOCVIEW_GAP = 24

/**
 * A scrolling, centered document stage. Pages are laid out inside
 * {@link DocStage.content} at scale 1 and are zoomed with a CSS transform, so
 * page geometry (A4-style boxes, gaps, shadows) stays faithful to the real
 * document while the stage keeps the pages centered in the preview area.
 */
export interface DocStage {
  readonly viewport: HTMLDivElement
  readonly content: HTMLDivElement
  layout(
    scale: number,
    baseWidth: number,
    baseHeight: number,
    stageHeight?: number,
    translateY?: number
  ): void
  destroy(): void
}

export function createDocStage(container: HTMLElement): DocStage {
  const viewport = document.createElement('div')
  viewport.style.position = 'absolute'
  viewport.style.inset = '0'
  viewport.style.overflow = 'auto'
  viewport.style.overflowX = 'auto'
  viewport.style.overflowY = 'auto'
  viewport.style.background = 'var(--pf-doc-bg, #525659)'
  viewport.style.overscrollBehavior = 'contain'

  const outer = document.createElement('div')
  outer.style.minWidth = '100%'
  outer.style.minHeight = '100%'
  outer.style.display = 'flex'
  outer.style.justifyContent = 'center'
  outer.style.alignItems = 'flex-start'
  outer.style.padding = `${DOCVIEW_PADDING}px`
  outer.style.boxSizing = 'border-box'
  viewport.appendChild(outer)

  const stage = document.createElement('div')
  stage.style.position = 'relative'
  stage.style.flex = '0 0 auto'
  stage.style.overflow = 'hidden'
  stage.style.willChange = 'transform'
  outer.appendChild(stage)

  const content = document.createElement('div')
  content.style.position = 'absolute'
  content.style.left = '0'
  content.style.top = '0'
  content.style.transformOrigin = 'top left'
  stage.appendChild(content)

  container.appendChild(viewport)

  return {
    viewport,
    content,
    layout(scale, baseWidth, baseHeight, stageHeight = Math.ceil(baseHeight * scale), translateY = 0) {
      content.style.width = `${Math.max(1, Math.ceil(baseWidth))}px`
      content.style.height = `${Math.max(1, Math.ceil(baseHeight))}px`
      stage.style.width = `${Math.max(1, Math.ceil(baseWidth * scale))}px`
      stage.style.height = `${Math.max(1, stageHeight)}px`
      if (translateY === 0) {
        content.style.transform = `scale(${scale})`
      } else {
        content.style.transform = `translateY(${translateY}px) scale(${scale})`
      }
    },
    destroy: () => viewport.remove(),
  }
}

export interface PageMetrics {
  /** Top edge of every page measured at scale 1 (CSS px). */
  readonly offsets: readonly number[]
  /** Height of every page at scale 1 (CSS px). */
  readonly heights: readonly number[]
  readonly totalHeight: number
  readonly indexOfMaxHeight: number
}

export function computePageMetrics(
  positions: readonly { top: number; height: number }[],
  gap: number
): PageMetrics {
  const offsets: number[] = []
  const heights: number[] = []
  let indexOfMaxHeight = 0
  for (let i = 0; i < positions.length; i += 1) {
    offsets.push(Math.max(0, positions[i].top))
    const height = Math.max(1, positions[i].height)
    heights.push(height)
    if (height > (heights[indexOfMaxHeight] ?? 0)) indexOfMaxHeight = i
  }
  const count = positions.length
  const totalHeight =
    count > 0 ? Math.max(1, (offsets[count - 1] ?? 0) + (heights[count - 1] ?? 0) + gap) : 1
  return { offsets, heights, totalHeight, indexOfMaxHeight }
}

/** Page (0-based) near the vertical center of the scrolling viewport. */
export function pageIndexAtCenter(
  metrics: PageMetrics,
  scrollTop: number,
  viewportHeight: number,
  scale: number,
  topPadding: number
): number {
  const center = scrollTop + viewportHeight / 2
  let index = 0
  for (let i = 0; i < metrics.offsets.length; i += 1) {
    const topPx = topPadding + (metrics.offsets[i] ?? 0) * scale
    const bottomPx = topPx + (metrics.heights[i] ?? 0) * scale
    if (center >= topPx) index = i
    if (center < bottomPx) break
  }
  return index
}

/** Scroll offset (CSS px) that brings the top of the given page into view. */
export function pageTopFromIndex(
  metrics: PageMetrics,
  index: number,
  scale: number,
  topPadding: number
): number {
  return topPadding + (metrics.offsets[index] ?? 0) * scale
}

export interface PagedDocViewState {
  readonly scale: number
  readonly metrics: PageMetrics
}

/**
 * The format-specific surface a renderer exposes to the shared paged-document
 * controller. Everything scroll/zoom/fit/page related is handled by
 * `createPagedDocController`; the host only provides geometry, limits and
 * hooks that connect the controller back to the renderer's own content.
 */
export interface PagedDocHost {
  readonly stage: DocStage
  readonly baseWidth: number
  readonly pageCount: number
  readonly minScale: number
  readonly maxScale: number
  readonly zoomStep: number
  readonly metrics: PageMetrics
  /** Initial fit mode applied on creation (defaults to `width`). */
  readonly initialFit?: 'width' | 'page'
  /** Called once per scroll animation frame (PDFs re-render visible pages). */
  onScrollFrame?(state: PagedDocViewState): void
  /** Called after every layout pass (PDFs re-render visible pages). */
  onLayout?(state: PagedDocViewState): void
  /** Called during teardown, after the controller removed its own listeners. */
  onDestroy?(): void
}

/** The capability slice a paged-document renderer always implements. */
export type PagedDocAdapter = Pick<
  PreviewAdapter,
  'canZoom' | 'zoomPercent' | 'zoomIn' | 'zoomOut' | 'resetZoom' | 'pages' | 'fit' | 'singlePage'
>

export interface PagedDocController {
  readonly scale: number
  layoutAll(restoreDocY?: number): void
  applyFit(mode: 'width' | 'page'): void
  zoomBy(factor: number): void
  jumpToPage(pageNumber: number): void
  toggleSinglePage(): void
  currentPageIndex(): number
  notifyPageChange(): void
  destroy(): void
  readonly adapter: PagedDocAdapter
}

/**
 * The zoom / fit / navigation state machine shared by every paged-document
 * renderer (PDF and Word). The PDF and Word renderers used to duplicate ~150
 * lines of this logic; this controller owns the layout pass, scroll
 * notifications, page navigation adapter and the corresponding
 * `PreviewAdapter` slice. Renderers remain responsible only for producing the
 * page geometry (via {@link PagedDocHost.metrics}) and rendering page content
 * (via `onLayout` / `onScrollFrame`).
 */
export function createPagedDocController(host: PagedDocHost): PagedDocController {
  const { stage } = host

  let scale = 1
  let fitMode: 'width' | 'page' | 'none' = 'none'
  let singleMode = false
  let activeIndex = 0
  let pageChangeListeners: (() => void)[] = []
  let scrollFrame = 0

  const state = (): PagedDocViewState => ({ scale, metrics: host.metrics })

  const availableWidth = (): number => Math.max(1, stage.viewport.clientWidth - DOCVIEW_PADDING * 2)
  const availableHeight = (): number => Math.max(1, stage.viewport.clientHeight - DOCVIEW_PADDING * 2)

  const notifyPageChange = (): void => {
    for (const listener of pageChangeListeners) listener()
  }

  const layoutAll = (restoreDocY?: number): void => {
    const metrics = host.metrics
    const scaleHeight = singleMode ? metrics.heights[activeIndex] * scale : metrics.totalHeight * scale
    const translateY = singleMode ? -(metrics.offsets[activeIndex] ?? 0) * scale : 0
    stage.layout(scale, host.baseWidth, metrics.totalHeight, Math.ceil(scaleHeight), translateY)
    if (singleMode) {
      stage.viewport.style.overflow = 'hidden'
      stage.viewport.scrollTop = 0
    } else {
      stage.viewport.style.overflow = 'auto'
      if (restoreDocY !== undefined) {
        stage.viewport.scrollTop = Math.max(0, DOCVIEW_PADDING + restoreDocY * scale)
      }
    }
    host.onLayout?.(state())
  }

  const onScroll = (): void => {
    if (scrollFrame) return
    scrollFrame = window.requestAnimationFrame(() => {
      scrollFrame = 0
      host.onScrollFrame?.(state())
      notifyPageChange()
    })
  }
  stage.viewport.addEventListener('scroll', onScroll, { passive: true })

  const currentPageIndex = (): number => {
    if (host.pageCount === 0) return 0
    if (singleMode) return activeIndex
    return Math.min(
      host.pageCount - 1,
      pageIndexAtCenter(host.metrics, stage.viewport.scrollTop, stage.viewport.clientHeight, scale, DOCVIEW_PADDING)
    )
  }

  const jumpToPage = (pageNumber: number): void => {
    const target = Math.max(0, Math.min(host.pageCount - 1, pageNumber))
    if (singleMode) {
      activeIndex = target
      layoutAll()
    } else {
      stage.viewport.scrollTop = pageTopFromIndex(host.metrics, target, scale, DOCVIEW_PADDING)
      host.onLayout?.(state())
    }
    notifyPageChange()
  }

  const applyFit = (mode: 'width' | 'page'): void => {
    fitMode = mode
    if (stage.viewport.clientWidth <= 0) return
    const metrics = host.metrics
    const width = availableWidth()
    const height = availableHeight()
    if (mode === 'width') {
      scale = Math.min(host.maxScale, Math.max(host.minScale, width / host.baseWidth))
    } else {
      const fitHeight = singleMode ? metrics.heights[activeIndex] : metrics.heights[metrics.indexOfMaxHeight]
      scale = Math.min(host.maxScale, Math.max(host.minScale, Math.min(width / host.baseWidth, height / fitHeight)))
    }
    layoutAll()
    notifyPageChange()
  }

  const zoomBy = (factor: number): void => {
    const anchor = (stage.viewport.scrollTop - DOCVIEW_PADDING) / scale
    fitMode = 'none'
    scale = Math.min(host.maxScale, Math.max(host.minScale, scale * factor))
    layoutAll(anchor)
    notifyPageChange()
  }

  const toggleSinglePage = (): void => {
    if (!singleMode) {
      activeIndex = currentPageIndex()
      singleMode = true
      layoutAll()
    } else {
      const anchor = activeIndex
      singleMode = false
      layoutAll()
      stage.viewport.scrollTop = pageTopFromIndex(host.metrics, anchor, scale, DOCVIEW_PADDING)
    }
    notifyPageChange()
  }

  const navigation: PageNavigation = {
    get page() {
      return currentPageIndex() + 1
    },
    get pageCount() {
      return host.pageCount
    },
    previousPage: () => jumpToPage(currentPageIndex() - 1),
    nextPage: () => jumpToPage(currentPageIndex() + 1),
    goToPage: (pageNumber) => jumpToPage(pageNumber - 1),
    onPageChange: (listener) => {
      pageChangeListeners.push(listener)
      return () => {
        pageChangeListeners = pageChangeListeners.filter((item) => item !== listener)
      }
    },
  }

  const resizeObserver =
    typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => {
          if (fitMode !== 'none') {
            const mode = fitMode
            fitMode = 'none'
            applyFit(mode)
          } else {
            layoutAll()
          }
          notifyPageChange()
        })
      : null
  resizeObserver?.observe(stage.viewport)

  const adapter: PagedDocAdapter = {
    canZoom: true,
    get zoomPercent() {
      return Math.round(scale * 100)
    },
    zoomIn: () => zoomBy(host.zoomStep),
    zoomOut: () => zoomBy(1 / host.zoomStep),
    resetZoom: () => applyFit('width'),
    pages: navigation,
    fit: {
      fitWidth: () => applyFit('width'),
      fitPage: () => applyFit('page'),
      actualSize: () => {
        const anchor = (stage.viewport.scrollTop - DOCVIEW_PADDING) / scale
        fitMode = 'none'
        scale = 1
        layoutAll(anchor)
        notifyPageChange()
      },
    },
    singlePage: {
      get enabled() {
        return singleMode
      },
      toggle: toggleSinglePage,
    },
  }

  /* Documents start fitted to the host's requested initial mode (width for
     A4-style formats, page for slide decks where the whole slide must be
     visible). */
  applyFit(host.initialFit ?? 'width')

  return {
    get scale() {
      return scale
    },
    layoutAll,
    applyFit,
    zoomBy,
    jumpToPage,
    toggleSinglePage,
    currentPageIndex,
    notifyPageChange,
    get adapter() {
      return adapter
    },
    destroy: () => {
      resizeObserver?.disconnect()
      stage.viewport.removeEventListener('scroll', onScroll)
      if (scrollFrame) window.cancelAnimationFrame(scrollFrame)
      host.onDestroy?.()
    },
  }
}