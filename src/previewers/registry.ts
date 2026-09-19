import { createRegistry } from '../utils/index.js'
import type { Previewer, PreviewerConstructor } from './types.js'

const registry = createRegistry<Previewer, string>({
  getKeys: (previewer) => previewer.supportedMimeTypes,
  canHandle: (previewer, mimeType, name) => previewer.canPreview(mimeType, name),
})

export function registerPreviewer(constructor: PreviewerConstructor): void {
  registry.register(new constructor())
}

export function getPreviewer(mimeType: string, name?: string): Previewer | undefined {
  return registry.get(mimeType, name)
}

export function clearPreviewers(): void {
  registry.clear()
}