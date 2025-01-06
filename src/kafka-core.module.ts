import { Module, type DynamicModule, type OnApplicationShutdown, type Provider } from '@nestjs/common';
import { CompressionCodecs, CompressionTypes } from 'kafkajs';
import { createKafkaCodec, type Codec } from './compression/codecs.js';
import type { KafkaModuleAsyncOptions } from './kafka-options.types.js';
import { LZ4_CODEC, SNAPPY_CODEC, ZSTD_CODEC } from './kafka.constants.js';

// @Global()
@Module({})
export class KafkaCoreModule implements OnApplicationShutdown {
  constructor() {}

  static forRootAsync(options: KafkaModuleAsyncOptions): DynamicModule {
    // TODO ajouter un provider pour l'instance
    // kafkajs comme ca quand confluent
    // proposera le sien
    // que un seul endroit a changer ?
    // je veux 2 instances differente de toute facon
    // SAUF SI JUTILISE UNE INTERFACE ???? OUI!
    // TROUVER UNE SOLUTION
    const lz4CodecProvider: Provider = {
      provide: LZ4_CODEC,
      useFactory: async (): Promise<Codec> => {
        const lz4Codec = await createKafkaCodec('LZ4');

        CompressionCodecs[CompressionTypes.LZ4] = (): Codec => lz4Codec;

        return lz4Codec;
      },
    };

    const snappyCodecProvider: Provider = {
      provide: SNAPPY_CODEC,
      useFactory: async (): Promise<Codec> => {
        const snappyCodec = await createKafkaCodec('SNAPPY');

        CompressionCodecs[CompressionTypes.Snappy] = (): Codec => snappyCodec;

        return snappyCodec;
      },
    };

    const zstdCodecProvider: Provider = {
      provide: ZSTD_CODEC,
      useFactory: async (): Promise<Codec> => {
        const zstdCodec = await createKafkaCodec('ZSTD');

        CompressionCodecs[CompressionTypes.ZSTD] = (): Codec => zstdCodec;

        return zstdCodec;
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
