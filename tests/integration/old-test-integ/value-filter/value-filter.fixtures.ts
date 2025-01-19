import { type AvscAvroSchema, type Fixture } from '@libs/testing';
import { type KafkaJSAvroSchema } from '../../src';

export type MessageKey = { contextCode: string };
export type MessageValue = {
  itemId: string;
  businessUnit: string;
};

export const inputTopic = 'input-value-filter';
export const outputTopic = 'output-value-filter';

const valueFilterKey: AvscAvroSchema = {
  type: 'record',
  name: 'ValueFilterKey',
  namespace: 'com.reposity.tests',
  fields: [{ name: 'contextCode', type: 'string' }],
};

const valueFilterValue: AvscAvroSchema = {
  type: 'record',
  name: 'ValueFilterValue',
  namespace: 'com.reposity.tests',
  fields: [
    { name: 'itemId', type: 'string' },
    { name: 'businessUnit', type: 'string' },
  ],
};

export const inputTopicLightSchema: KafkaJSAvroSchema = {
  type: 'record',
  name: valueFilterValue.name, // should be the same name
  namespace: 'com.reposity.tests',
  fields: [{ name: 'businessUnit', type: 'string' }],
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
      avro: valueFilterKey,
      subject: `${inputTopic}-key`,
    },
    {
      avro: valueFilterValue,
      subject: `${inputTopic}-value`,
    },
    {
      avro: valueFilterKey,
      subject: `${outputTopic}-key`,
    },
    {
      avro: valueFilterValue,
      subject: `${outputTopic}-value`,
    },
  ],
};
