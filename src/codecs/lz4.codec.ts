import { type DecoderOptions, type EncoderOptions } from 'lz4';
import type { Codec, Encoder } from './codec.interface.js';

interface LZ4 {
  decode(input: Buffer, options?: DecoderOptions): Buffer;
  encode(input: Buffer, options?: EncoderOptions): Buffer;
}

export function createLz4Codec(lz4: LZ4): () => Codec {
  return () => ({
    async compress(encoder: Encoder): Promise<Buffer> {
      return lz4.encode(encoder.buffer);
    },

    async decompress(buffer: Buffer): Promise<Buffer> {
      return lz4.decode(buffer);
    },
  });
}
