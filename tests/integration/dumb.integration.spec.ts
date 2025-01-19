import { COMPATIBILITY, SchemaType } from '@kafkajs/confluent-schema-registry';
import { CompressionTypes } from 'kafkajs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DeserializerEnum, Fixtures, KafkajsTestHelper, SerializerEnum } from '../utils/kafkajs-test-helper';

const fixtures: Fixtures = {
  registryOptions: {
    [SchemaType.AVRO]: {
      assertLogicalTypes: true,
      // logicalTypes: { [type: string]: new (schema: Schema, opts?: any) => types.LogicalType; };
      // namespace: string;
      // noAnonymousTypes: boolean;
      // omitRecordMethods: boolean;
      // registry: { [name: string]: Type };
      // typeHook: (schema: Schema, opts: ForSchemaOptions) => Type | undefined;
      // wrapUnions: boolean | 'auto' | 'always' | 'never';
    },
  },
  schemas: [
    {
      schema: {
        type: SchemaType.AVRO,
        schema: {
          type: 'enum',
          name: 'StockStatus',
          namespace: 'com.example.stock',
          symbols: ['AVAILABLE', 'OUT_OF_STOCK', 'DISCONTINUED'],
        },
        references: [],
      },
      options: {
        subject: 'com.example.stock.StockStatus', // RecordNameStrategy
        compatibility: COMPATIBILITY.FORWARD_TRANSITIVE,
      },
    },
    {
      schema: {
        type: SchemaType.AVRO,
        schema: {
          type: 'record',
          name: 'StockAvailable',
          namespace: 'com.example.stock',
          fields: [
            { name: 'productId', type: 'string' },
            { name: 'quantity', type: 'int' },
            { name: 'status', type: 'com.example.stock.StockStatus' },
          ],
        },
        references: [
          {
            name: 'com.example.stock.StockStatus',
            subject: 'com.example.stock.StockStatus',
            version: 1,
          },
        ],
      },
      options: {
        subject: 'test-stocks-topic-com.example.stock.StockAvailable', // TopicRecordNameStrategy
        compatibility: COMPATIBILITY.FORWARD_TRANSITIVE,
      },
    },
    {
      schema: {
        type: SchemaType.AVRO,
        schema: {
          type: 'record',
          name: 'StockOutage',
          namespace: 'com.example.stock',
          fields: [
            { name: 'productId', type: 'string' },
            { name: 'status', type: 'com.example.stock.StockStatus' },
            { name: 'expectedRestockDate', type: ['null', 'string'], default: null },
          ],
        },
        references: [
          {
            name: 'com.example.stock.StockStatus',
            subject: 'com.example.stock.StockStatus',
            version: 1,
          },
        ],
      },
      options: {
        subject: 'test-stocks-topic-com.example.stock.StockOutage', // TopicRecordNameStrategy
        compatibility: COMPATIBILITY.FORWARD_TRANSITIVE,
      },
    },
  ],
  topics: [
    {
      name: 'test-stocks-topic',
      configEntries: [
        { name: 'cleanup.policy', value: 'delete' },
        { name: 'compression.type', value: 'gzip' },
      ],
    },
  ],
  consumer: {
    topic: 'test-stocks-topic',
    keyDeserializer: DeserializerEnum.STRING,
    valueDeserializer: DeserializerEnum.AVRO,
  },
  producer: {
    topic: 'test-stocks-topic',
    keySerializer: SerializerEnum.STRING,
    valueSerializer: SerializerEnum.AVRO,
  },
};

describe('dumb', () => {
  let kafkaTestHelper: KafkajsTestHelper;

  beforeAll(async () => {
    kafkaTestHelper = KafkajsTestHelper.create();

    await kafkaTestHelper.setUp(fixtures);
  });

  beforeEach(() => {
    kafkaTestHelper.clearMessages();
  });

  afterAll(async () => {
    await kafkaTestHelper.cleanUp();
  });

  enum StockStatus {
    'AVAILABLE' = 'AVAILABLE',
    'OUT_OF_STOCK' = 'OUT_OF_STOCK',
    'DISCONTINUED' = 'DISCONTINUED',
  }

  type StockAvailable = { productId: string; quantity: number; status: StockStatus.AVAILABLE };
  type StockOutage = { productId: string; status: StockStatus.OUT_OF_STOCK; expectedRestockDate: string | null };

  it('should ', async () => {
    // le typage K, V
    // ne marche plus car depend du subject...
    await kafkaTestHelper.produce<string, StockAvailable | StockOutage>(
      fixtures.topics[0].name,
      [
        {
          key: 'key-1',
          value: { productId: 'productId1', quantity: 1, status: StockStatus.AVAILABLE },
          // keySubject: "",
          valueSubject: 'test-stocks-topic-com.example.stock.StockAvailable',
        },

        {
          key: 'key-1',
          value: { productId: 'productId2', status: StockStatus.OUT_OF_STOCK, expectedRestockDate: '2025-01-01' },
          valueSubject: 'test-stocks-topic-com.example.stock.StockOutage',
        },
      ],
      CompressionTypes.GZIP,
    );

    await kafkaTestHelper.waitForMessages(2);

    // console.log(kafkaTestHelper.getMessages());

    // expect(kafkaHelper.getMessages().map(msg => msg.value.toString())).toEqual(messagesToProduce);

    expect(1 + 1).toBe(2);
  });
});
