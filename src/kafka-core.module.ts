import { Module, type DynamicModule, type OnApplicationShutdown, type Provider } from '@nestjs/common';
import { CompressionCodecs, CompressionTypes } from 'kafkajs';
import { createKafkaCodec, type Codec } from './compression/codecs.js';
import type { KafkaModuleAsyncOptions, KafkaModuleOptions } from './kafka-options.types.js';
import { CORE_MODULE_OPTIONS, KAFKA_SERVER, KAFKA_SERVICE, LZ4_CODEC, SNAPPY_CODEC, ZSTD_CODEC } from './kafka.constants.js';
import { KafkaServer } from './server/kafka-server.js';
import { KafkaClient } from './client/kafka-client.js';
import { MessageService } from './client/message-service.interface.js';
import { CustomTransportStrategy } from '@nestjs/microservices';

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

    const coreModuleOptionsProvider: Provider = {
      provide: CORE_MODULE_OPTIONS,
      useFactory: options.useFactory,
      inject: options.inject ?? [],
    };

    const serverTemp = {
      provide: KAFKA_SERVER,
      useFactory: async (options: KafkaModuleOptions): Promise<CustomTransportStrategy> => {
        return new KafkaServer({
          kafka: options.config,
          postfixId: options.postfixId,
        });
      },
      inject: [CORE_MODULE_OPTIONS],
    };

    const clientTemp = {
      provide: KAFKA_SERVICE,
      useFactory: async (options: KafkaModuleOptions): Promise<MessageService> => {
        return new KafkaClient({
          kafka: options.config,
          postfixId: options.postfixId,
        });
      },
      inject: [CORE_MODULE_OPTIONS],
    };

    return {
      module: KafkaCoreModule,
      imports: options.imports,
      providers: [coreModuleOptionsProvider, snappyCodecProvider, zstdCodecProvider, lz4CodecProvider, serverTemp, clientTemp],
      exports: [CORE_MODULE_OPTIONS, serverTemp, clientTemp],
    };

    // ATTENTION le provider de server doit renvoyer une interface
    // pour faciliter l'override du provider!!!!
    // dans notre cas c'est un CustomTransportStrategy
  }

  async onApplicationShutdown(): Promise<void> {}
}
