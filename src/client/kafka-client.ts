import { Logger } from '@nestjs/common';
import { KafkaLogger, Serializer } from '@nestjs/microservices';
import { Kafka, type KafkaConfig, type Producer, type ProducerConfig } from 'kafkajs';
import { type ProduceBatch } from './kafka-message.types';
import { type SendConfig } from './kafka-options.types';
import {
  KafkaLibProducerNotSetError,
  KafkaLibProducerSendError,
  KafkaLibSerializationError,
  KafkaLibSerializerNotSetError,
} from '../kafka.errors';
import { type Serializers } from './kafka.providers';
import { type MessageService } from './message-service.interface';

export type KafkaClientConfig = {
  kafka?: Partial<KafkaConfig>;
  postfixId?: string;
};

export class KafkaClient implements MessageService {
  // NestJS detects automatically custom logger
  private logger = new Logger(this.constructor.name);

  private producerConfig: ProducerConfig | undefined;
  private sendConfig: SendConfig | undefined;

  private keySerializer?: Serializer<NonNullable<unknown>, Promise<string | Buffer | null>>;
  private valueSerializer?: Serializer<NonNullable<unknown>, Promise<string | Buffer | null>>;

  private client: Kafka | null = null;
  private producer: Producer | null = null;

  constructor(config: KafkaClientConfig = {}) {
    this.client = new Kafka({
      ...config.kafka,
      brokers: config.kafka?.brokers ?? ['localhost:9092'],
      clientId: `${config.kafka?.clientId ?? 'nestjs-consumer'}-${config.postfixId ?? 'client'}`,
      logCreator: config.kafka?.logCreator ?? KafkaLogger.bind(null, this.logger),
    });
  }

  setProducerConfig(producer?: ProducerConfig, send?: SendConfig): void {
    this.producerConfig = producer;
    this.sendConfig = send;
  }

  setSerializers(serializers: Serializers): void {
    this.keySerializer = serializers.keySerializer;
    this.valueSerializer = serializers.valueSerializer;
  }

  async emit(data: ProduceBatch): Promise<void> {
    if (!this.producer) {
      throw new KafkaLibProducerNotSetError();
    }

    const { topic, messages } = data;
    const serializedMessages = await Promise.all(
      messages.map(async message => {
        const serializedKey = await this.serializeKey(message.key, topic);
        const serializedValue = await this.serializeValue(message.value, topic);

        return {
          // NOTE: KafkaJS will internally transform the headers values into Buffer
          ...message,
          key: serializedKey,
          value: serializedValue,
        };
      }),
    );

    try {
      await this.producer.send({
        topic,
        messages: serializedMessages,
        ...this.sendConfig,
      });
    } catch (error) {
      throw new KafkaLibProducerSendError(error);
    }
  }

  async close(): Promise<void> {
    if (this.producer) {
      await this.producer.disconnect();
      this.producer = null;
    }

    this.client = null;
  }

  connect(): Promise<void> {
    if (!this.client) {
      throw new Error('Kafka client is not set');
    }

    if (!this.producer) {
      this.producer = this.client.producer(this.producerConfig);
    }

    return this.producer.connect(); // no-op if called twice
  }

  private async serializeKey(key: unknown, topic: string): Promise<string | Buffer | null> {
    if (!this.keySerializer) {
      throw new KafkaLibSerializerNotSetError();
    }

    if (!key) {
      return null;
    }

    try {
      return await this.keySerializer.serialize(key, { topic });
    } catch (error) {
      throw new KafkaLibSerializationError(error);
    }
  }

  private async serializeValue(value: unknown, topic: string): Promise<string | Buffer | null> {
    if (!this.valueSerializer) {
      throw new KafkaLibSerializerNotSetError();
    }

    if (!value) {
      return null;
    }

    try {
      return await this.valueSerializer.serialize(value, { topic });
    } catch (error) {
      throw new KafkaLibSerializationError(error);
    }
  }
}
