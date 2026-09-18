import { extensionFrom } from './extension.js'
import { mimeFromExtension } from './mime.js'

export function detectType(name: string, declaredType?: string): string {
  const declared = declaredType?.trim()
  if (declared && declared !== 'application/octet-stream') {
    return declared
  }

  return mimeFromExtension(extensionFrom(name)) ?? 'application/octet-stream'
}