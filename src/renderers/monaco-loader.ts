import { resolveMonacoBaseUrl } from '../monaco.js'
import type { PreviewOptions } from '../types.js'
import type { MonacoGlobal } from './monaco-types.js'

interface AMDRequire {
  (deps: readonly string[], ready: () => void, errback?: (error: unknown) => void): void
  config(config: Record<string, unknown>): void
}

declare global {
  interface Window {
    /** AMD loader installed by `vs/loader.js`. */
    require?: AMDRequire
    /** Global namespace set by `vs/editor/editor.main`. */
    monaco?: MonacoGlobal
  }
}

let monacoPromise: Promise<MonacoGlobal> | undefined

/**
 * Load the Monaco Editor AMD build from the resolved base URL and resolve with
 * the `monaco` global. The result is cached module-wide; a failed load resets
 * the cache so a later preview can retry. Monaco is never fetched before the
 * first code preview calls `render()`.
 */
export function loadMonaco(options?: PreviewOptions): Promise<MonacoGlobal> {
  if (monacoPromise) return monacoPromise
  monacoPromise = loadMonacoOnce(options)
  monacoPromise.catch(() => {
    monacoPromise = undefined
  })
  return monacoPromise
}

function injectScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve()
      return
    }
    const script = document.createElement('script')
    script.src = src
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => {
      script.remove()
      reject(new Error(`Monaco loader could not be loaded from ${src}`))
    }
    document.head.appendChild(script)
  })
}

async function loadMonacoOnce(options?: PreviewOptions): Promise<MonacoGlobal> {
  if (window.monaco) return window.monaco

  const base = resolveMonacoBaseUrl(options)
  await injectScript(`${base}/vs/loader.js`)

  const require = window.require
  if (typeof require !== 'function') {
    throw new Error('Monaco AMD loader (require) is not available after loading the loader script.')
  }
  require.config({
    /* Points the AMD loader at the CDN folder so the editor's own skeleton
       (CSS link, worker URLs) resolves against the same origin as the code. */
    baseUrl: base,
    paths: { vs: `${base}/vs` },
  })

  await new Promise<void>((resolve, reject) => {
    require(
      ['vs/editor/editor.main'],
      () => resolve(),
      (error) =>
        reject(error instanceof Error ? error : new Error('Monaco editor failed to load.'))
    )
  })

  if (!window.monaco) {
    throw new Error('Monaco editor loaded but did not expose the monaco global.')
  }
  return window.monaco
}