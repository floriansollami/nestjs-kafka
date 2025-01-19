import { COMPATIBILITY, SchemaRegistry } from '@kafkajs/confluent-schema-registry';
import {
  AvroConfluentSchema,
  JsonConfluentSchema,
  ProtocolOptions,
  ProtoConfluentSchema,
} from '@kafkajs/confluent-schema-registry/dist/@types';
import { isPlainObject } from '@nestjs/common/utils/shared.utils';
import { schema } from 'avsc';
import axios, { type AxiosInstance } from 'axios';
import {
  type Admin,
  CompressionTypes,
  Consumer,
  IHeaders,
  type ITopicConfig,
  Kafka,
  Message as KafkaJSProduceMessage,
  KafkaMessage,
  logLevel,
  Producer,
} from 'kafkajs';
import { expect } from 'vitest';
/*
| Behavior           | TopicNameStrategy                                 | RecordNameStrategy           | TopicRecordNameStrategy                    |
|--------------------|---------------------------------------------------|------------------------------|--------------------------------------------|
| Subject format     | <topic name> plus “-key” or “-value” depending on | <fully-qualified record name>| <topic name>-<fully-qualified record name> |
|                    | configuration                                     |                              |                                            |
fully-qualified record name (FQN) = avro record <namespace> + <name>
*/

export enum SerializerEnum {
  AVRO,
  JSON,
  STRING,
  VOID,
}

export enum DeserializerEnum {
  STRING,
  AVRO,
  VOID,
}

type ConsumerConfig = {
  topic: string;
  keyDeserializer: DeserializerEnum;
  valueDeserializer: DeserializerEnum;
};

type ProducerConfig = {
  topic: string;
  keySerializer: SerializerEnum;
  valueSerializer: SerializerEnum;
};

type AvscAvroConfluentSchema = Omit<AvroConfluentSchema, 'schema'> & { schema: schema.AvroSchema };

type SchemaDescriptor = {
  schema: AvscAvroConfluentSchema | ProtoConfluentSchema | JsonConfluentSchema;
  options: {
    compatibility?: COMPATIBILITY;
    separator?: string;
    subject: string;
  };
};

type TopicConfig = { name: ITopicConfig['topic']; configEntries?: ITopicConfig['configEntries'] };

export type Fixtures = {
  registryOptions?: ProtocolOptions;
  schemas: SchemaDescriptor[];
  topics: TopicConfig[];
  consumer: ConsumerConfig;
  producer: ProducerConfig;
};

interface ProduceMessage<K = unknown | null, V = unknown | null> {
  key?: K;
  value: V;
  keySubject?: string;
  valueSubject?: string;
  partition?: number;
  headers?: IHeaders;
  timestamp?: string;
}

export class KafkajsTestHelper {
  private static readonly RETRY_CONFIG = {
    maxRetryTime: 2000,
    initialRetryTime: 50,
    factor: 1.1,
    multiplier: 0.5,
    retries: 2,
  };

  private readonly kafka: Kafka;
  private schemaRegistry: SchemaRegistry | null = null;
  private readonly kafkaAdmin: Admin;
  private readonly axiosInstance: AxiosInstance;

  private consumer: Consumer | null = null;
  private producer: Producer | null = null;

  // Keep track of consumed messages and the latest offset
  private consumedMessages: KafkaMessage[] = [];
  private latestConsumedOffset = -1n;

  private keySerializer: SerializerEnum;
  private valueSerializer: SerializerEnum;
  private keyDeserializer: DeserializerEnum;
  private valueDeserializer: DeserializerEnum;

  private topics: string[] = [];

  private schemas: Fixtures['schemas'] = [];
  private schemaIdCache: Map<string, number> = new Map();

  private constructor() {
    this.kafka = new Kafka({
      brokers: ['localhost:9092'],
      clientId: 'integration-test',
      connectionTimeout: 500,
      requestTimeout: 500,
      enforceRequestTimeout: true,
      retry: KafkajsTestHelper.RETRY_CONFIG,
      logLevel: logLevel.NOTHING,
    });

    this.kafkaAdmin = this.kafka.admin({
      retry: KafkajsTestHelper.RETRY_CONFIG,
    });

    this.axiosInstance = axios.create({
      baseURL: 'http://localhost:8081',
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 2000,
    });
  }

  static create(): KafkajsTestHelper {
    return new KafkajsTestHelper();
  }

