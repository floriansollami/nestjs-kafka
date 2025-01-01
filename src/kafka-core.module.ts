import { Zstd } from '@hpcc-js/wasm-zstd';
import {
  Module,
  type DynamicModule,
  type OnApplicationShutdown,
  type Provider,
} from '@nestjs/common';
import { CompressionCodecs, CompressionTypes } from 'kafkajs';
import SnappyCodec from 'kafkajs-snappy';
import { decode, encode } from 'lz4';
import { createLz4Codec, createZstdCodec, type Codec } from './codecs/index.js';
import type { KafkaModuleAsyncOptions } from './kafka-options.types.js';
import { LZ4_CODEC, SNAPPY_CODEC, ZSTD_CODEC } from './kafka.constants.js';

// @Global()
@Module({})
export class KafkaCoreModule implements OnApplicationShutdown {
  constructor() {}

  static forRootAsync(options: KafkaModuleAsyncOptions): DynamicModule {
    const lz4CodecProvider: Provider = {
      provide: LZ4_CODEC,
      useFactory: async (): Promise<Codec> => {
        const lz4Codec = createLz4Codec({ encode, decode });

        CompressionCodecs[CompressionTypes.LZ4] = lz4Codec;

        return lz4Codec();
      },
    };

    const snappyCodecProvider: Provider = {
      provide: SNAPPY_CODEC,
      useFactory: async (): Promise<Codec> => {
        CompressionCodecs[CompressionTypes.Snappy] = SnappyCodec;

        return SnappyCodec();
      },
    };

    const zstdCodecProvider: Provider = {
      provide: ZSTD_CODEC,
      useFactory: async (): Promise<Codec> => {
        const zstd = await Zstd.load();
        const zstdCodec = createZstdCodec(zstd);

        CompressionCodecs[CompressionTypes.ZSTD] = zstdCodec;

        return zstdCodec();
      },
    };

    return {
      module: KafkaCoreModule,
      imports: options.imports,
      providers: [lz4CodecProvider, snappyCodecProvider, zstdCodecProvider],
      exports: [],
    };
  }

  async onApplicationShutdown(): Promise<void> {}
}
