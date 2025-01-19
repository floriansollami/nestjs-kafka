import { SchemaRegistry } from '@kafkajs/confluent-schema-registry';
import { SchemaType, type AvroOptions } from '@kafkajs/confluent-schema-registry/dist/@types';
import { Logger } from '@nestjs/common';
import { type Deserializer } from '@nestjs/microservices';
import avro from 'avsc';
import Long from 'long';
import { type KafkaJSAvroSchema } from '../../kafka-message.types';
import { type SchemaRegistryAPIClientConfig } from '../../kafka-options.types';

export class KafkaAvroDeserializer implements Deserializer<Buffer, NonNullable<unknown>> {
  // NestJS detects automatically custom logger
  protected logger = new Logger(this.constructor.name);

  private readonly registry: SchemaRegistry;

  constructor(config?: SchemaRegistryAPIClientConfig, avroOptions?: AvroOptions) {
    this.registry = new SchemaRegistry(
      {
        ...config,
        host: config?.host ?? 'http://localhost:8081',
      },
      {
        [SchemaType.AVRO]: avroOptions,
      },
    );

    // https://github.com/mtth/avsc/issues/464
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (avro.types.LongType as any).prototype._read = (tap: any): number => {
      const n = tap.readLong();

      if (!KafkaAvroDeserializer.isSafeLong(n)) {
        const safeNumber = Long.fromNumber(n).toNumber();
        this.logger.warn(`Potential precision loss detected. Original value: ${n}, Converted value: ${safeNumber}`);

        return safeNumber;
      }

      return n;
    };
  }

  private static isSafeLong(n: number): boolean {
    return n >= -4503599627370496 && n <= 4503599627370496;
  }

  async deserialize(data: Buffer, options?: { lightSchema: KafkaJSAvroSchema }): Promise<NonNullable<unknown>> {
    return this.registry.decode(data, {
      [SchemaType.AVRO]: { readerSchema: options?.lightSchema },
    });
  }
}