  async setUp(fixtures: Fixtures): Promise<void> {
    const setupPromises: Promise<void>[] = [];

    const { consumer, producer, topics, schemas } = fixtures;

    if (consumer) {
      setupPromises.push(this.setupConsumer(fixtures.consumer));
    }

    if (producer) {
      setupPromises.push(this.setupProducer(fixtures.producer));
    }

    await Promise.all(setupPromises);

    // following steps must be sequential
    if (topics.length) {
      await this.createTopics(topics);
    }

    if (schemas.length) {
      this.initializeSchemaRegistry(fixtures.registryOptions);
      await this.registerSchemas(schemas);
    }

    if (consumer) {
      await this.subscribe(consumer.topic);
    }
  }

  async produce<K, V>(topic: string, messages: ProduceMessage<K, V>[], compression = CompressionTypes.None): Promise<void> {
    if (!this.producer) {
      throw new Error('Producer is not initialized. Call setup() first');
    }

    // Using Promise.all or Promise.allSettled here is inefficient because the cache in
    // kafkajs/confluent-schema-registry only stores the schema for a given schema ID, not promises.
    // This causes 500 cache misses and HTTP calls for a batch of 500 messages, as parallel deserialization
    // bypasses caching. Sequential processing ensures cache hits and avoids excessive HTTP calls.

    const serializedMessages: KafkaJSProduceMessage[] = [];

    // NOTE: if the key or value is a string, kafkajs will encode it into a buffer

    for (const message of messages) {
      serializedMessages.push({
        // NOTE: KafkaJS will internally transform the headers values into Buffer

        key: message.key ? await this.serialize(this.keySerializer, message.key, message.keySubject) : undefined,
        value: await this.serialize(this.valueSerializer, message.value, message.valueSubject),
        partition: message.partition,
        headers: message.headers,
        timestamp: message.timestamp,
      });
    }

    console.log(serializedMessages);

    await this.producer.send({
      topic,
      messages: serializedMessages,
      compression,
    });
  }

  async waitForMessages(expectedCount: number, timeout = 5000): Promise<void> {
    await expect.poll(() => this.consumedMessages.length, { interval: 1, timeout }).toBe(expectedCount);
  }

  getMessages(): KafkaMessage[] {
    return this.consumedMessages;
  }

  clearMessages(): void {
    this.consumedMessages = [];
  }

  async cleanUp(): Promise<void> {
    await Promise.all([this.cleanUpConsumer(), this.cleanUpProducer()]);
    await this.deleteSchemas();
    await this.deleteTopics();
    await this.kafkaAdmin.disconnect();
  }

  /* --------------------------------------------------------------------------
   *                          PRIVATE HELPER METHODS
   * -------------------------------------------------------------------------- */

  private initializeSchemaRegistry(registryOptions: ProtocolOptions | undefined): void {
    this.schemaRegistry = new SchemaRegistry(
      {
        host: 'http://localhost:8081',
        auth: undefined,
        clientId: '',
        retry: KafkajsTestHelper.RETRY_CONFIG,
      },
      registryOptions,
    );
  }

  private async setupConsumer(consumerConfig: ConsumerConfig): Promise<void> {
    if (!this.consumer) {
      this.consumer = this.kafka.consumer({
        groupId: `test-integration-consumer-${Date.now()}`,
        // sessionTimeout: 200,
        // rebalanceTimeout: 400,
        // heartbeatInterval: 50,
        // maxWaitTimeInMs: 5,
        minBytes: 1,
        maxBytes: 512,
        retry: KafkajsTestHelper.RETRY_CONFIG,
        allowAutoTopicCreation: false,
      });

      await this.consumer.connect();
    }

    this.keyDeserializer = consumerConfig.keyDeserializer;
    this.valueDeserializer = consumerConfig.valueDeserializer;
  }

  private async setupProducer(producerConfig: ProducerConfig): Promise<void> {
    if (!this.producer) {
      this.producer = this.kafka.producer({
        allowAutoTopicCreation: false,
        retry: KafkajsTestHelper.RETRY_CONFIG,
        idempotent: false,
      });

      await this.producer.connect();

      this.keySerializer = producerConfig.keySerializer;
      this.valueSerializer = producerConfig.valueSerializer;
    }
  }

  private async createTopics(topics: TopicConfig[]): Promise<void> {
    try {
      await this.kafkaAdmin.connect();

      const created = await this.kafkaAdmin.createTopics({
        validateOnly: false,
        waitForLeaders: false, // CAN BE DANGEROUS KEEP IN MIND
        timeout: 1000,
        topics: topics.map(topicConfig => ({
          topic: topicConfig.name,
          numPartitions: 1,
          replicationFactor: 1,
          replicaAssignment: [],
          configEntries: topicConfig.configEntries,
        })),
      });

      if (!created) {
        throw new Error('One or more topics already exist');
      }

      this.topics = topics.map(topic => topic.name);
    } catch (error) {
      console.error('Failed to create topics');
      throw error;
    }
  }

