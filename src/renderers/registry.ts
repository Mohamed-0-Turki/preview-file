import { createRegistry } from '../utils/index.js'
import type { Renderer } from './types.js'

const registry = createRegistry<Renderer>({
  getKeys: (renderer) => renderer.supportedTypes,
  canHandle: (renderer, type) => renderer.canRender(type),
})

export function registerRenderer(constructor: new () => Renderer): void {
  registry.register(new constructor())
}

export function getRenderer(type: string): Renderer | undefined {
  return registry.get(type)
}

export function clearRenderers(): void {
  registry.clear()
}