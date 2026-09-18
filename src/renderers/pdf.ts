import type { PreviewAdapter } from '../controls/types.js'
import type { PreviewOptions, PreviewResult } from '../types.js'
import { resolvePdfWorkerSrc } from '../pdf-worker.js'
import { isBlobResultData } from '../previewers/result-types.js'
import { createRenderState } from './render-state.js'
import type { Renderer } from './types.js'
import {
  computePageMetrics,
  createDocStage,
  createPagedDocController,
  DOCVIEW_GAP,
  DOCVIEW_PADDING,
  type PageMetrics,
  type PagedDocController,
  type PagedDocHost,
  type PagedDocViewState,
} from './docview.js'
import type { PDFPageProxy } from 'pdfjs-dist'

interface PageRecord {
  readonly wrapper: HTMLDivElement
  readonly canvas: HTMLCanvasElement
  readonly page: PDFPageProxy
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

  private readonly attachments = createRenderState<PdfAttachment>()

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

    let rotation = 0
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

    const renderPage = async (record: PageRecord, scale: number): Promise<void> => {
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

    const renderVisiblePages = (scale: number, currentMetrics: PageMetrics): void => {
      const scrollTop = stage.viewport.scrollTop
      const viewportHeight = stage.viewport.clientHeight
      const from = scrollTop - viewportHeight
      const to = scrollTop + viewportHeight * 2
      for (let index = 0; index < records.length; index += 1) {
        const top = DOCVIEW_PADDING + (currentMetrics.offsets[index] ?? 0) * scale
        const bottom = top + (currentMetrics.heights[index] ?? 0) * scale
        if (bottom >= from && top <= to) void renderPage(records[index] as PageRecord, scale)
      }
    }

    const renderVisible = (view: PagedDocViewState): void => {
      renderVisiblePages(view.scale, view.metrics)
    }

    const host: PagedDocHost = {
      stage,
      baseWidth: maxBaseWidth,
      pageCount: records.length,
      minScale: MIN_SCALE,
      maxScale: MAX_SCALE,
      zoomStep: ZOOM_STEP,
      get metrics() {
        return metrics
      },
      onScrollFrame: renderVisible,
      onLayout: renderVisible,
      onDestroy: () => {
        intersectionObserver?.disconnect()
        stage.destroy()
        void loadingTask.destroy()
      },
    }

    applyBaseSizes()
    buildMetrics()

    const controller: PagedDocController = createPagedDocController(host)

    const intersectionObserver =
      typeof IntersectionObserver !== 'undefined'
        ? new IntersectionObserver(
            (entries) => {
              for (const entry of entries) {
                if (entry.isIntersecting) {
                  const record = records.find((item) => item.wrapper === entry.target)
                  if (record) void renderPage(record, controller.scale)
                }
              }
            },
            { root: stage.viewport, threshold: 0.01 }
          )
        : null
    for (const record of records) intersectionObserver?.observe(record.wrapper)

    const setRotation = (next: number): void => {
      rotation = ((next % 360) + 360) % 360
      applyBaseSizes()
      buildMetrics()
      const anchor = (stage.viewport.scrollTop - DOCVIEW_PADDING) / controller.scale
      controller.layoutAll(anchor)
      controller.notifyPageChange()
    }

    const adapter: PreviewAdapter = {
      ...controller.adapter,
      rotate: {
        rotateClockwise: () => setRotation(rotation + 90),
        rotateCounterclockwise: () => setRotation(rotation - 90),
      },
    }

    this.attachments.set(container, {
      destroy: () => controller.destroy(),
    })

    return adapter
  }

  destroy(container: HTMLElement): void {
    this.attachments.destroyFor(container)
  }
}