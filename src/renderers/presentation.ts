import type { LoadedPresentation } from 'pptx-viewer'
import type { PreviewAdapter } from '../controls/types.js'
import type { PreviewOptions, PreviewResult } from '../types.js'
import { isPresentationResultData, isRenderablePresentationFormat } from '../previewers/result-types.js'
import { createRenderState } from './render-state.js'
import { renderLegacyFallback } from './legacy-fallback.js'
import type { Renderer } from './types.js'
import {
  computePageMetrics,
  createDocStage,
  createPagedDocController,
  DOCVIEW_GAP,
  type PageMetrics,
  type PagedDocController,
  type PagedDocHost,
} from './docview.js'

interface SlideRecord {
  readonly wrapper: HTMLDivElement
  rendered: boolean
  failed: boolean
}

interface PresentationAttachment {
  destroy(): void
}

const MIN_SCALE = 0.05
const MAX_SCALE = 4
const ZOOM_STEP = 1.25
const SLIDE_COVER_CLASS = 'py-presentation-slide'

export class PresentationRenderer implements Renderer {
  readonly name = 'presentation'
  readonly supportedTypes = ['application/vnd.presentation']

  private readonly attachments = createRenderState<PresentationAttachment>()

  canRender(type: string): boolean {
    return type === 'application/vnd.presentation'
  }

  async render(container: HTMLElement, result: PreviewResult, _options?: PreviewOptions): Promise<PreviewAdapter> {
    if (!isPresentationResultData(result.data)) {
      throw new Error('The preview result has no presentation data.')
    }

    if (!isRenderablePresentationFormat(result.data.format)) {
      const isLegacy =
        result.data.format === 'ppt' || result.data.format === 'pps' || result.data.format === 'pot'
      return renderLegacyFallback(
        container,
        isLegacy
          ? `This presentation uses the legacy .${result.data.format} format, which cannot be rendered in the browser. Use the Download button to open it in an installed application.`
          : 'This presentation uses the .odp format, which is not supported for in-browser rendering. Use the Download button to open it in an installed application.'
      )
    }

    let pptxViewer: typeof import('pptx-viewer')
    try {
      pptxViewer = await import('pptx-viewer')
    } catch (error) {
      throw new Error(`The presentation parser could not be loaded. ${(error as Error).message}`)
    }

    let presentation: LoadedPresentation
    try {
      const buffer = await result.data.blob.arrayBuffer()
      presentation = await pptxViewer.loadPresentation(buffer)
    } catch (error) {
      throw new Error(`The presentation could not be shown. ${(error as Error).message}`)
    }

    const slideCount = presentation.slides.length
    if (slideCount === 0) {
      presentation.cleanup()
      throw new Error('The presentation contains no slides.')
    }

    const baseWidth = Math.max(1, Math.round(presentation.slideSize.width))
    const baseHeight = Math.max(1, Math.round(presentation.slideSize.height))
    const aspect = baseWidth / baseHeight

    const stage = createDocStage(container)
    stage.content.style.display = 'flex'
    stage.content.style.flexDirection = 'column'
    stage.content.style.alignItems = 'center'
    stage.content.style.gap = `${DOCVIEW_GAP}px`

    const records: SlideRecord[] = []
    for (let index = 0; index < slideCount; index += 1) {
      const wrapper = document.createElement('div')
      wrapper.className = SLIDE_COVER_CLASS
      wrapper.style.width = `${baseWidth}px`
      wrapper.style.height = `${baseHeight}px`
      wrapper.style.flexShrink = '0'
      wrapper.style.background = '#ffffff'
      wrapper.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.4)'
      wrapper.style.overflow = 'hidden'
      wrapper.style.aspectRatio = `${aspect}`
      stage.content.appendChild(wrapper)
      records.push({ wrapper, rendered: false, failed: false })
    }

    const renderSlideInto = (record: SlideRecord, index: number): void => {
      if (record.rendered) return
      record.rendered = true
      try {
        pptxViewer.renderSlideToElement(presentation, index, record.wrapper, {
          width: baseWidth,
          height: baseHeight,
        })
      } catch {
        record.failed = true
        const banner = document.createElement('div')
        banner.style.display = 'flex'
        banner.style.alignItems = 'center'
        banner.style.justifyContent = 'center'
        banner.style.height = '100%'
        banner.style.fontFamily = 'system-ui, sans-serif'
        banner.style.fontSize = '13px'
        banner.style.color = '#57606a'
        banner.textContent = 'This slide could not be rendered.'
        record.wrapper.appendChild(banner)
      }
    }

    const positions: { top: number; height: number }[] = []
    let top = 0
    for (let index = 0; index < slideCount; index += 1) {
      positions.push({ top, height: baseHeight })
      top += baseHeight + DOCVIEW_GAP
    }
    const metrics: PageMetrics = computePageMetrics(positions, DOCVIEW_GAP)

    const host: PagedDocHost = {
      stage,
      baseWidth,
      pageCount: slideCount,
      minScale: MIN_SCALE,
      maxScale: MAX_SCALE,
      zoomStep: ZOOM_STEP,
      initialFit: 'page',
      get metrics() {
        return metrics
      },
      onDestroy: () => {
        intersectionObserver?.disconnect()
        presentation.cleanup()
        stage.destroy()
      },
    }

    const controller: PagedDocController = createPagedDocController(host)

    const intersectionObserver =
      typeof IntersectionObserver !== 'undefined'
        ? new IntersectionObserver(
            (entries) => {
              for (const entry of entries) {
                if (entry.isIntersecting) {
                  const index = records.findIndex((record) => record.wrapper === entry.target)
                  if (index >= 0) renderSlideInto(records[index] as SlideRecord, index)
                }
              }
            },
            { root: stage.viewport, threshold: 0.01 }
          )
        : null

    for (let index = 0; index < records.length; index += 1) {
      const record = records[index] as SlideRecord
      if (intersectionObserver) {
        intersectionObserver.observe(record.wrapper)
      } else {
        renderSlideInto(record, index)
      }
    }

    this.attachments.set(container, {
      destroy: () => controller.destroy(),
    })

    return controller.adapter
  }

  destroy(container: HTMLElement): void {
    this.attachments.destroyFor(container)
  }
}