import { createRegistry } from '../utils/index.js'
import type { Previewer, PreviewerConstructor } from './types.js'

const registry = createRegistry<Previewer>({
  getKeys: (previewer) => previewer.supportedMimeTypes,
  canHandle: (previewer, mimeType) => previewer.canPreview(mimeType),
})

export function registerPreviewer(constructor: PreviewerConstructor): void {
  registry.register(new constructor())
}

export function getPreviewer(mimeType: string): Previewer | undefined {
  return registry.get(mimeType)
}

export function clearPreviewers(): void {
  registry.clear()
}