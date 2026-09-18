import { extensionFrom } from '../utils/index.js'
import type { Previewer } from './types.js'
import type { FileInput, PreviewOptions, PreviewResult } from '../types.js'
import type { PresentationFormat, PresentationResultData } from './result-types.js'

function detectPresentationFormat(name: string, mimeType: string): PresentationFormat {
  const extension = extensionFrom(name)

  switch (extension) {
    case 'pptx':
    case 'pptm':
    case 'potx':
    case 'potm':
    case 'ppsx':
    case 'ppsm':
    case 'ppt':
    case 'pps':
    case 'pot':
    case 'odp':
      return extension
    default:
      break
  }

  if (mimeType.includes('presentationml')) return 'pptx'
  if (mimeType === 'application/vnd.oasis.opendocument.presentation') return 'odp'
  return 'ppt'
}

export class PresentationPreviewer implements Previewer {
  readonly name = 'presentation'
  readonly supportedMimeTypes = [
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.openxmlformats-officedocument.presentationml.template',
    'application/vnd.openxmlformats-officedocument.presentationml.slideshow',
    'application/vnd.ms-powerpoint.presentation.macroEnabled.12',
    'application/vnd.ms-powerpoint.template.macroEnabled.12',
    'application/vnd.ms-powerpoint.slideshow.macroEnabled.12',
    'application/vnd.oasis.opendocument.presentation',
  ]

  canPreview(mimeType: string): boolean {
    return (
      mimeType === 'application/vnd.ms-powerpoint' ||
      mimeType === 'application/vnd.oasis.opendocument.presentation' ||
      mimeType.includes('presentationml')
    )
  }

  async preview(file: FileInput, _options?: PreviewOptions): Promise<PreviewResult> {
    const format = detectPresentationFormat(file.name, file.mimeType)
    const data: PresentationResultData = {
      blob: new Blob([file.data], { type: file.mimeType }),
      format,
    }
    return {
      type: 'application/vnd.presentation',
      data,
    }
  }
}