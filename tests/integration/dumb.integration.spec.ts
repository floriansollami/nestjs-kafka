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

  it('should ', () => {
    expect(1 + 1).toBe(2);
  });

  //   // TESTER LE BATCH EN ERREUR AVEC LES EVENT EMITTER
  // // 1. Produce messages (one that will cause an error)
  // const testTopic = "test.batch.topic";
  // await produceMessages(testTopic, [
  //   { key: "ok-1", value: JSON.stringify({ msg: "good-1" }) },
  //   { key: "ok-2", value: JSON.stringify({ msg: "good-2" }) },
  //   { key: "FAIL", value: JSON.stringify({ msg: "will-fail" }) },
  //   { key: "ok-3", value: JSON.stringify({ msg: "good-3" }) },
  // ]);

  // // 2. Wait until we detect that all messages have been processed
  // //    (or we time out). For example, we might expect 3 successes + 1 error.
  // await waitForCondition(() => {
  //   // dans notre cas ce serait 3 republish dans un nouveau topic
  //   // + 1 dans le error handler
  //   return consumedSuccesses.length + consumedErrors.length >= 4;
  // }, 10000); // wait up to 10s

  // // 3. Assertions on the *real* side effects:
  // //    - 3 "success" messages consumed
  // //    - 1 "error" message consumed
  // expect(consumedSuccesses.length).toBe(3);
  // expect(consumedErrors.length).toBe(1);

  // // 4. Check that the same failing message is not re-processed
  // //    We'll wait a little longer to ensure Kafka doesn't redeliver.
  // await new Promise((resolve) => setTimeout(resolve, 2000));

  // test('should consume all messages from the topic in test 1', async () => {
  //   const messages = ['message1', 'message2'];

  //   await kafkaHelper.produce(messages);
  //   await kafkaHelper.waitForMessages(messagesToProduce.length);

  //   expect(kafkaHelper.getMessages().map((msg) => msg.value.toString())).toEqual(messagesToProduce);
  // });

  // test('should consume all messages from the topic in test 2', async () => {
  //   const messages = ['message3', 'message4', 'message5'];
  //   await kafkaHelper.produce(messagesToProduce);

  //   await kafkaHelper.waitForMessages(messagesToProduce.length);

  //   const messages = kafkaHelper.getMessages();
  //   expect(messages.map((msg) => msg.value.toString())).toEqual(messagesToProduce);
  // });
});
