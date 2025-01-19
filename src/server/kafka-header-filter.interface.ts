import { type KafkaStringDeserializer } from './codecs/deserializers/kafka-string.deserializer';

export type SerializedHeaderValue = Buffer | string | (Buffer | string)[] | undefined;

export type SerializedHeader<T extends string> = {
  [K in T]: SerializedHeaderValue;
};

export type DecodeFunction = typeof KafkaStringDeserializer.decode;

export interface HeaderFilter<T extends string = string> {
  matches(header: SerializedHeader<T>, decode: DecodeFunction): boolean;
}

export type HeaderFilterFunction<T extends string = string> = HeaderFilter<T>['matches'];
