/**
 * Minimal, self-contained typing for the Monaco Editor API surface this package
 * consumes at runtime.
 *
 * Monaco is never statically imported: the AMD build is loaded from a URL at the
 * first code preview (see `monaco-loader.ts`), so there is nothing to bundle and
 * consumers do not install `monaco-editor`. These interfaces describe exactly the
 * runtime shape that build exposes; keep them accurate and in sync with the pinned
 * version in `src/monaco.ts`.
 */

export interface MonacoLanguage {
  readonly id: string
  readonly aliases?: readonly string[]
  readonly extensions?: readonly string[]
  readonly filenames?: readonly string[]
  readonly mimetypes?: readonly string[]
  readonly firstLine?: string
}

export interface MonacoEditorOptions {
  value?: string
  language?: string
  readOnly?: boolean
  theme?: string
  automaticLayout?: boolean
  fontSize?: number
  fontFamily?: string
  wordWrap?: 'on' | 'off'
  minimap?: { enabled?: boolean }
  folding?: boolean
  glyphMargin?: boolean
  lineNumbers?: 'on' | 'off'
  scrollBeyondLastLine?: boolean
  contextmenu?: boolean
  renderLineHighlight?: 'all' | 'line' | 'none' | 'gutter'
  tabSize?: number
  detectIndentation?: boolean
}

export interface MonacoEditorAction {
  isSupported(): boolean
  run(): void
}

export interface MonacoToken {
  readonly offset: number
  readonly type: string
  readonly language: string
}

export interface MonacoEditor {
  create(container: HTMLElement, options: MonacoEditorOptions): MonacoEditorInstance
  getModels(): readonly MonacoTextModel[]
  /** Tokenize `text` as `languageId`; offsets are relative to each line. */
  tokenize(text: string, languageId: string): MonacoToken[][]
}

export interface MonacoTextModel {
  dispose(): void
  getLinesContent(): readonly string[]
  getLineCount(): number
  getLanguageId(): string
}

export interface MonacoEditorInstance {
  updateOptions(options: Partial<MonacoEditorOptions>): void
  dispose(): void
  focus(): void
  getAction(id: string): MonacoEditorAction | null
  layout(dimension?: { width: number; height: number }): void
  getModel(): MonacoTextModel | null
}

export interface MonacoLanguages {
  getLanguages(): MonacoLanguage[]
}

export interface MonacoGlobal {
  readonly editor: MonacoEditor
  readonly languages: MonacoLanguages
}