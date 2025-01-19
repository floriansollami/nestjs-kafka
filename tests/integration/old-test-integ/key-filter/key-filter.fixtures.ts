import { type AvscAvroSchema, type Fixture } from '@libs/testing';

export type MessageKey = { businessUnit: string };
export type MessageValue = {
  contextCode: string;
};

export const inputTopic = 'input-key-filter';
export const outputTopic = 'output-key-filter';

const keySchema: AvscAvroSchema = {
  type: 'record',
  name: 'KeyFilterKey',
  namespace: 'com.reposity.tests',
  fields: [{ name: 'businessUnit', type: 'string' }],
};

const valueSchema: AvscAvroSchema = {
  type: 'record',
  name: 'KeyFilterValue',
  namespace: 'com.reposity.tests',
  fields: [{ name: 'contextCode', type: 'string' }],
};

export const fixtures: Fixture = {
  topics: [
    {
      topic: inputTopic,
      configEntries: [
        {
          name: 'cleanup.policy',
          value: 'delete', // NO KEY TEST CANNOT WORK WITH COMPACTION
        },
      ],
    },
    {
      topic: outputTopic,
    },
  ],
  schemas: [
    {
      avro: keySchema,
      subject: `${inputTopic}-key`,
    },
    {
      avro: valueSchema,
      subject: `${inputTopic}-value`,
    },
    {
      avro: keySchema,
      subject: `${outputTopic}-key`,
    },
    {
      avro: valueSchema,
      subject: `${outputTopic}-value`,
    },
  ],
};
