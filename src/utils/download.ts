/** Trigger a browser download of `blob` under `name`. Lives in `utils` (not
 *  `controls`) so renderers — which must not runtime-import from the control
 *  layer — can offer per-file downloads inside their own UI. */
export function downloadBlob(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)

  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name

  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()

  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}