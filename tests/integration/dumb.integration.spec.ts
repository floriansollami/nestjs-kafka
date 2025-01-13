import { COMPATIBILITY, SchemaType } from '@kafkajs/confluent-schema-registry';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Fixtures, KafkajsTestHelper } from '../utils/kafkajs-test-helper';

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
  confluentSchemas: [
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
        subject: 'test-topic-1-test.B',
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
            subject: 'test-topic-1-test.B',
            version: 1,
          },
        ],
      },
      options: {
        subject: 'test-topic-1-test.A',
        compatibility: COMPATIBILITY.FORWARD_TRANSITIVE,
      },
    },
  ],
};

describe('dumb', () => {
  let kafkaTestHelper: KafkajsTestHelper;

  beforeAll(async () => {
    kafkaTestHelper = KafkajsTestHelper.create();

    await kafkaTestHelper.setUp(fixtures);
    await kafkaTestHelper.subscribe('test-topic-1');
  });

  beforeEach(() => {
    // kafkaTestHelper.clearMessages();
  });

  afterAll(async () => {
    await kafkaTestHelper.cleanUp();
  });

  it('should', () => {
    expect(1 + 1).toBe(2);
  });
});
