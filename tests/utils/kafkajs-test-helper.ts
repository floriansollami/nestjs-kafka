import { COMPATIBILITY, SchemaRegistry } from '@kafkajs/confluent-schema-registry';
import {
  AvroConfluentSchema,
  JsonConfluentSchema,
  ProtocolOptions,
  ProtoConfluentSchema,
} from '@kafkajs/confluent-schema-registry/dist/@types';
import { schema } from 'avsc';
import axios, { type AxiosInstance } from 'axios';
import { type Admin, Consumer, type ITopicConfig, Kafka, KafkaMessage, logLevel, Producer } from 'kafkajs';

/*
| Behavior           | TopicNameStrategy                                 | RecordNameStrategy           | TopicRecordNameStrategy                    |
|--------------------|---------------------------------------------------|------------------------------|--------------------------------------------|
| Subject format     | <topic name> plus “-key” or “-value” depending on | <fully-qualified record name>| <topic name>-<fully-qualified record name> |
|                    | configuration                                     |                              |                                            |
fully-qualified record name (FQN) = avro record <namespace> + <name>
*/

export type AvscAvroSchema = schema.AvroSchema;

type TopicConfig = {
  topicName: ITopicConfig['topic'];
  configEntries?: ITopicConfig['configEntries'];
};

type sAvroConfluentSchema = Omit<AvroConfluentSchema, 'schema'> & { schema: AvscAvroSchema };

type schema = sAvroConfluentSchema | ProtoConfluentSchema | JsonConfluentSchema;

type ConfluentSchemaOptions = {
  compatibility?: COMPATIBILITY;
  separator?: string;
  subject: string;
};

type ConfluentSchema = {
  schema: schema;
  options: ConfluentSchemaOptions;
};

export type Fixtures = {
  registryOptions?: ProtocolOptions;
  topics: TopicConfig[];
  confluentSchemas: ConfluentSchema[];
};

export class KafkajsTestHelper {
  private readonly kafka: Kafka;
  private schemaRegistry: SchemaRegistry | null = null;
  private readonly kafkaAdmin: Admin;
  private readonly axiosInstance: AxiosInstance;

  private consumer: Consumer | null = null;
  private producer: Producer | null = null;

  // Keep track of consumed messages and the latest offset
  private readonly consumedMessages: KafkaMessage[] = [];
  private latestConsumedOffset = -1n;

  private topics: Fixtures['topics'] = [];
  private confluentSchemas: Fixtures['confluentSchemas'] = [];

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
      logLevel: logLevel.ERROR,
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
    await this.registerSchemas(fixtures.confluentSchemas);
    await Promise.all([this.setupConsumer(), this.setupProducer()]);

    this.topics = fixtures.topics;
  }

  async subscribe(topic: string | RegExp, fromBeginning = true): Promise<void> {
    if (!this.consumer) {
      throw new Error('Consumer is not initialized. Call setupEnvironment first.');
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
        this.consumedMessages.push(message);
        this.latestConsumedOffset = BigInt(message.offset);
      },
    });
  }

  async cleanUp(): Promise<void> {
    await Promise.all([this.cleanUpConsumer(), this.cleanUpProducer()]);

    await this.deleteSchemas();
    await this.deleteTopics();

    await this.kafkaAdmin.disconnect();

    await new Promise(resolve => setTimeout(resolve, 500));
  }

  /* --------------------------------------------------------------------------
   *                          PRIVATE HELPER METHODS
   * -------------------------------------------------------------------------- */

  private async createTopics(topics: TopicConfig[]): Promise<void> {
    const created = await this.kafkaAdmin.createTopics({
      validateOnly: false,
      waitForLeaders: true,
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
  }

  private async registerSchemas(confluentSchemas: ConfluentSchema[]): Promise<void> {
    if (!this.schemaRegistry) {
      throw new Error('SchemaRegistry is not initialized. Call setupEnvironment first.');
    }

    for (const confluentSchema of confluentSchemas) {
      await this.schemaRegistry.register(
        {
          type: confluentSchema.schema.type,
          schema: JSON.stringify(confluentSchema.schema.schema), // to make typing working
          references: confluentSchema.schema.references,
        },
        confluentSchema.options,
      );
    }

    this.confluentSchemas = confluentSchemas;
  }

  private async setupConsumer(): Promise<void> {
    if (!this.consumer) {
      this.consumer = this.kafka.consumer({ groupId: 'test-integration-consumer-id' });
      await this.consumer.connect();
    }
  }

  private async setupProducer(): Promise<void> {
    if (!this.producer) {
      this.producer = this.kafka.producer({ allowAutoTopicCreation: false });
      await this.producer.connect();
    }
  }

  private async deleteSchemas(): Promise<void> {
    for (const subject of this.confluentSchemas.reverse()) {
      try {
        await this.axiosInstance.delete(`/subjects/${subject}`);
        await this.axiosInstance.delete(`/subjects/${subject}?permanent=true`);
      } catch (error) {
        console.error(`Failed to delete schema subject: ${subject}`, error);
      }
    }

    this.confluentSchemas = [];
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
