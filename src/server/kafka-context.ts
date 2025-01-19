import { KafkaContext as NestKafkaContext } from '@nestjs/microservices';
import { type Consumer, type KafkaMessage, type Producer } from 'kafkajs';
import { type ConsumeMessageKey, type ConsumeMessageValue, type Headers } from './kafka-message.types';
import { KafkaLibMessageUnsetKeyError, KafkaLibMessageUnsetValueError } from './kafka.errors';

export type KafkaContextParams = {
  partition: number;
  topic: string;
  consumer: Consumer;
  heartbeat: () => Promise<void>;
};

enum DeserializationState {
  NOT_DESERIALIZED,
  PARTIALLY_DESERIALIZED,
  FULLY_DESERIALIZED,
}

export class KafkaContext extends NestKafkaContext {
  private decodedHeaders?: Headers;
  private deserializedKey?: ConsumeMessageKey;
  private deserializedValue?: ConsumeMessageValue;
  private valueDeserializationState: DeserializationState;

  constructor(params: KafkaContextParams) {
    super([
      {} as KafkaMessage,
      params.partition,
      params.topic,
      params.consumer,
      params.heartbeat,
      {} as Producer, // we do not use request-response pattern
    ]);

    this.valueDeserializationState = DeserializationState.NOT_DESERIALIZED;
  }

  getDecodedHeaders(): Headers | undefined {
    return this.decodedHeaders;
  }

  getDeserializedKey(): ConsumeMessageKey | undefined {
    return this.deserializedKey;
  }

  getDeserializedValue(): ConsumeMessageValue | undefined {
    return this.deserializedValue;
  }

  isValueFullyDeserialized(): boolean {
    return this.valueDeserializationState === DeserializationState.FULLY_DESERIALIZED && this.deserializedValue !== undefined;
  }

  setRawMessage(message: KafkaMessage): void {
    this.args[0] = message;

    this.decodedHeaders = undefined;
    this.deserializedKey = undefined;
    this.deserializedValue = undefined;
    this.valueDeserializationState = DeserializationState.NOT_DESERIALIZED;
  }

  setDecodedHeaders(headers: Headers): void {
    if (!this.isMessageSet()) {
      throw new KafkaLibMessageUnsetKeyError();
    }

    this.decodedHeaders = headers;
  }

  setDeserializedKey(key: ConsumeMessageKey): void {
    if (!this.isMessageSet()) {
      throw new KafkaLibMessageUnsetKeyError();
    }

    this.deserializedKey = key;
  }

  setDeserializedValue(value: ConsumeMessageValue, isPartiallyDeserialized = false): void {
    if (!this.isMessageSet()) {
      throw new KafkaLibMessageUnsetValueError();
    }

    this.deserializedValue = value;
    this.valueDeserializationState = isPartiallyDeserialized
      ? DeserializationState.PARTIALLY_DESERIALIZED
      : DeserializationState.FULLY_DESERIALIZED;
  }

  private isMessageSet(): boolean {
    return Object.keys(this.getMessage()).length > 0;
  }
}
