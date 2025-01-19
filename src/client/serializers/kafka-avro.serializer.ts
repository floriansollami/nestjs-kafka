import { SchemaRegistry } from '@kafkajs/confluent-schema-registry';
import { SchemaType, type AvroOptions } from '@kafkajs/confluent-schema-registry/dist/@types';
import { type Serializer } from '@nestjs/microservices';
import { TopicNamingStrategy, type SchemaRegistryAPIClientConfig } from '../../kafka-options.types';
import { KafkaLibAvroSchemaIdNotFoundInMemoryError } from '../../kafka.errors';

type TopicName = string;
type SchemaId = number;
type LastFetchTime = number;

export type KafkaAvroSerializerConfig = {
  schemaRegistryConfig?: SchemaRegistryAPIClientConfig;
  avroOptions?: AvroOptions;
  topicNamingStrategy?: TopicNamingStrategy;
  isKey?: boolean;
  schemaFetchIntervalSeconds?: number;
};

export class KafkaAvroSerializer implements Serializer<NonNullable<unknown>, Promise<Buffer>> {
  private registry: SchemaRegistry;

  private schemas: Map<TopicName, SchemaId> = new Map();
  private lastSchemaFetchTime: Map<TopicName, LastFetchTime> = new Map();

  private namingStrategy: TopicNamingStrategy;
  private isKey: boolean;
  private schemaFetchIntervalSeconds: number;

  constructor(config: KafkaAvroSerializerConfig) {
    this.registry = new SchemaRegistry(
      {
        ...config.schemaRegistryConfig,
        host: config.schemaRegistryConfig?.host ?? 'http://localhost:8081',
      },
      {
        [SchemaType.AVRO]: config.avroOptions,
      },
    );
    this.namingStrategy = config.topicNamingStrategy ?? TopicNamingStrategy.TOPIC_NAME_STRATEGY;
    this.isKey = config.isKey ?? false;
    this.schemaFetchIntervalSeconds = config.schemaFetchIntervalSeconds ?? 3600;
  }

  async serialize(value: NonNullable<unknown>, options: { topic: string }): Promise<Buffer> {
    const { topic } = options;

    await this.updateSchema(topic);

    const schemaId = this.retrieveSchemaIdInMemory(topic);

    return await this.registry.encode(schemaId, value);
  }

  private retrieveSchemaIdInMemory(topic: string): SchemaId {
    const schemaId = this.schemas.get(topic);

    if (!schemaId) {
      throw new KafkaLibAvroSchemaIdNotFoundInMemoryError();
    }

    return schemaId;
  }

  private async setSchemaId(topic: string): Promise<void> {
    const subject = this.generateSubjectName(topic);
    const schemaId = await this.registry.getLatestSchemaId(subject);

    this.schemas.set(topic, schemaId);
    this.lastSchemaFetchTime.set(topic, Date.now());
  }

  private async updateSchema(targetTopic: string): Promise<void> {
    const lastCheck = this.lastSchemaFetchTime.get(targetTopic) ?? 0;
    const configCheckMs = this.schemaFetchIntervalSeconds * 1000;
    const now = Date.now();

    if (lastCheck + configCheckMs <= now) {
      await this.setSchemaId(targetTopic);
    }
  }

  private generateSubjectName(topic: string): string {
    switch (this.namingStrategy) {
      case TopicNamingStrategy.TOPIC_NAME_STRATEGY:
        return this.isKey ? `${topic}-key` : `${topic}-value`;

      default:
        throw new Error('Invalid topic naming strategy');
    }
  }
}
