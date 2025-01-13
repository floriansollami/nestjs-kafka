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
import { expect } from 'vitest';
import waitForExpect from 'wait-for-expect';

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
  private consumedMessages: KafkaMessage[] = [];
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
    await this.registerSchemas(fixtures.confluentSchemas);

    await Promise.all([this.setupConsumer(), this.setupProducer()]);

    this.topics = fixtures.topics;

    console.timeEnd('SET_UP_DURATION');
  }

  async subscribe(topic: string | RegExp, fromBeginning = true): Promise<void> {
    if (!this.consumer) {
      throw new Error('Consumer is not initialized. Call setupEnvironment first.');
    }

    await this.consumer.subscribe({ topics: [topic], fromBeginning });
    console.time('SUBSCRIBE_DURATION');
    await this.consumer.run({
      autoCommit: true,
      autoCommitInterval: null,
      autoCommitThreshold: null,
      eachBatchAutoResolve: true,
      partitionsConsumedConcurrently: 1,
      eachBatch: undefined,
      eachMessage: async ({ message }) => {
        console.log('florian');
        this.consumedMessages.push(message);
        this.latestConsumedOffset = BigInt(message.offset);
      },
    });
    console.timeEnd('SUBSCRIBE_DURATION');
  }

  async waitForMessages(expectedCount, timeout = 5000): Promise<void> {
    await waitForExpect(() => {
      expect(this.consumedMessages.length).toBe(expectedCount);
    }, timeout);
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
    } catch (error) {
      console.log('flooooo ', error);
    }
  }

  private async registerSchemas(confluentSchemas: ConfluentSchema[]): Promise<void> {
    if (!this.schemaRegistry) {
      throw new Error('SchemaRegistry is not initialized. Call setupEnvironment first.');
    }

    for (const confluentSchema of confluentSchemas) {
      try {
        await this.schemaRegistry.register(
          {
            type: confluentSchema.schema.type,
            schema: JSON.stringify(confluentSchema.schema.schema), // to make typing working
            references: confluentSchema.schema.references,
          },
          confluentSchema.options,
        );
      } catch (error) {
        console.log('ici ', error);
      }
    }

    this.confluentSchemas = confluentSchemas;
  }

  private async setupConsumer(): Promise<void> {
    if (!this.consumer) {
      // 5 ms

      this.consumer = this.kafka.consumer({
        groupId: 'test-integration-consumer-id',

        //  groupId: string
        //   partitionAssigners?: PartitionAssigner[]
        //   metadataMaxAge?: number

        // Le sessionTimeout est la durée maximale qu'un consommateur peut rester inactif
        // (c'est-à-dire sans envoyer de heartbeats) avant que le coordonateur de groupe (group coordinator)
        // de Kafka ne considère que ce consommateur est mort ou déconnecté.
        // Si le coordonnateur ne reçoit pas de heartbeat dans ce délai, il déclenche une rééquilibrage (rebalance) du groupe.

        // Pour des tests où vous souhaitez une détection rapide des consommateurs inactifs afin de stopper rapidement si aucun message n'est produit :
        sessionTimeout: 1000, // 1 seconde
        rebalanceTimeout: 1000, // 1 seconde
        heartbeatInterval: 300, // 300 millisecondes
        //   maxBytesPerPartition?: number

        // Le consommateur envoie une requête au serveur Kafka pour obtenir des messages.
        // Si la quantité de données disponibles est inférieure à minBytes, le serveur
        // attend que davantage de données s'accumulent (maxWaitTimeInMs), jusqu'à atteindre ce seuil, avant de répondre.
        // Une valeur élevée peut améliorer le débit en réduisant le nombre de requêtes, mais augmente la latence,
        // car le consommateur attend plus longtemps pour recevoir les données.
        // minBytes: 1,

        // Quantité maximale de données (en octets) que le consommateur peut recevoir en une seule requête.
        // Une valeur trop basse peut limiter le débit en restreignant la quantité de données reçues par requête,
        // tandis qu'une valeur trop élevée peut entraîner une surcharge de mémoire chez le consommateur.
        // maxBytes: 1024,

        // maxWaitTimeInMs: 50,

        // Set to 1 byte to ensure the consumer processes messages as soon as they are available,
        // minimizing latency during tests.
        minBytes: 1,
        // Limit to 512 bytes to handle small payloads efficiently, preventing excessive memory usage
        // while accommodating the expected message size in integration tests.
        maxBytes: 512,
        // Set to 5 milliseconds to reduce the wait time for message retrieval, ensuring rapid processing
        // and quick test execution, suitable for scenarios with low message throughput.
        maxWaitTimeInMs: 5,

        retry: {
          maxRetryTime: 2000,
          initialRetryTime: 50,
          factor: 1.1,
          multiplier: 0.5,
          retries: 2,
        },
        allowAutoTopicCreation: false,
        // maxInFlightRequests: prendre le default,
        //   readUncommitted?: boolean
        //   rackId?: string
      });
      await this.consumer.connect();
    }
  }

  private async setupProducer(): Promise<void> {
    // 10 ms
    if (!this.producer) {
      this.producer = this.kafka.producer({
        allowAutoTopicCreation: false,

        // createPartitioner?: ICustomPartitioner
        //   retry?: RetryOptions
        //   metadataMaxAge?: number
        //   allowAutoTopicCreation?: boolean
        //   idempotent?: boolean
        //   transactionalId?: string
        //   transactionTimeout?: number
        //   maxInFlightRequests?: number
      });
      await this.producer.connect();
    }
  }

  private async deleteSchemas(): Promise<void> {
    for (const { options } of this.confluentSchemas.reverse()) {
      try {
        await this.axiosInstance.delete(`/subjects/${options.subject}`);
        await this.axiosInstance.delete(`/subjects/${options.subject}?permanent=true`);
      } catch (error) {
        console.error(`Failed to delete schema subject: ${options.subject}`, error);
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
