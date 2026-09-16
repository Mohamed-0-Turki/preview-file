export interface ZoomableOptions {
  readonly minScale?: number
  readonly maxScale?: number
  readonly step?: number
  readonly transitionMs?: number
}

export interface Zoomable {
  readonly scale: number
  /** Current rotation in degrees, normalized to [0, 360). */
  readonly rotation: number
  setRotation(degrees: number): void
  zoomIn(): void
  zoomOut(): void
  resetZoom(): void
  destroy(): void
}

const DEFAULT_MIN_SCALE = 1
const DEFAULT_MAX_SCALE = 8
const DEFAULT_STEP = 1.25
const DEFAULT_TRANSITION_MS = 150
const DOUBLE_CLICK_WINDOW_MS = 300
const CLICK_MOVE_TOLERANCE = 3
const DOUBLE_CLICK_POSITION_TOLERANCE = 8

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function normalizeDegrees(degrees: number): number {
  return ((degrees % 360) + 360) % 360
}

/** Rotate a point around the origin (matching the CSS `rotate()` transform). */
function rotatePoint(x: number, y: number, degrees: number): [number, number] {
  const radians = (normalizeDegrees(degrees) * Math.PI) / 180
  const sin = Math.sin(radians)
  const cos = Math.cos(radians)
  return [x * cos - y * sin, x * sin + y * cos]
}

