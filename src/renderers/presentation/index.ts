/**
 * The presentation renderer.
 *
 * It is a thin adapter: `ooxml` turns bytes into a resolved model,
 * `renderers/ooxml` turns the model into DOM, and everything here is the
 * presentation-specific policy — the slide boxes, the lazy paint on scroll, the
 * page metrics handed to the shared paged-document controller, and the teardown
 * that has to release the package and every object URL it minted.
 *
 * The paged controller is reused rather than reimplemented, so a deck gets the
 * same fit-width/fit-page zoom, page navigation and keyboard handling as a PDF
 * or a Word document, and the toolbar can drive all three with one capability set.
 */

import {
  OfficePackage,
  parsePresentation,
  type PptxPresentation,
  type PptxSlide,
} from '../../ooxml/index.js'
import type { PreviewAdapter } from '../../controls/types.js'
import type { PreviewOptions, PreviewResult } from '../../types.js'
import { isPresentationResultData, isRenderablePresentationFormat } from '../../previewers/result-types.js'
import { createRenderState } from '../render-state.js'
import { renderLegacyFallback } from '../legacy-fallback.js'
import type { Renderer } from '../types.js'
import {
  computePageMetrics,
  createDocStage,
  createPagedDocController,
  DOCVIEW_GAP,
  type PageMetrics,
  type PagedDocController,
  type PagedDocHost,
} from '../docview.js'
import { createAssetStore, type AssetStore } from '../ooxml/assets.js'
import { renderSlide } from '../ooxml/render.js'

const MIN_SCALE = 0.05
const MAX_SCALE = 4
const SLIDE_COVER_CLASS = 'py-presentation-slide'

interface SlideRecord {
  readonly wrapper: HTMLDivElement
  readonly slide: PptxSlide
  painted: boolean
  failed: boolean
}

interface PresentationAttachment {
  destroy(): void
}

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

    const buffer = await result.data.blob.arrayBuffer()
    // The name is only advisory — it labels errors and picks the package kind
    // when the content type is absent, so a generic name is fine.
    const fileName = 'presentation.pptx'
    const pkg = await OfficePackage.open(new Uint8Array(buffer), fileName)
    const presentation = await parsePresentation(pkg, fileName)

    if (presentation.slides.length === 0) {
      pkg.dispose()
      throw new Error('The presentation contains no slides.')
    }

    return this.mount(container, pkg, presentation)
  }

  /**
   * Build the slide stack and hand it to the shared paged controller.
   *
   * Split out from `render` so the whole layout is in one place that owns the
   * package's lifetime: every exit path after this point disposes both the
   * controller and the package.
   */
  private mount(container: HTMLElement, pkg: OfficePackage, presentation: PptxPresentation): PreviewAdapter {
    // Points are laid out 1:1, so the base size is the slide size in points.
    const baseWidth = Math.max(1, Math.round(presentation.size.widthPt))
    const baseHeight = Math.max(1, Math.round(presentation.size.heightPt))

    const stage = createDocStage(container)
    stage.content.style.display = 'flex'
    stage.content.style.flexDirection = 'column'
    stage.content.style.alignItems = 'center'
    stage.content.style.gap = `${DOCVIEW_GAP}px`

    const records: SlideRecord[] = presentation.slides.map((slide) => {
      const wrapper = document.createElement('div')
      wrapper.className = SLIDE_COVER_CLASS
      wrapper.style.width = `${baseWidth}px`
      wrapper.style.height = `${baseHeight}px`
      wrapper.style.flexShrink = '0'
      wrapper.style.background = '#ffffff'
      wrapper.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.4)'
      wrapper.style.overflow = 'hidden'
      /* The cover is the slide's coordinate space, so it has to be a containing
         block. `renderSlide` paints into an absolutely positioned layer and every
         shape inside it is absolutely positioned too; without this they resolve
         against the deck-level `content` layer instead, which stacks every slide
         at the top of the document and leaves the later pages blank. */
      wrapper.style.position = 'relative'
      stage.content.appendChild(wrapper)
      return { wrapper, slide, painted: false, failed: false }
    })

    // Images are resolved up front for the whole deck. The object URLs are
    // shared across slides, and a slide that scrolls into view before this
    // finishes simply paints again when it lands.
    const assets: AssetStore = createAssetStore(pkg, {
      onReady: () => {
        for (const record of records) {
          if (record.painted) record.painted = false
        }
        paintVisible()
      },
    })
    void assets.preload(presentation.slides.map((slide) => slide.part))

    const paint = (record: SlideRecord): void => {
      if (record.painted || record.failed) return
      record.painted = true
      try {
        record.wrapper.replaceChildren()
        renderSlide(record.slide, record.wrapper, {
          assets: (part, relId) => assets.resolveById(part, relId),
        })
      } catch {
        record.failed = true
        record.wrapper.replaceChildren(failureBanner())
      }
    }

    const paintVisible = (): void => {
      for (const record of records) {
        if (isNearViewport(record.wrapper, stage.viewport)) paint(record)
      }
    }

    const observer =
      typeof IntersectionObserver !== 'undefined'
        ? new IntersectionObserver(
            (entries) => {
              for (const entry of entries) {
                if (!entry.isIntersecting) continue
                const record = records.find((candidate) => candidate.wrapper === entry.target)
                if (record) paint(record)
              }
            },
            { root: stage.viewport, threshold: 0.01 }
          )
        : null

    for (const record of records) {
      if (observer) observer.observe(record.wrapper)
    }
    if (!observer) {
      for (const record of records) paint(record)
    }

    const positions: { top: number; height: number }[] = []
    let top = 0
    for (let index = 0; index < records.length; index += 1) {
      positions.push({ top, height: baseHeight })
      top += baseHeight + DOCVIEW_GAP
    }
    const metrics: PageMetrics = computePageMetrics(positions, DOCVIEW_GAP)

    const host: PagedDocHost = {
      stage,
      baseWidth,
      pageCount: records.length,
      minScale: MIN_SCALE,
      maxScale: MAX_SCALE,
      zoomStep: 1.25,
      initialFit: 'page',
      get metrics() {
        return metrics
      },
      // Every relayout — zoom, fit, a page jump, single-page mode — changes
      // which covers are on screen, so it has to repaint them. Relying on the
      // observer alone means a programmatic jump to a slide leaves it blank
      // whenever the observer is late or unavailable.
      onLayout: () => paintVisible(),
      onDestroy: () => {
        observer?.disconnect()
        assets.dispose()
        pkg.dispose()
        stage.destroy()
      },
    }

    const controller: PagedDocController = createPagedDocController(host)
    this.attachments.set(container, { destroy: () => controller.destroy() })
    return controller.adapter
  }

  destroy(container: HTMLElement): void {
    this.attachments.destroyFor(container)
  }
}

function failureBanner(): HTMLElement {
  const banner = document.createElement('div')
  Object.assign(banner.style, {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    fontFamily: 'system-ui, sans-serif',
    fontSize: '13px',
    color: '#57606a',
  })
  banner.textContent = 'This slide could not be rendered.'
  return banner
}

/** True when `element` is within one viewport of `viewport`, in either direction. */
function isNearViewport(element: HTMLElement, viewport: HTMLElement): boolean {
  const a = element.getBoundingClientRect()
  const b = viewport.getBoundingClientRect()
  return a.bottom >= b.top - b.height && a.top <= b.bottom + b.height
}
