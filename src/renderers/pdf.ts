import type { PreviewAdapter, PageNavigation } from '../controls/types.js'
import type { PreviewOptions, PreviewResult } from '../types.js'
import { resolvePdfWorkerSrc } from '../pdf-worker.js'
import { isBlobResultData } from '../previewers/result-types.js'
import type { Renderer } from './types.js'
import {
  computePageMetrics,
  createDocStage,
  DOCVIEW_GAP,
  DOCVIEW_PADDING,
  pageIndexAtCenter,
  pageTopFromIndex,
  type PageMetrics,
} from './docview.js'

interface PageRecord {
  readonly wrapper: HTMLDivElement
  readonly canvas: HTMLCanvasElement
  readonly page: import('pdfjs-dist').PDFPageProxy
  readonly baseWidth: number
  readonly baseHeight: number
  renderedKey: string
}

interface PdfAttachment {
  destroy(): void
}

const MIN_SCALE = 0.05
const MAX_SCALE = 4
const ZOOM_STEP = 1.25
const MAX_RENDER_DPR = 2

export class PdfRenderer implements Renderer {
  readonly name = 'pdf'
  readonly supportedTypes = ['application/pdf']

  private readonly attachmentsByContainer = new WeakMap<HTMLElement, PdfAttachment>()

  canRender(type: string): boolean {
    return type === 'application/pdf'
  }

  async render(container: HTMLElement, result: PreviewResult, options?: PreviewOptions): Promise<PreviewAdapter> {
    if (!isBlobResultData(result.data)) {
      throw new Error('The preview result has no PDF data.')
    }

    const pdfjs = await import('pdfjs-dist')
    pdfjs.GlobalWorkerOptions.workerSrc = resolvePdfWorkerSrc(pdfjs.version, options)

    const bytes = new Uint8Array(await result.data.blob.arrayBuffer())
    const loadingTask = pdfjs.getDocument({ data: bytes })
    const pdf = await loadingTask.promise
    const numPages = pdf.numPages

    const stage = createDocStage(container)
    stage.content.style.display = 'flex'
    stage.content.style.flexDirection = 'column'
    stage.content.style.alignItems = 'center'
    stage.content.style.gap = `${DOCVIEW_GAP}px`

    const records: PageRecord[] = []
    for (let index = 0; index < numPages; index += 1) {
      const page = await pdf.getPage(index + 1)
      const base = page.getViewport({ scale: 1, rotation: 0 })

      const wrapper = document.createElement('div')
      wrapper.style.background = '#ffffff'
      wrapper.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.4)'
      wrapper.style.flexShrink = '0'

      const canvas = document.createElement('canvas')
      canvas.style.width = '100%'
      canvas.style.height = '100%'
      wrapper.appendChild(canvas)
      stage.content.appendChild(wrapper)

      records.push({
        wrapper,
        canvas,
        page,
        baseWidth: base.width,
        baseHeight: base.height,
        renderedKey: '',
      })
    }

    const maxBaseWidth = Math.max(1, ...records.map((record) => record.baseWidth))

    let scale = 1
    let rotation = 0
    let fitMode: 'width' | 'page' | 'none' = 'none'
    let singleMode = false
    let activeIndex = 0
    let pageChangeListeners: (() => void)[] = []
    let metrics: PageMetrics = computePageMetrics([], DOCVIEW_GAP)

    const widthOf = (record: PageRecord): number =>
      rotation % 180 !== 0 ? record.baseHeight : record.baseWidth
    const heightOf = (record: PageRecord): number =>
      rotation % 180 !== 0 ? record.baseWidth : record.baseHeight

    const buildMetrics = (): void => {
      const positions: { top: number; height: number }[] = []
      let top = 0
      for (const record of records) {
        positions.push({ top, height: heightOf(record) })
        top += heightOf(record) + DOCVIEW_GAP
      }
      metrics = computePageMetrics(positions, DOCVIEW_GAP)
    }

    const applyBaseSizes = (): void => {
      for (const record of records) {
        record.wrapper.style.width = `${widthOf(record)}px`
        record.wrapper.style.height = `${heightOf(record)}px`
        record.renderedKey = ''
      }
    }

    const availableWidth = (): number => Math.max(1, stage.viewport.clientWidth - DOCVIEW_PADDING * 2)
    const availableHeight = (): number => Math.max(1, stage.viewport.clientHeight - DOCVIEW_PADDING * 2)

    const layoutAll = (restoreDocY?: number): void => {
      const scaleHeight = singleMode ? metrics.heights[activeIndex] * scale : metrics.totalHeight * scale
      const translateY = singleMode ? -(metrics.offsets[activeIndex] ?? 0) * scale : 0
      stage.layout(scale, maxBaseWidth, metrics.totalHeight, Math.ceil(scaleHeight), translateY)
      if (singleMode) {
        stage.viewport.style.overflow = 'hidden'
        stage.viewport.scrollTop = 0
      } else {
        stage.viewport.style.overflow = 'auto'
        if (restoreDocY !== undefined) {
          stage.viewport.scrollTop = Math.max(0, DOCVIEW_PADDING + restoreDocY * scale)
        }
      }
      renderVisiblePages()
    }

