import type { PreviewAdapter } from '../controls/types.js'
import type { PreviewOptions, PreviewResult } from '../types.js'
import { isRenderableWordFormat, isWordResultData } from '../previewers/result-types.js'
import type { Renderer } from './types.js'
import {
  computePageMetrics,
  createDocStage,
  DOCVIEW_PADDING,
  pageIndexAtCenter,
  pageTopFromIndex,
  type PageMetrics,
} from './docview.js'

interface WordAttachment {
  destroy(): void
}

const WRAPPER_CLASS = 'py-docx'
const SECTION_CLASS = `${WRAPPER_CLASS}-wrapper`
const MIN_SCALE = 0.25
const MAX_SCALE = 3
const ZOOM_STEP = 1.25

export class WordRenderer implements Renderer {
  readonly name = 'word'
  readonly supportedTypes = ['application/vnd.word']

  private readonly attachmentsByContainer = new WeakMap<HTMLElement, WordAttachment>()

  canRender(type: string): boolean {
    return type === 'application/vnd.word'
  }

  async render(container: HTMLElement, result: PreviewResult, _options?: PreviewOptions): Promise<PreviewAdapter> {
    if (!isWordResultData(result.data)) {
      throw new Error('The preview result has no Word data.')
    }

    if (!isRenderableWordFormat(result.data.format)) {
      return this.renderLegacyFallback(container, result.data.format)
    }

    let docxPreview: typeof import('docx-preview')
    try {
      docxPreview = await import('docx-preview')
    } catch (error) {
      throw new Error(`The Word document parser could not be loaded. ${(error as Error).message}`)
    }

    const stage = createDocStage(container)

    try {
      await docxPreview.renderAsync(result.data.blob, stage.content, stage.content, {
        className: WRAPPER_CLASS,
        inWrapper: true,
        ignoreWidth: false,
        ignoreHeight: false,
        breakPages: true,
      })
    } catch (error) {
      stage.destroy()
      throw new Error(`The Word document could not be rendered. ${(error as Error).message}`)
    }

    const wrapper = stage.content.querySelector(`.${SECTION_CLASS}`) as HTMLElement | null
    const sections = wrapper
      ? Array.from(wrapper.querySelectorAll<HTMLElement>(`section.${WRAPPER_CLASS}`))
      : []
    if (!wrapper || sections.length === 0) {
      stage.destroy()
      throw new Error('The Word document produced no renderable pages.')
    }

    // docx-preview clips page overflow by default; let content flow so nothing is hidden.
    for (const section of sections) section.style.overflow = 'visible'

    const contentRect = stage.content.getBoundingClientRect()
    const positions: { top: number; height: number }[] = []
    for (const section of sections) {
      const rect = section.getBoundingClientRect()
      positions.push({
        top: Math.max(0, rect.top - contentRect.top),
        height: Math.max(1, section.clientHeight),
      })
    }

    const baseWidth = Math.max(1, wrapper.clientWidth)
    let metrics: PageMetrics = computePageMetrics(positions, 24)
    const totalHeight = Math.max(metrics.totalHeight, Math.max(1, wrapper.getBoundingClientRect().height))
    metrics = { ...metrics, totalHeight }

    let scale = 1
    let fitMode: 'width' | 'page' | 'none' = 'none'
    let singleMode = false
    let activeIndex = 0
    let pageChangeListeners: (() => void)[] = []

    const availableWidth = (): number => Math.max(1, stage.viewport.clientWidth - DOCVIEW_PADDING * 2)
    const availableHeight = (): number => Math.max(1, stage.viewport.clientHeight - DOCVIEW_PADDING * 2)

    const layoutAll = (restoreDocY?: number): void => {
      const scaleHeight = singleMode ? metrics.heights[activeIndex] * scale : metrics.totalHeight * scale
      const translateY = singleMode ? -(metrics.offsets[activeIndex] ?? 0) * scale : 0
      stage.layout(scale, baseWidth, metrics.totalHeight, Math.ceil(scaleHeight), translateY)
      if (singleMode) {
        stage.viewport.style.overflow = 'hidden'
        stage.viewport.scrollTop = 0
      } else {
        stage.viewport.style.overflow = 'auto'
        if (restoreDocY !== undefined) {
          stage.viewport.scrollTop = Math.max(0, DOCVIEW_PADDING + restoreDocY * scale)
        }
      }
    }

    const notifyPageChange = (): void => {
      for (const listener of pageChangeListeners) listener()
    }

    let scrollFrame = 0
    const onScroll = (): void => {
      if (scrollFrame) return
      scrollFrame = window.requestAnimationFrame(() => {
        scrollFrame = 0
        notifyPageChange()
      })
    }
    stage.viewport.addEventListener('scroll', onScroll, { passive: true })

    const currentPageIndex = (): number => {
      if (singleMode) return activeIndex
      return Math.min(
        metrics.heights.length - 1,
        pageIndexAtCenter(
          metrics,
          stage.viewport.scrollTop,
          stage.viewport.clientHeight,
          scale,
          DOCVIEW_PADDING
        )
      )
    }

    const jumpToPage = (pageNumber: number): void => {
      const target = Math.max(0, Math.min(metrics.heights.length - 1, pageNumber))
      if (singleMode) {
        activeIndex = target
        layoutAll()
      } else {
        stage.viewport.scrollTop = pageTopFromIndex(metrics, target, scale, DOCVIEW_PADDING)
      }
      notifyPageChange()
    }

    const applyFit = (mode: 'width' | 'page'): void => {
      if (stage.viewport.clientWidth <= 0) return
      fitMode = mode
      const width = availableWidth()
      const height = availableHeight()
      if (mode === 'width') {
        scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, width / baseWidth))
      } else {
        const fitHeight = singleMode ? metrics.heights[activeIndex] : metrics.heights[metrics.indexOfMaxHeight]
        scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.min(width / baseWidth, height / fitHeight)))
      }
      layoutAll()
      notifyPageChange()
    }

    const zoomBy = (factor: number): void => {
      const anchor = (stage.viewport.scrollTop - DOCVIEW_PADDING) / scale
      fitMode = 'none'
      scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * factor))
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
        stage.viewport.scrollTop = pageTopFromIndex(metrics, anchor, scale, DOCVIEW_PADDING)
      }
      notifyPageChange()
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

    applyFit('width')

    const adapter: PreviewAdapter = {
      canZoom: true,
      get zoomPercent() {
        return Math.round(scale * 100)
      },
      zoomIn: () => zoomBy(ZOOM_STEP),
      zoomOut: () => zoomBy(1 / ZOOM_STEP),
      resetZoom: () => applyFit('width'),
      pages: {
        get page() {
          return currentPageIndex() + 1
        },
        get pageCount() {
          return metrics.heights.length
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
      },
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

    this.attachmentsByContainer.set(container, {
      destroy: () => {
        resizeObserver?.disconnect()
        stage.viewport.removeEventListener('scroll', onScroll)
        if (scrollFrame) window.cancelAnimationFrame(scrollFrame)
        stage.destroy()
      },
    })

    return adapter
  }

  private renderLegacyFallback(container: HTMLElement, format: string): PreviewAdapter {
    const fallback = document.createElement('div')
    fallback.style.position = 'absolute'
    fallback.style.inset = '0'
    fallback.style.display = 'flex'
    fallback.style.flexDirection = 'column'
    fallback.style.alignItems = 'center'
    fallback.style.justifyContent = 'center'
    fallback.style.gap = '8px'
    fallback.style.padding = '16px'
    fallback.style.boxSizing = 'border-box'
    fallback.style.fontFamily = 'system-ui, sans-serif'
    fallback.style.fontSize = '13px'
    fallback.style.color = '#57606a'
    fallback.style.textAlign = 'center'

    const title = document.createElement('div')
    title.textContent = 'Preview unavailable'
    title.style.fontWeight = '600'
    title.style.color = '#24292f'
    fallback.appendChild(title)

    const detail = document.createElement('div')
    detail.textContent = `This document uses the legacy .${format} format, which cannot be rendered in the browser. Use the Download button to open it in an installed application.`
    fallback.appendChild(detail)

    container.appendChild(fallback)

    return {
      canDownload: true,
      canFullscreen: false,
    }
  }

  destroy(container: HTMLElement): void {
    const attachment = this.attachmentsByContainer.get(container)
    if (!attachment) return
    attachment.destroy()
    this.attachmentsByContainer.delete(container)
  }
}