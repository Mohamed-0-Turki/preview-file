import { mimeFromExtension } from './mime.js'

export function detectType(name: string, declaredType?: string): string {
  const declared = declaredType?.trim()
  if (declared && declared !== 'application/octet-stream') {
    return declared
  }

  const lastDot = name.lastIndexOf('.')
  const extension = lastDot > 0 ? name.slice(lastDot + 1) : ''

  return mimeFromExtension(extension) ?? 'application/octet-stream'
}