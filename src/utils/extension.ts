/** Lowercased file extension from a path/name, or `''` when there is none. */
export function extensionFrom(name: string): string {
  const lastDot = name.lastIndexOf('.')
  return lastDot > 0 ? name.slice(lastDot + 1).toLowerCase() : ''
}