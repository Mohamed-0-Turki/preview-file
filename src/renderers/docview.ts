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
  viewport.style.background = DOCVIEW_BACKGROUND
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