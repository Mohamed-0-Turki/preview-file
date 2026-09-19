import type { PreviewOptions } from './types.js'

/** Pinned against the `monaco-editor` devDependency so the CDN build and the
 *  types this package is verified against can never drift. */
const MONACO_VERSION = '0.56.0'

const CDN_BASE = `https://cdn.jsdelivr.net/npm/monaco-editor@${MONACO_VERSION}/min`

let customBaseUrl: string | undefined

/**
 * Set the base URL of the Monaco Editor AMD build that source-code previews
 * load at runtime.
 *
 * The library ships with a version-pinned copy of the AMD build hosted on a
 * public CDN, so code previews work out of the box in any bundler without
 * extra configuration. Call this when you need to control where Monaco comes
 * from:
 *
 * - self-host the `min/` directory of `monaco-editor` in your own static
 *   assets (recommended for production, and required behind a CSP that blocks
 *   third-party scripts), or
 * - an offline/air-gapped environment that cannot reach a CDN.
 *
 * The value is the URL of the `min/` directory of the npm package — that is,
 * a folder containing `vs/loader.js` and `vs/editor/editor.main.js`. Monaco is
 * only fetched from this URL the first time a code file is actually previewed.
 *
 * This is a global setting; it affects every subsequent code preview in the
 * page. It can be overridden per preview with `PreviewOptions.monaco.baseUrl`.
 */
export function setMonacoBaseUrl(url: string): void {
  customBaseUrl = url.replace(/\/$/, '')
}

/**
 * Resolve the AMD base URL to use for a preview. Precedence:
 * 1. `options.monaco.baseUrl` (per-preview override)
 * 2. `setMonacoBaseUrl(...)` (global override)
 * 3. A version-pinned CDN build matching the `monaco-editor` this package was
 *    verified against.
 */
export function resolveMonacoBaseUrl(options?: PreviewOptions): string {
  if (options?.monaco?.baseUrl) return options.monaco.baseUrl.replace(/\/$/, '')
  if (customBaseUrl) return customBaseUrl
  return CDN_BASE
}