import { type AvscAvroSchema, type Fixture } from '@libs/testing';

export type MessageHeader = 'businessUnit';
export type MessageKey = { itemId: string };
export type MessageValue = { contextCode: string };

export const inputTopic = 'input-header-filter';
export const outputTopic = 'output-header-filter';

const keySchema: AvscAvroSchema = {
  type: 'record',
  name: 'HeaderFilterKey',
  namespace: 'com.reposity.tests',
  fields: [{ name: 'itemId', type: 'string' }],
};

const valueSchema: AvscAvroSchema = {
  type: 'record',
  name: 'HeaderFilterValue',
  namespace: 'com.reposity.tests',
  fields: [{ name: 'contextCode', type: 'string' }],
};

export const fixtures: Fixture = {
  topics: [
    {
      topic: inputTopic,
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
