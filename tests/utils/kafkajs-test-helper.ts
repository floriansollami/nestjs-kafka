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

type TopicConfig = {
  topicName: ITopicConfig['topic'];
  configEntries?: ITopicConfig['configEntries'];
};

type AvscAvroConfluentSchema = Omit<AvroConfluentSchema, 'schema'> & { schema: schema.AvroSchema };

type SchemaOptions = {
  compatibility?: COMPATIBILITY;
  separator?: string;
  subject: string;
};

type SchemaDescriptor = {
  schema: AvscAvroConfluentSchema | ProtoConfluentSchema | JsonConfluentSchema;
  options: SchemaOptions;
};

export type Fixtures = {
  registryOptions?: ProtocolOptions;
  topics: TopicConfig[];
  schemas: SchemaDescriptor[];
};

export enum SerializerEnum {
  AVRO,
  JSON,
  STRING,
  VOID,
}

// type ProduceMessage = {
//   key?: Buffer | string | null;
//   value: Buffer | string | null;
//   partition?: number;
//   headers?: IHeaders;
//   timestamp?: string;
// };

interface ProduceMessage<TKey = unknown, TValue = unknown> {
  key?: TKey;
  value: TValue;
  partition?: number;
  headers?: IHeaders;
  timestamp?: string;
}

// type SerializerToType<S extends SerializerEnum> = S extends SerializerEnum.AVRO
//   ? Record<string, unknown>
//   : S extends SerializerEnum.JSON
//     ? unknown
//     : S extends SerializerEnum.STRING
//       ? string
//       : S extends SerializerEnum.VOID
//         ? null
//         : never;

interface ProduceConfig {
  keySerializer: SerializerEnum;
  valueSerializer: SerializerEnum;
  keySubject?: string;
  valueSubject?: string;
  compression?: CompressionTypes;
}

export class KafkajsTestHelper {
  private readonly kafka: Kafka;
  private schemaRegistry: SchemaRegistry | null = null;
  private readonly kafkaAdmin: Admin;
  private readonly axiosInstance: AxiosInstance;

  private consumer: Consumer | null = null;
  private producer: Producer | null = null;

  // Keep track of consumed messages and the latest offset
  private consumedMessages: KafkaMessage[] = [];
  private latestConsumedOffset = -1n;

  private topics: Fixtures['topics'] = [];
  private schemas: Fixtures['schemas'] = [];

  private constructor() {
    this.kafka = new Kafka({
      brokers: ['localhost:9092'],
      clientId: 'integration-test',
      connectionTimeout: 500,
      requestTimeout: 500,
      enforceRequestTimeout: true,
      retry: {
        maxRetryTime: 2000,
        initialRetryTime: 50,
        factor: 1.1,
        multiplier: 0.5,
        retries: 2,
      },
      logLevel: logLevel.NOTHING,
    });

    this.kafkaAdmin = this.kafka.admin({
      retry: {
        maxRetryTime: 2000,
        initialRetryTime: 50,
        factor: 1.1,
        multiplier: 0.5,
        retries: 2,
      },
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
    console.time('SET_UP_DURATION');
    this.schemaRegistry = new SchemaRegistry(
      {
        host: 'http://localhost:8081',
        auth: undefined,
        clientId: '',
        retry: {
          maxRetryTimeInSecs: 2,
          initialRetryTimeInSecs: 0.05, // 50ms
          factor: 1.1,
          multiplier: 0.5,
        },
      },
      fixtures.registryOptions,
    );

    await this.kafkaAdmin.connect();

    await this.createTopics(fixtures.topics);
    console.time('REGISTER');
    await this.registerSchemas(fixtures.schemas);
    console.timeEnd('REGISTER');

    await Promise.all([this.setupConsumer(), this.setupProducer()]);

    this.topics = fixtures.topics;

    console.timeEnd('SET_UP_DURATION');
  }

  async subscribe(topic: string | RegExp, fromBeginning = true): Promise<void> {
    console.time('SUBSCRIBE_DURATION');

    if (!this.consumer) {
      throw new Error('Consumer is not initialized. Call setup() first.');
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
        console.log('un messssage arrive');
        this.consumedMessages.push(message);
        this.latestConsumedOffset = BigInt(message.offset);
      },
    });
    console.timeEnd('SUBSCRIBE_DURATION');
  }

