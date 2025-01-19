import { type AvscAvroSchema, type Fixture } from '@libs/testing';

export type MessageKey = { businessUnit: string };
export type MessageValue = {
  contextCode: string;
};

export const inputTopic = 'input-custom-class-error-handler';
export const outputTopic = 'output-custom-class-error-handler';

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