  private async registerSchemas(schemas: SchemaDescriptor[]): Promise<void> {
    if (!this.schemaRegistry) {
      throw new Error('SchemaRegistry is not initialized. Call setup() first');
    }

    // must be a sequential registration (references)
    for (const confluentSchema of schemas) {
      try {
        await this.schemaRegistry.register(
          {
            type: confluentSchema.schema.type,
            schema: JSON.stringify(confluentSchema.schema.schema), // stringifify to match type
            references: confluentSchema.schema.references,
          },
          confluentSchema.options,
        );
      } catch (error) {
        console.error(`Failed to register schema with subject: "${confluentSchema.options.subject}"`);
        throw error;
      }
    }

    this.schemas = schemas;
  }

  private async subscribe(topic: string | RegExp, fromBeginning = true): Promise<void> {
    if (!this.consumer) {
      throw new Error('Consumer is not initialized. Call setup() first');
    }

    await this.consumer.subscribe({ topics: [topic], fromBeginning });
    await this.consumer.run({
      autoCommit: true,
      autoCommitInterval: null,
      autoCommitThreshold: null,
      eachBatchAutoResolve: true,
      partitionsConsumedConcurrently: 1,
      eachBatch: undefined,
      eachMessage: async ({ message }) => {
        // NOTE: kafkajs sends an heartbeat each time after this function has been executed
        console.log(message.value);

        // const [headers, key, value] = await Promise.all([
        //   message.headers ? KafkaStringDeserializer.decodeHeaders(message.headers) : {},
        //   this.deserializeKey(message.key),
        //   this.deserializeValue(message.value),
        // ]);

        // const deserializedMessage = {
        //   key,
        //   value,
        //   timestamp: message.timestamp,
        //   attributes: message.attributes,
        //   offset: message.offset,
        //   headers,
        // };

        this.consumedMessages.push(message);
        this.latestConsumedOffset = BigInt(message.offset);
      },
    });
  }

  private async getSchemaId(subject: string): Promise<number> {
    if (!this.schemaRegistry) {
      throw new Error('SchemaRegistry is not initialized. Call setup() first');
    }

    const cachedSchemaId = this.schemaIdCache.get(subject);

    if (cachedSchemaId) {
      return cachedSchemaId;
    }

    try {
      const schemaId = await this.schemaRegistry.getLatestSchemaId(subject);

      this.schemaIdCache.set(subject, schemaId);

      return schemaId;
    } catch (error) {
      console.error(`Failed to retrieve schema ID for subject "${subject}"`);
      throw error;
    }
  }

  private async encode(value: unknown, subject: string): Promise<Buffer> {
    if (!this.schemaRegistry) {
      throw new Error('SchemaRegistry is not initialized. Call setup() first');
    }

    const schemaId = await this.getSchemaId(subject);
    const encodedValue = await this.schemaRegistry.encode(schemaId, value);

    return encodedValue;
  }

  private async serialize(
    serializer: SerializerEnum,
    value: unknown,
    subject: string | undefined,
  ): Promise<Buffer | string | null> {
    switch (serializer) {
      case SerializerEnum.AVRO: {
        if (!subject) {
          throw new Error('Missing subject for AVRO serializer');
        }

        return await this.encode(value, subject);
      }

      case SerializerEnum.JSON: {
        if (isPlainObject(value) || Array.isArray(value)) {
          return JSON.stringify(value);
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (value as any).toString();
      }

      case SerializerEnum.STRING:
        return (value as string).toString();

      case SerializerEnum.VOID:
        return null;

      default:
        throw new Error(`Unsupported serializer: "${serializer}"`);
    }
  }

  private async deleteSchemas(): Promise<void> {
    for (const schema of this.schemas.reverse()) {
      const { subject } = schema.options;

      try {
        await this.axiosInstance.delete(`/subjects/${subject}`);
        await this.axiosInstance.delete(`/subjects/${subject}?permanent=true`);
      } catch (error) {
        console.error(`Failed to delete schema subject: "${subject}"`);
        throw error;
      }
    }

    this.schemas = [];
  }

  private async deleteTopics(): Promise<void> {
    await this.kafkaAdmin.deleteTopics({
      topics: this.topics,
    });

    this.topics = [];
  }

  private async cleanUpConsumer(): Promise<void> {
    if (this.consumer) {
      await this.consumer.disconnect();
      this.consumer = null;
    }
  }

  private async cleanUpProducer(): Promise<void> {
    if (this.producer) {
      await this.producer.disconnect();
      this.producer = null;
    }
  }
}
