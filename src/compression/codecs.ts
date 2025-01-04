import { Zstd } from '@hpcc-js/wasm-zstd';
import createSnappy from 'kafkajs-snappy';
import { decode, encode } from 'lz4';

interface Encoder {
  buffer: Buffer;
}

export interface Codec {
  compress(encoder: Encoder): Promise<Buffer>;
  decompress(buffer: Buffer): Promise<Buffer>;
}

type CodecType = 'LZ4' | 'SNAPPY' | 'ZSTD';

let zstdInstance: Zstd | null = null;

export async function createKafkaCodec(codec: CodecType): Promise<Codec> {
  switch (codec) {
    case 'LZ4':
      return {
        async compress(encoder: Encoder): Promise<Buffer> {
          return Buffer.from(encode(encoder.buffer));
        },
        async decompress(buffer: Buffer): Promise<Buffer> {
          return Buffer.from(decode(buffer));
        },
      };

    case 'SNAPPY':
      return createSnappy();

    case 'ZSTD': {
      if (zstdInstance) {
        throw new Error('Zstd instance is already loaded.');
      }

      zstdInstance = await Zstd.load();
      const zstd = zstdInstance;

      return {
        async compress(encoder: Encoder): Promise<Buffer> {
          return Buffer.from(zstd.compress(encoder.buffer));
        },
        async decompress(buffer: Buffer): Promise<Buffer> {
          return Buffer.from(zstd.decompress(buffer));
        },
      };
    }

    default:
      throw new Error(`Unsupported codec: ${codec}`);
  }
}
