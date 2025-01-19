import { type KafkaJSAvroSchema } from './kafka-message.types';

export interface ValueFilter<T = unknown> {
  lightSchema?: KafkaJSAvroSchema;
  matches(deserializedValue: T): boolean;
}

export type ValueFilterFunction<T = unknown> = ValueFilter<T>['matches'];
