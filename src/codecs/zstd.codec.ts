import type { Zstd } from '@hpcc-js/wasm-zstd';
import type { Codec, Encoder } from './codec.interface.js';

export function createZstdCodec(zstd: Zstd): () => Codec {
  return () => ({
    async compress(encoder: Encoder): Promise<Buffer> {
      return Buffer.from(zstd.compress(encoder.buffer));
    },

    async decompress(buffer: Buffer): Promise<Buffer> {
      return Buffer.from(zstd.decompress(buffer));
    },
  });
}
