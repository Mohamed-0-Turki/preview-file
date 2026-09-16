import type { ResolvedSource, SourceInput } from './types.js'

function nameFromUrl(url: string): string {
  if (url.startsWith('data:') || url.startsWith('blob:')) {
    return 'file'
  }

  try {
    const segments = new URL(url).pathname.split('/').filter(Boolean)
    if (segments.length > 0) {
      return decodeURIComponent(segments[segments.length - 1] as string)
    }
  } catch {
    // relative or malformed URL; fall through
  }

  const match = /[^/?#]+$/.exec(url)
  if (match) {
    return decodeURIComponent(match[0])
  }

  return 'file'
}

async function fromUrl(url: string): Promise<ResolvedSource> {
  let response: Response
  try {
    response = await fetch(url)
  } catch (error) {
    throw new Error(`Failed to fetch "${url}": ${(error as Error).message}`)
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch "${url}": ${response.status} ${response.statusText}`)
  }

  const buffer = await response.arrayBuffer()
  const contentType = response.headers.get('content-type')?.split(';')[0]?.trim()

  return {
    name: nameFromUrl(url),
    blob: new Blob([buffer], { type: contentType ?? undefined }),
  }
}

export async function createSource(input: SourceInput): Promise<ResolvedSource> {
  if (typeof input === 'string') {
    return fromUrl(input)
  }

  if (input instanceof File) {
    return { name: input.name, blob: input }
  }

  if (input instanceof Blob) {
    return { name: 'file', blob: input }
  }

  throw new Error('Unsupported file source')
}