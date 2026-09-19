import { canMonacoPreview } from './monaco-capabilities.js'

const EXTENSION_TO_MIME: Readonly<Record<string, string>> = {
  txt: 'text/plain',
  csv: 'text/csv',
  md: 'text/markdown',
  markdown: 'text/markdown',
  mdx: 'text/mdx',
  js: 'text/javascript',
  mjs: 'text/javascript',
  cjs: 'text/javascript',
  jsx: 'text/javascript',
  ts: 'application/typescript',
  mts: 'application/typescript',
  cts: 'application/typescript',
  tsx: 'application/typescript',
  json: 'application/json',
  jsonc: 'application/json',
  json5: 'application/json',
  html: 'text/html',
  htm: 'text/html',
  css: 'text/css',
  scss: 'text/x-scss',
  sass: 'text/x-scss',
  less: 'text/x-less',
  py: 'text/x-python',
  pyw: 'text/x-python',
  java: 'text/x-java-source',
  c: 'text/x-csrc',
  h: 'text/x-csrc',
  cpp: 'text/x-c++src',
  cc: 'text/x-c++src',
  cxx: 'text/x-c++src',
  'c++': 'text/x-c++src',
  hpp: 'text/x-c++src',
  hh: 'text/x-c++src',
  hxx: 'text/x-c++src',
  go: 'text/x-go',
  rs: 'text/x-rustsrc',
  rb: 'text/x-ruby',
  php: 'text/x-php',
  sql: 'text/sql',
  sh: 'text/x-sh',
  bash: 'text/x-sh',
  zsh: 'text/x-sh',
  yaml: 'text/x-yaml',
  yml: 'text/x-yaml',
  xml: 'text/xml',
  xsd: 'text/xml',
  xsl: 'text/xml',
  plist: 'text/xml',
  toml: 'text/toml',
  ini: 'text/x-ini',
  cfg: 'text/x-ini',
  conf: 'text/x-ini',
  properties: 'text/x-ini',
  kt: 'text/x-kotlin',
  kts: 'text/x-kotlin',
  swift: 'text/x-swift',
  m: 'text/x-objectivec',
  mm: 'text/x-objectivec',
  scala: 'text/x-scala',
  dart: 'text/x-dart',
  lua: 'text/x-lua',
  pl: 'text/x-perl',
  pm: 'text/x-perl',
  r: 'text/x-r',
  cs: 'text/x-csharp',
  fs: 'text/x-fsharp',
  vb: 'text/x-vb',
  hs: 'text/x-haskell',
  ex: 'text/x-elixir',
  exs: 'text/x-elixir',
  erl: 'text/x-erl',
  clj: 'text/x-clojure',
  cljs: 'text/x-clojure',
  cljc: 'text/x-clojure',
  coffee: 'text/x-coffeescript',
  groovy: 'text/x-groovy',
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  docm: 'application/vnd.ms-word.document.macroEnabled.12',
  dot: 'application/msword',
  dotx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.template',
  dotm: 'application/vnd.ms-word.template.macroEnabled.12',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xlsm: 'application/vnd.ms-excel.sheet.macroEnabled.12',
  xlsb: 'application/vnd.ms-excel.sheet.binary.macroEnabled.12',
  xlt: 'application/vnd.ms-excel',
  xltx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.template',
  xltm: 'application/vnd.ms-excel.template.macroEnabled.12',
  pot: 'application/vnd.ms-powerpoint',
  potx: 'application/vnd.openxmlformats-officedocument.presentationml.template',
  potm: 'application/vnd.ms-powerpoint.template.macroEnabled.12',
  pps: 'application/vnd.ms-powerpoint',
  ppsx: 'application/vnd.openxmlformats-officedocument.presentationml.slideshow',
  ppsm: 'application/vnd.ms-powerpoint.slideshow.macroEnabled.12',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  pptm: 'application/vnd.ms-powerpoint.presentation.macroEnabled.12',
  odp: 'application/vnd.oasis.opendocument.presentation',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  avif: 'image/avif',
  bmp: 'image/bmp',
  apng: 'image/apng',
}

export function mimeFromExtension(extension: string): string | undefined {
  return EXTENSION_TO_MIME[extension.toLowerCase()]
}

/** Extension-less names that are recognized source files. Keyed by lowercase
 *  name, just like `EXTENSION_TO_MIME`. */
const FILENAME_TO_MIME: Readonly<Record<string, string>> = {
  dockerfile: 'text/x-dockerfile',
  'dockerfile.dev': 'text/x-dockerfile',
  makefile: 'text/x-makefile',
  'cmakelists.txt': 'text/x-cmake',
  'tsconfig.json': 'text/json',
  'tsconfig.base.json': 'text/json',
  'package.json': 'text/json',
  '.babelrc': 'text/json',
  '.eslintrc': 'text/json',
  '.prettierrc': 'text/json',
  '.gitignore': 'text/x-ini',
  '.gitattributes': 'text/x-ini',
  '.dockerignore': 'text/x-ini',
  '.editorconfig': 'text/x-ini',
  '.env': 'text/x-ini',
  '.npmrc': 'text/x-ini',
  '.yarnrc': 'text/x-ini',
  procfile: 'text/x-ini',
  gemfile: 'text/x-ruby',
  rake: 'text/x-ruby',
  vagrantfile: 'text/x-ruby',
}

export function mimeFromFilename(name: string): string | undefined {
  return FILENAME_TO_MIME[name.toLowerCase()]
}

/** MIME types recognized as source code (Monaco preview). Pure `text/plain`
 *  is intentionally absent so plain-text files stay on the text renderer, and
 *  `text/markdown` is owned by the dedicated Markdown preview (see
 *  `src/previewers/markdown.ts`). These are also the registry's exact-match
 *  keys for the code previewer; everything else Monaco knows is claimed by the
 *  capability-aware fallback (see `src/utils/monaco-capabilities.ts`). */
export const CODE_MIME_TYPES: readonly string[] = [
  'text/javascript',
  'application/javascript',
  'application/x-javascript',
  'application/typescript',
  'application/json',
  'application/x-json',
  'text/json',
  'text/html',
  'text/css',
  'text/mdx',
  'text/toml',
  'text/sql',
  'text/xml',
  'application/xml',
]

const CODE_MIME_SET = new Set(CODE_MIME_TYPES)

/** Is this MIME type one the code previewer should own? The registry routes the
 *  common code MIMEs above by exact key; `isCodeMime` stays as the
 *  MIME-only view of the same capability check used when the file name is
 *  available (see `canMonacoPreview`). */
export function isCodeMime(mimeType: string): boolean {
  return CODE_MIME_SET.has(mimeType) || canMonacoPreview('', mimeType)
}