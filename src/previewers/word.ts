import { extensionFrom } from '../utils/index.js'
import type { Previewer } from './types.js'
import type { FileInput, PreviewOptions, PreviewResult } from '../types.js'
import type { WordFormat, WordResultData } from './result-types.js'

function detectWordFormat(name: string, mimeType: string): WordFormat {
  const extension = extensionFrom(name)

  if (extension === 'docx') return 'docx'
  if (extension === 'docm') return 'docm'
  if (extension === 'dotx') return 'dotx'
  if (extension === 'dotm') return 'dotm'
  if (extension === 'doc') return 'doc'
  if (extension === 'dot') return 'dot'

  if (mimeType.includes('wordprocessingml')) return 'docx'
  return 'doc'
}

export class WordPreviewer implements Previewer {
  readonly name = 'word'
  readonly supportedMimeTypes = [
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.template',
    'application/vnd.ms-word.document.macroEnabled.12',
    'application/vnd.ms-word.template.macroEnabled.12',
  ]

  canPreview(mimeType: string): boolean {
    return (
      mimeType === 'application/msword' ||
      mimeType.includes('wordprocessingml') ||
      mimeType.includes('ms-word')
    )
  }

  async preview(file: FileInput, _options?: PreviewOptions): Promise<PreviewResult> {
    const format = detectWordFormat(file.name, file.mimeType)
    const data: WordResultData = {
      blob: new Blob([file.data], { type: file.mimeType }),
      format,
    }
    return {
      type: 'application/vnd.word',
      data,
    }
  }
}