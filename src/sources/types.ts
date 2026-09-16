export type SourceInput = File | Blob | string

export interface ResolvedSource {
  readonly name: string
  readonly blob: Blob
}