    const renderPage = async (record: PageRecord): Promise<void> => {
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_RENDER_DPR)
      const key = `${scale.toFixed(4)}:${rotation}:${dpr}`
      if (record.renderedKey === key) return
      if (widthOf(record) <= 0 || heightOf(record) <= 0) return

      try {
        const viewport = record.page.getViewport({ scale: scale * dpr, rotation })
        record.canvas.width = Math.max(1, Math.floor(viewport.width))
        record.canvas.height = Math.max(1, Math.floor(viewport.height))
        const context = record.canvas.getContext('2d')
        if (!context) return
        await record.page.render({ canvasContext: context, canvas: record.canvas, viewport }).promise
        record.renderedKey = key
      } catch {
        record.renderedKey = key
      }
    }

    const renderVisiblePages = (): void => {
      const scrollTop = stage.viewport.scrollTop
      const viewportHeight = stage.viewport.clientHeight
      const from = scrollTop - viewportHeight
      const to = scrollTop + viewportHeight * 2
      for (let index = 0; index < records.length; index += 1) {
        const top = DOCVIEW_PADDING + (metrics.offsets[index] ?? 0) * scale
        const bottom = top + (metrics.heights[index] ?? 0) * scale
        if (bottom >= from && top <= to) void renderPage(records[index] as PageRecord)
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
        renderVisiblePages()
        notifyPageChange()
      })
    }
    stage.viewport.addEventListener('scroll', onScroll, { passive: true })

    const intersectionObserver =
      typeof IntersectionObserver !== 'undefined'
        ? new IntersectionObserver(
            (entries) => {
              for (const entry of entries) {
                if (entry.isIntersecting) {
                  const record = records.find((item) => item.wrapper === entry.target)
                  if (record) void renderPage(record)
                }
              }
            },
            { root: stage.viewport, threshold: 0.01 }
          )
        : null
    for (const record of records) intersectionObserver?.observe(record.wrapper)

    const currentPageIndex = (): number => {
      if (records.length === 0) return 0
      if (singleMode) return activeIndex
      return Math.min(
        records.length - 1,
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
      const target = Math.max(0, Math.min(records.length - 1, pageNumber))
      if (singleMode) {
        activeIndex = target
        layoutAll()
      } else {
        stage.viewport.scrollTop = pageTopFromIndex(metrics, target, scale, DOCVIEW_PADDING)
        renderVisiblePages()
      }
      notifyPageChange()
    }

    const applyFit = (mode: 'width' | 'page'): void => {
      if (stage.viewport.clientWidth <= 0) return
      fitMode = mode
      const width = availableWidth()
      const height = availableHeight()
      if (mode === 'width') {
        scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, width / maxBaseWidth))
      } else {
        const fitHeight = singleMode ? metrics.heights[activeIndex] : metrics.heights[metrics.indexOfMaxHeight]
        scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.min(width / maxBaseWidth, height / fitHeight)))
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

    const setRotation = (next: number): void => {
      rotation = ((next % 360) + 360) % 360
      applyBaseSizes()
      buildMetrics()
      const anchor = (stage.viewport.scrollTop - DOCVIEW_PADDING) / scale
      layoutAll(anchor)
      renderVisiblePages()
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
        stage.viewport.scrollTop = pageTopFromIndex(metrics, anchor, scale, DOCVIEW_PADDING)
        layoutAll()
      }
      notifyPageChange()
    }

    const navigation: PageNavigation = {
      get page() {
        return currentPageIndex() + 1
      },
      get pageCount() {
        return records.length
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
          })
        : null
    resizeObserver?.observe(stage.viewport)

    applyBaseSizes()
    buildMetrics()
    applyFit('width')

    const adapter: PreviewAdapter = {
      canZoom: true,
      get zoomPercent() {
        return Math.round(scale * 100)
      },
      zoomIn: () => zoomBy(ZOOM_STEP),
      zoomOut: () => zoomBy(1 / ZOOM_STEP),
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
      rotate: {
        rotateClockwise: () => setRotation(rotation + 90),
        rotateCounterclockwise: () => setRotation(rotation - 90),
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
        intersectionObserver?.disconnect()
        resizeObserver?.disconnect()
        stage.viewport.removeEventListener('scroll', onScroll)
        if (scrollFrame) window.cancelAnimationFrame(scrollFrame)
        stage.destroy()
        void loadingTask.destroy()
      },
    })

    return adapter
  }

  destroy(container: HTMLElement): void {
    const attachment = this.attachmentsByContainer.get(container)
    if (!attachment) return
    attachment.destroy()
    this.attachmentsByContainer.delete(container)
  }
}