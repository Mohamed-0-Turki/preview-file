import type { Renderer } from './types.js'

const renderers = new Map<string, Renderer>()

export function registerRenderer(constructor: new () => Renderer): void {
  const instance = new constructor()
  for (const type of instance.supportedTypes) {
    renderers.set(type, instance)
  }
}

export function getRenderer(type: string): Renderer | undefined {
  const exact = renderers.get(type)
  if (exact) return exact

  for (const renderer of renderers.values()) {
    if (renderer.canRender(type)) return renderer
  }

  return undefined
}

export function clearRenderers(): void {
  renderers.clear()
}