export function createZoomable(
  viewport: HTMLElement,
  content: HTMLElement,
  options: ZoomableOptions = {}
): Zoomable {
  const minScale = options.minScale ?? DEFAULT_MIN_SCALE
  const maxScale = options.maxScale ?? DEFAULT_MAX_SCALE
  const step = options.step ?? DEFAULT_STEP
  const transitionMs = options.transitionMs ?? DEFAULT_TRANSITION_MS

  let scale = 1
  let rotation = 0
  let translateX = 0
  let translateY = 0

  let dragging = false
  let moved = false
  let startClientX = 0
  let startClientY = 0
  let dragOriginX = 0
  let dragOriginY = 0

  let lastClickTime = 0
  let lastClickX = 0
  let lastClickY = 0
  let transitionTimer: number | undefined

  content.style.transformOrigin = '0 0'
  content.style.transform = `translate(0px, 0px) rotate(${rotation}deg) scale(1)`
  content.style.touchAction = 'none'
  content.style.userSelect = 'none'

  function applyTransform(): void {
    content.style.transform = `translate(${translateX}px, ${translateY}px) rotate(${rotation}deg) scale(${scale})`
  }

  /** Translate values that keep the content centered at the given scale. When
   *  the image is rotated the origin-relative rotation shifts the visual box,
   *  so centering is no longer `translate(0, 0)`. Handles arbitrary degrees. */
  function centeredTranslation(nextScale: number): [number, number] {
    const width = content.offsetWidth
    const height = content.offsetHeight
    const [rotatedCenterX, rotatedCenterY] = rotatePoint(
      (width / 2) * nextScale,
      (height / 2) * nextScale,
      rotation
    )
    return [width / 2 - rotatedCenterX, height / 2 - rotatedCenterY]
  }

  function clampTranslate(x: number, y: number, nextScale: number): void {
    const viewportWidth = viewport.clientWidth
    const viewportHeight = viewport.clientHeight
    const [centerX, centerY] = centeredTranslation(nextScale)
    const radians = (rotation * Math.PI) / 180
    const absSin = Math.abs(Math.sin(radians))
    const absCos = Math.abs(Math.cos(radians))
    const contentWidth = (absCos * content.offsetWidth + absSin * content.offsetHeight) * nextScale
    const contentHeight = (absSin * content.offsetWidth + absCos * content.offsetHeight) * nextScale
    const maxX = Math.max(0, (contentWidth - viewportWidth) / 2)
    const maxY = Math.max(0, (contentHeight - viewportHeight) / 2)
    translateX = clamp(x, centerX - maxX, centerX + maxX)
    translateY = clamp(y, centerY - maxY, centerY + maxY)
  }

  function setRotation(nextDegrees: number): void {
    const next = normalizeDegrees(nextDegrees)
    if (next === rotation) return
    content.style.transition = ''
    window.clearTimeout(transitionTimer)
    rotation = next
    clampTranslate(translateX, translateY, scale)
    applyTransform()
    updateCursor()
  }

  function setScale(nextScale: number, anchorX?: number, anchorY?: number): void {
    const ratio = nextScale / scale
    if (ratio !== 1 && anchorX !== undefined && anchorY !== undefined) {
      /* Keep the point under the anchor stationary. The transform is
       * `translate * rotate * scale` about the content's layout origin, so a
       * local point `p` lands at `o + translate + rotate(scale · p)` where `o`
       * is the flex/computed layout offset. Solving for the new translate is
       * exact for any rotation. */
      const factor = 1 - ratio
      translateX = translateX + factor * (anchorX - content.offsetLeft - translateX)
      translateY = translateY + factor * (anchorY - content.offsetTop - translateY)
    }
    scale = nextScale
    clampTranslate(translateX, translateY, scale)
    applyTransform()
    updateCursor()
  }

  function zoomAt(anchorX: number, anchorY: number): void {
    const target = clamp(scale * step, minScale, maxScale)
    if (target === scale) return
    withTransition(() => setScale(target, anchorX, anchorY))
  }

  function zoomAround(targetScale: number): void {
    const target = clamp(targetScale, minScale, maxScale)
    withTransition(() => setScale(target, viewport.clientWidth / 2, viewport.clientHeight / 2))
  }

  function updateCursor(): void {
    content.style.cursor = scale > minScale ? (dragging ? 'grabbing' : 'grab') : 'zoom-in'
  }

  function withTransition(action: () => void): void {
    content.style.transition = `transform ${transitionMs}ms cubic-bezier(0.2, 0, 0, 1)`
    window.clearTimeout(transitionTimer)
    transitionTimer = window.setTimeout(() => {
      content.style.transition = ''
    }, transitionMs)
    action()
  }

  function anchorFromEvent(event: PointerEvent): { x: number; y: number } {
    const rect = viewport.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  function onPointerDown(event: PointerEvent): void {
    if (event.button !== 0) return
    dragging = true
    moved = false
    startClientX = event.clientX
    startClientY = event.clientY
    dragOriginX = translateX
    dragOriginY = translateY
    content.style.transition = ''
    content.setPointerCapture(event.pointerId)
    updateCursor()
    event.preventDefault()
  }

  function onPointerMove(event: PointerEvent): void {
    if (!dragging) return
    const deltaX = event.clientX - startClientX
    const deltaY = event.clientY - startClientY
    if (!moved && (Math.abs(deltaX) > CLICK_MOVE_TOLERANCE || Math.abs(deltaY) > CLICK_MOVE_TOLERANCE)) {
      moved = true
    }
    if (!moved) return
    translateX = dragOriginX + deltaX
    translateY = dragOriginY + deltaY
    clampTranslate(translateX, translateY, scale)
    applyTransform()
  }

  function onPointerUp(event: PointerEvent): void {
    if (!dragging) return
    dragging = false
    const wasMove = moved
    moved = false
    updateCursor()
    if (wasMove || scale >= maxScale) return

    const { x, y } = anchorFromEvent(event)
    const now = Date.now()
    if (
      now - lastClickTime <= DOUBLE_CLICK_WINDOW_MS &&
      Math.abs(x - lastClickX) <= DOUBLE_CLICK_POSITION_TOLERANCE &&
      Math.abs(y - lastClickY) <= DOUBLE_CLICK_POSITION_TOLERANCE
    ) {
      lastClickTime = 0
      lastClickX = 0
      lastClickY = 0
    } else {
      lastClickTime = now
      lastClickX = x
      lastClickY = y
      zoomAt(x, y)
    }
  }

  function onPointerCancel(): void {
    dragging = false
    moved = false
    updateCursor()
  }

  function resetZoom(): void {
    withTransition(() => setScale(minScale))
  }

  function zoomIn(): void {
    zoomAround(scale * step)
  }

  function zoomOut(): void {
    zoomAround(scale / step)
  }

  function onDoubleClick(): void {
    resetZoom()
  }

  content.addEventListener('pointerdown', onPointerDown)
  content.addEventListener('pointermove', onPointerMove)
  content.addEventListener('pointerup', onPointerUp)
  content.addEventListener('pointercancel', onPointerCancel)
  content.addEventListener('dblclick', onDoubleClick)

  function destroy(): void {
    window.clearTimeout(transitionTimer)
    content.removeEventListener('pointerdown', onPointerDown)
    content.removeEventListener('pointermove', onPointerMove)
    content.removeEventListener('pointerup', onPointerUp)
    content.removeEventListener('pointercancel', onPointerCancel)
    content.removeEventListener('dblclick', onDoubleClick)
  }

  return {
    get scale() {
      return scale
    },
    get rotation() {
      return rotation
    },
    setRotation,
    zoomIn,
    zoomOut,
    resetZoom,
    destroy,
  }
}