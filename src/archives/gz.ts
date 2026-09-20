import { gunzipSync } from 'fflate'
import { CompressedProvider } from './compressed.js'
import type { ArchiveFormat } from './types.js'

/** gzip-backed provider (\`.gz\` and \`.tgz\`/\`.tar.gz\`). Decompression is
 *  synchronous via fflate; tar-vs-single-file sniffing lives in the shared
 *  {@link CompressedProvider}. */
export class GzProvider extends CompressedProvider {
  private readonly bytes: Uint8Array

  constructor(bytes: Uint8Array, format: 'gz' | 'tgz', innerName: string) {
    super(format, innerName)
    this.bytes = bytes
  }

  protected decompress(): Uint8Array {
    return gunzipSync(this.bytes)
  }
}

export type { ArchiveFormat }