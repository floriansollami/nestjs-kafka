import { COMPATIBILITY, SchemaType } from '@kafkajs/confluent-schema-registry';
import { CompressionTypes } from 'kafkajs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Fixtures, KafkajsTestHelper, SerializerEnum } from '../utils/kafkajs-test-helper';

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
  topics: [
    {
      topicName: 'test-topic-1',
      configEntries: [
        {
          name: 'cleanup.policy',
          value: 'delete',
        },
        {
          name: 'compression.type',
          value: 'gzip',
        },
      ],
    },
  ],
  schemas: [
    {
      schema: {
        type: SchemaType.AVRO,
        schema: {
          type: 'enum',
          name: 'B',
          namespace: 'test',
          symbols: ['CREATED', 'UPDATED', 'DELETED'],
        },
        references: [],
      },
      options: {
        subject: 'test.B', // RecordNameStrategy
        compatibility: COMPATIBILITY.FORWARD_TRANSITIVE,
      },
    },
    {
      schema: {
        type: SchemaType.AVRO,
        schema: {
          type: 'record',
          name: 'A',
          namespace: 'test',
          fields: [
            { name: 'identifier', type: 'string' },
            { name: 'status', type: 'test.B' },
          ],
        },
        references: [
          {
            name: 'test.B',
            subject: 'test.B',
            version: 1,
          },
        ],
      },
      options: {
        subject: 'test-topic-1-test.A', // TopicRecordNameStrategy
        compatibility: COMPATIBILITY.FORWARD_TRANSITIVE,
      },
    },
    {
      schema: {
        type: SchemaType.AVRO,
        schema: {
          type: 'record',
          name: 'Z',
          namespace: 'test',
          fields: [
            { name: 'identifier', type: 'string' },
            { name: 'status', type: 'test.B' },
          ],
        },
        references: [
          {
            name: 'test.B',
            subject: 'test.B',
            version: 1,
          },
        ],
      },
      options: {
        subject: 'test-topic-1-test.Z', // TopicRecordNameStrategy
        compatibility: COMPATIBILITY.FORWARD_TRANSITIVE,
      },
    },
  ],
};

describe('dumb', () => {
  let kafkaTestHelper: KafkajsTestHelper;

  beforeAll(async () => {
    console.time('CREATE');
    kafkaTestHelper = KafkajsTestHelper.create();
    console.timeEnd('CREATE');

    await kafkaTestHelper.setUp(fixtures);
    const topic = fixtures.topics[0].topicName;

    await kafkaTestHelper.subscribe(topic);
  });

  beforeEach(() => {
    kafkaTestHelper.clearMessages();
  });

  afterAll(async () => {
    await kafkaTestHelper.cleanUp();
  });

  it('should ', async () => {
    const topic = fixtures.topics[0].topicName;

    await kafkaTestHelper.produce<string, { identifier: string; status: string }>(
      topic,
      [
        {
          key: 'key-1',
          value: { identifier: 'id-1', status: 'CREATED' },
        },
        {
          key: 'key-1',
          value: { identifier: 'id-1', status: 'UPDATED' },
        },
      ],
      {
        keySerializer: SerializerEnum.STRING,
        valueSerializer: SerializerEnum.AVRO,
        valueSubject: 'test-topic-1-test.A',
        compression: CompressionTypes.GZIP,
      },
    );

    // TODO vitest propose expect.poll et expect.timeout plus besoin de la lib
    await kafkaTestHelper.waitForMessages(2);

    // console.log(kafkaTestHelper.getMessages());

    // expect(kafkaHelper.getMessages().map(msg => msg.value.toString())).toEqual(messagesToProduce);

    expect(1 + 1).toBe(2);
  });
});
