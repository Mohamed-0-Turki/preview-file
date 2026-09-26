/**
 * An ES module shim for JSZip, which ships CommonJS only.
 *
 * `docx-preview` is published as ESM but imports JSZip's default export, so a page
 * that loads it directly has to supply the interop a bundler would normally do.
 * The UMD bundle assigns `window.JSZip`, so loading it as a classic script and
 * re-exporting the global is the smallest thing that satisfies the import.
 */
const SOURCE = '/node_modules/jszip/dist/jszip.js'

await new Promise((resolve, reject) => {
  const script = document.createElement('script')
  script.src = SOURCE
  script.onload = resolve
  script.onerror = () => reject(new Error(`could not load ${SOURCE}`))
  document.head.appendChild(script)
})

if (!globalThis.JSZip) throw new Error(`${SOURCE} did not define JSZip`)

export default globalThis.JSZip
