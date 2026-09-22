export const ROW_HEIGHT = 32

export function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return ''
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  const value = bytes / 1024 ** index
  const text =
    index === 0
      ? `${bytes}`
      : value >= 100
        ? value.toFixed(0)
        : value >= 10
          ? value.toFixed(1)
          : value.toFixed(2)
  return `${text} ${units[index]}`
}

export function iconEl(svg: string, size = 15, color?: string): HTMLSpanElement {
  const span = document.createElement('span')
  span.className = 'pf-icon'
  span.style.cssText =
    `display:inline-flex;width:${size}px;height:${size}px;flex:0 0 ${size}px;` +
    `margin-right:8px;color:${color ?? 'inherit'};`
  span.innerHTML = svg
  return span
}

export function iconButton(icon: string, label: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'pf-ibtn'
  button.title = label
  button.setAttribute('aria-label', label)
  button.appendChild(iconEl(icon, 15))
  button.addEventListener('click', onClick)
  return button
}