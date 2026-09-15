import { registerPreviewer } from '../registry.js'

import { ImagePreviewer } from './image.js'
import { TextPreviewer } from './text.js'

registerPreviewer(TextPreviewer)
registerPreviewer(ImagePreviewer)

export { ImagePreviewer } from './image.js'
export { TextPreviewer } from './text.js'