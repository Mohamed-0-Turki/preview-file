import type { PreviewAdapter } from '../controls/types.js'
import type { PreviewOptions, PreviewResult } from '../types.js'
import { isRenderableWordFormat, isWordResultData } from '../previewers/result-types.js'
import { createRenderState } from './render-state.js'
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

  private readonly attachments = createRenderState<WordAttachment>()

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
    let metrics: PageMetrics = computePageMetrics(positions, DOCVIEW_GAP)
    const totalHeight = Math.max(metrics.totalHeight, Math.max(1, wrapper.getBoundingClientRect().height))
    metrics = { ...metrics, totalHeight }

    const host: PagedDocHost = {
      stage,
      baseWidth,
      pageCount: metrics.heights.length,
      minScale: MIN_SCALE,
      maxScale: MAX_SCALE,
      zoomStep: ZOOM_STEP,
      get metrics() {
        return metrics
      },
      onDestroy: () => stage.destroy(),
    }

    const controller: PagedDocController = createPagedDocController(host)

    this.attachments.set(container, {
      destroy: () => controller.destroy(),
    })

    return controller.adapter
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
    this.attachments.destroyFor(container)
  }
}