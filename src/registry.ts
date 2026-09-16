import type { Previewer } from './previewer.js'
import type { PreviewerConstructor } from './types.js'

const previewers = new Map<string, Previewer>()

export function registerPreviewer(constructor: PreviewerConstructor): void {
  const instance = new constructor()
  for (const mimeType of instance.supportedMimeTypes) {
    previewers.set(mimeType, instance)
  }
}

export function getPreviewer(mimeType: string): Previewer | undefined {
  const exact = previewers.get(mimeType)
  if (exact) return exact

  for (const previewer of previewers.values()) {
    if (previewer.canPreview(mimeType)) return previewer
  }

  return undefined
}

export function clearPreviewers(): void {
  previewers.clear()
}