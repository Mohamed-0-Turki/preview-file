import type { PreviewAdapter } from '../controls/types.js'
import type { PreviewOptions, PreviewResult } from '../types.js'
import { createMagnifier } from './interaction/magnifier.js'
import { createZoomable } from './interaction/zoomable.js'
import type { Renderer } from './types.js'

interface ImageResultData {
  readonly blob: Blob
}

function isImageResultData(data: unknown): data is ImageResultData {
  return (
    typeof data === 'object' &&
    data !== null &&
    'blob' in data &&
    (data as { blob?: unknown }).blob instanceof Blob
  )
}

const SUPPORTED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'image/avif',
  'image/bmp',
  'image/apng',
]

const MIN_SCALE = 1
const MAX_SCALE = 8

const LENS_SIZE = 160
const LENS_MAGNIFICATION = 8
const LENS_BORDER_WIDTH = 2
const LENS_MAGNIFICATION_OPTIONS = [2, 4, 8, 12, 16]
const LENS_SIZE_OPTIONS = [100, 140, 180, 220]

interface ImageAttachment {
  readonly urls: string[]
  readonly zoomable: ReturnType<typeof createZoomable>
  readonly magnifier: ReturnType<typeof createMagnifier>
}

export class ImageRenderer implements Renderer {
  readonly name = 'image'
  readonly supportedTypes = SUPPORTED_TYPES

  private readonly attachmentsByContainer = new WeakMap<HTMLElement, ImageAttachment>()

  canRender(type: string): boolean {
    return type.startsWith('image/')
  }

  async render(
    container: HTMLElement,
    result: PreviewResult,
    options?: PreviewOptions
  ): Promise<PreviewAdapter> {
    if (!isImageResultData(result.data)) {
      throw new Error('The preview result has no image data.')
    }

    const url = URL.createObjectURL(result.data.blob)

    const viewport = document.createElement('div')
    viewport.style.position = 'absolute'
    viewport.style.inset = '0'
    viewport.style.display = 'flex'
    viewport.style.alignItems = 'center'
    viewport.style.justifyContent = 'center'
    viewport.style.overflow = 'hidden'

    const img = document.createElement('img')
    img.alt = 'Image preview'
    img.src = url
    img.draggable = false
    img.style.display = 'block'
    img.style.maxWidth = '100%'
    img.style.maxHeight = '100%'
    img.style.objectFit = 'contain'

    try {
      await this.waitForLoad(img)
    } catch {
      URL.revokeObjectURL(url)
      throw new Error('The file could not be displayed as an image.')
    }

    viewport.appendChild(img)
    container.appendChild(viewport)

    const ratio = Math.min(
      (img.naturalWidth || 1) / Math.max(1, img.clientWidth || 1),
      (img.naturalHeight || 1) / Math.max(1, img.clientHeight || 1)
    )
    const maxScale = Math.min(MAX_SCALE, Math.max(2, ratio))

    const zoomable = createZoomable(viewport, img, { minScale: MIN_SCALE, maxScale })

    let currentMagnification = options?.magnifier?.magnification ?? LENS_MAGNIFICATION
    let currentLensSize = options?.magnifier?.lensSize ?? LENS_SIZE

    const magnifier = createMagnifier(viewport, img, {
      lensSize: currentLensSize,
      magnification: currentMagnification,
      borderWidth: options?.magnifier?.borderWidth ?? LENS_BORDER_WIDTH,
    })

    this.attachmentsByContainer.set(container, { urls: [url], zoomable, magnifier })

    return {
      canZoom: true,
      get zoomPercent() {
        return Math.round(zoomable.scale * 100)
      },
      zoomIn: () => zoomable.zoomIn(),
      zoomOut: () => zoomable.zoomOut(),
      resetZoom: () => zoomable.resetZoom(),
      lens: {
        get magnification() {
          return currentMagnification
        },
        get lensSize() {
          return currentLensSize
        },
        magnificationOptions: LENS_MAGNIFICATION_OPTIONS,
        lensSizeOptions: LENS_SIZE_OPTIONS,
        setMagnification: (value: number) => {
          currentMagnification = value
          magnifier.setOptions({ magnification: value })
        },
        setLensSize: (value: number) => {
          currentLensSize = value
          magnifier.setOptions({ lensSize: value })
        },
      },
    }
  }

  destroy(container: HTMLElement): void {
    const attachment = this.attachmentsByContainer.get(container)
    if (!attachment) return

    attachment.magnifier.destroy()
    attachment.zoomable.destroy()
    for (const url of attachment.urls) {
      URL.revokeObjectURL(url)
    }

    this.attachmentsByContainer.delete(container)
  }

  private async waitForLoad(img: HTMLImageElement): Promise<void> {
    if (typeof img.decode === 'function') {
      await img.decode()
      return
    }

    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('Image failed to load'))
    })
  }
}