  async produce<K, V>(topic: string, messages: ProduceMessage<K, V>[], config: ProduceConfig): Promise<void> {
    console.time('PRODUCE');
    if (!this.producer) {
      throw new Error('Producer is not initialized. Call setup() first.');
    }

    // Using Promise.all or Promise.allSettled here is inefficient because the cache in
    // kafkajs/confluent-schema-registry only stores the schema for a given schema ID, not promises.
    // This causes 500 cache misses and HTTP calls for a batch of 500 messages, as parallel deserialization
    // bypasses caching. Sequential processing ensures cache hits and avoids excessive HTTP calls.

    const serializedMessages: KafkaJSProduceMessage[] = [];

    for (const message of messages) {
      serializedMessages.push({
        // NOTE: KafkaJS will internally transform the headers values into Buffer
        ...message,
        key: message.key ? await this.serialize(config.keySerializer, message.key) : undefined,
        value: await this.serialize(config.valueSerializer, message.value, config.valueSubject),
      });
    }

    await this.producer.send({
      topic,
      messages: serializedMessages,
      compression: config.compression,
    });

    console.timeEnd('PRODUCE');
    console.log();
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
    console.time('CLEAN_UP_DURATION');

    await Promise.all([this.cleanUpConsumer(), this.cleanUpProducer()]);
    await this.deleteSchemas();
    await this.deleteTopics();
    await this.kafkaAdmin.disconnect();

    console.timeEnd('CLEAN_UP_DURATION');
  }

  /* --------------------------------------------------------------------------
   *                          PRIVATE HELPER METHODS
   * -------------------------------------------------------------------------- */

  private async createTopics(topics: TopicConfig[]): Promise<void> {
    try {
      const created = await this.kafkaAdmin.createTopics({
        validateOnly: false,
        waitForLeaders: false, // CAN BE DANGEROUS KEEP IN MIND
        timeout: 1000,
        topics: topics.map(topicConfig => ({
          topic: topicConfig.topicName,
          numPartitions: 1,
          replicationFactor: 1,
          replicaAssignment: [],
          configEntries: topicConfig.configEntries,
        })),
      });

      if (!created) {
        throw new Error('One or more topics already exist.');
      }

      this.topics = topics;
    } catch (error) {
      console.error('Failed to create topics.');
      throw error;
    }
  }

  private async registerSchemas(schemas: SchemaDescriptor[]): Promise<void> {
    if (!this.schemaRegistry) {
      throw new Error('SchemaRegistry is not initialized. Call setup() first.');
    }

    // should be a sequential registration (references)
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
        console.error(`Failed to register schema with subject: "${confluentSchema.options.subject}".`);
        throw error;
      }
    }

    this.schemas = schemas;
  }

  private async setupConsumer(): Promise<void> {
    if (!this.consumer) {
      this.consumer = this.kafka.consumer({
        groupId: `test-integration-consumer-${Date.now()}`,
        // sessionTimeout: 200,
        // rebalanceTimeout: 400,
        // heartbeatInterval: 50,
        // maxWaitTimeInMs: 5,
        minBytes: 1,
        maxBytes: 512,
        retry: {
          maxRetryTime: 2000,
          initialRetryTime: 50,
          factor: 1.1,
          multiplier: 0.5,
          retries: 2,
        },
        allowAutoTopicCreation: false,
      });

      await this.consumer.connect();
    }
  }

  private async setupProducer(): Promise<void> {
    if (!this.producer) {
      this.producer = this.kafka.producer({
        allowAutoTopicCreation: false,
        retry: {
          maxRetryTime: 2000,
          initialRetryTime: 50,
          factor: 1.1,
          multiplier: 0.5,
          retries: 2,
        },
        idempotent: false,
      });
      await this.producer.connect();
    }
  }

  private async serialize(serializer: SerializerEnum, value: unknown, subject?: string): Promise<Buffer | string | null> {
    switch (serializer) {
      case SerializerEnum.AVRO: {
        if (!this.schemaRegistry) {
          throw new Error('SchemaRegistry is not initialized. Call setup() first.');
        }

        if (!subject) {
          throw new Error('Missing subject for AVRO serializer');
        }

        // TODO use a cache <topic, schemaId> or it is negligebale
        const schemaId = await this.schemaRegistry.getLatestSchemaId(subject);

        return await this.schemaRegistry.encode(schemaId, value);
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
        console.error(`Failed to delete schema subject: "${subject}".`);
        throw error;
      }
    }

    this.schemas = [];
  }

  private async deleteTopics(): Promise<void> {
    await this.kafkaAdmin.deleteTopics({
      topics: this.topics.map(topicConfig => topicConfig.topicName),
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
