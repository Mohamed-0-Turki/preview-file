import type { PreviewOptions, PreviewResult } from '../types.js'
import type { PreviewAdapter } from '../controls/types.js'

export interface Renderer {
  readonly name: string
  readonly supportedTypes: readonly string[]
  canRender(type: string): boolean
  render(
    container: HTMLElement,
    result: PreviewResult,
    options?: PreviewOptions
  ): PreviewAdapter | void | Promise<PreviewAdapter | void>
  destroy?(container: HTMLElement): void
}