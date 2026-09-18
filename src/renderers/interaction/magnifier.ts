import type { MagnifierOptions } from '../../types.js'
import { clamp } from '../../utils/index.js'

export interface Magnifier {
  setOptions(options: MagnifierOptions): void
  destroy(): void
}

const DEFAULT_LENS_SIZE = 120
const DEFAULT_MAGNIFICATION = 8
const DEFAULT_BORDER_WIDTH = 2
const CROSSHAIR_SIZE = 14

function pointInRect(x: number, y: number, rect: DOMRect): boolean {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
}

function cssUrl(value: string): string {
  return `url("${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}")`
}

/**
 * DevTools-style inspection loupe for an image.
 *
 * A circular overlay that shows the exact pixels under the cursor at a high,
 * configurable magnification. The inspected pixel is always aligned with the
 * center of the lens (marked by a crosshair). The lens never modifies the
 * image's own transform, so it is independent of the persistent zoom state.
 *
 * Options can be changed at any time via `setOptions`, which resizes the lens
 * and re-renders the magnified region immediately.
 */
export function createMagnifier(
  viewport: HTMLElement,
  image: HTMLImageElement,
  options: MagnifierOptions = {}
): Magnifier {
  let lensSize = options.lensSize ?? DEFAULT_LENS_SIZE
  let magnification = options.magnification ?? DEFAULT_MAGNIFICATION
  let borderWidth = options.borderWidth ?? DEFAULT_BORDER_WIDTH

  let lastMouseX = 0
  let lastMouseY = 0
  let shown = false

  const lens = document.createElement('div')
  lens.style.position = 'absolute'
  lens.style.left = '0'
  lens.style.top = '0'
  lens.style.borderRadius = '50%'
  lens.style.boxShadow =
    '0 0 0 1px rgba(10, 14, 18, 0.2), 0 4px 16px rgba(10, 14, 18, 0.3)'
  lens.style.backgroundRepeat = 'no-repeat'
  lens.style.imageRendering = 'pixelated'
  lens.style.pointerEvents = 'none'
  lens.style.willChange = 'transform, background-position'
  lens.style.zIndex = '5'
  lens.style.display = 'none'
  lens.style.backgroundImage = cssUrl(image.src)
  viewport.appendChild(lens)

  const crosshair = document.createElement('div')
  crosshair.style.position = 'absolute'
  crosshair.style.width = `${CROSSHAIR_SIZE}px`
  crosshair.style.height = `${CROSSHAIR_SIZE}px`
  crosshair.style.pointerEvents = 'none'
  lens.appendChild(crosshair)

  const shadow = '0 0 0 1px rgba(27, 31, 36, 0.7), 0 0 0 2px rgba(255, 255, 255, 0.75)'

  const horizontalBar = document.createElement('div')
  horizontalBar.style.position = 'absolute'
  horizontalBar.style.left = '50%'
  horizontalBar.style.top = '50%'
  horizontalBar.style.transform = 'translate(-50%, -50%)'
  horizontalBar.style.width = '10px'
  horizontalBar.style.height = '1px'
  horizontalBar.style.background = '#ffffff'
  horizontalBar.style.boxShadow = shadow
  crosshair.appendChild(horizontalBar)

  const verticalBar = document.createElement('div')
  verticalBar.style.position = 'absolute'
  verticalBar.style.left = '50%'
  verticalBar.style.top = '50%'
  verticalBar.style.transform = 'translate(-50%, -50%)'
  verticalBar.style.width = '1px'
  verticalBar.style.height = '10px'
  verticalBar.style.background = '#ffffff'
  verticalBar.style.boxShadow = shadow
  crosshair.appendChild(verticalBar)

  const centerDot = document.createElement('div')
  centerDot.style.position = 'absolute'
  centerDot.style.left = '50%'
  centerDot.style.top = '50%'
  centerDot.style.transform = 'translate(-50%, -50%)'
  centerDot.style.width = '2px'
  centerDot.style.height = '2px'
  centerDot.style.borderRadius = '50%'
  centerDot.style.background = '#24292f'
  centerDot.style.boxShadow = '0 0 0 1px rgba(255, 255, 255, 0.9)'
  crosshair.appendChild(centerDot)

  function half(): number {
    return lensSize / 2
  }

  function applyGeometry(): void {
    const center = half()
    lens.style.width = `${lensSize}px`
    lens.style.height = `${lensSize}px`
    lens.style.border = `${borderWidth}px solid rgba(255, 255, 255, 0.95)`
    crosshair.style.left = `${center - CROSSHAIR_SIZE / 2}px`
    crosshair.style.top = `${center - CROSSHAIR_SIZE / 2}px`
  }

  function show(): void {
    shown = true
    lens.style.display = 'block'
  }

  function hide(): void {
    shown = false
    lens.style.display = 'none'
  }

  function reposition(mouseX: number, mouseY: number): void {
    const imageRect = image.getBoundingClientRect()
    const viewportRect = viewport.getBoundingClientRect()

    if (
      imageRect.width <= 0 ||
      imageRect.height <= 0 ||
      viewportRect.width <= 0 ||
      viewportRect.height <= 0
    ) {
      hide()
      return
    }

    const naturalWidth = image.naturalWidth
    const naturalHeight = image.naturalHeight
    if (naturalWidth <= 0 || naturalHeight <= 0) {
      hide()
      return
    }

    if (!pointInRect(mouseX, mouseY, imageRect)) {
      hide()
      return
    }

    show()

    const center = half()
    const scaleX = imageRect.width / naturalWidth
    const scaleY = imageRect.height / naturalHeight
    const backgroundScaleX = scaleX * magnification
    const backgroundScaleY = scaleY * magnification

    const xInImage = clamp(mouseX - imageRect.left, 0, imageRect.width)
    const yInImage = clamp(mouseY - imageRect.top, 0, imageRect.height)
    const sourceX = clamp(xInImage / scaleX, 0, naturalWidth)
    const sourceY = clamp(yInImage / scaleY, 0, naturalHeight)

    const maxLensX = Math.max(0, viewportRect.width - lensSize)
    const maxLensY = Math.max(0, viewportRect.height - lensSize)
    const lensX = clamp(mouseX - viewportRect.left - center, 0, maxLensX)
    const lensY = clamp(mouseY - viewportRect.top - center, 0, maxLensY)

    lens.style.backgroundSize = `${naturalWidth * backgroundScaleX}px ${naturalHeight * backgroundScaleY}px`
    lens.style.backgroundPosition = `${center - sourceX * backgroundScaleX}px ${center - sourceY * backgroundScaleY}px`
    lens.style.transform = `translate3d(${lensX}px, ${lensY}px, 0)`
  }

  function handlePointer(event: PointerEvent): void {
    lastMouseX = event.clientX
    lastMouseY = event.clientY
    reposition(lastMouseX, lastMouseY)
  }

  image.addEventListener('pointerenter', handlePointer)
  image.addEventListener('pointermove', handlePointer)
  image.addEventListener('pointerleave', hide)

  applyGeometry()

  function setOptions(next: MagnifierOptions): void {
    lensSize = next.lensSize ?? lensSize
    magnification = next.magnification ?? magnification
    borderWidth = next.borderWidth ?? borderWidth
    applyGeometry()
    if (shown) {
      reposition(lastMouseX, lastMouseY)
    }
  }

  function destroy(): void {
    image.removeEventListener('pointerenter', handlePointer)
    image.removeEventListener('pointermove', handlePointer)
    image.removeEventListener('pointerleave', hide)
    lens.remove()
  }

  return { setOptions, destroy }
}