import { type Deserializer } from '@nestjs/microservices';
import { type IHeaders } from 'kafkajs';
import { type DeserializedHeaderValue, type Headers } from '../../kafka-message.types';

export class KafkaStringDeserializer implements Deserializer<Buffer, string> {
  static decode(value: IHeaders[string]): DeserializedHeaderValue {
    return Array.isArray(value) ? value.map(item => item.toString()) : value?.toString();
  }

  /**
   * NOTE: this approach ensure that the original headers
   * object from the Kafka message is not mutated. This is
   * particularly important in scenarios where Kafka might
   * retry sending the message in case of an error.
   */
  static decodeHeaders(headers: IHeaders): Headers {
    return Object.fromEntries(Object.entries(headers).map(([key, value]) => [key, KafkaStringDeserializer.decode(value)]));
  }

  async deserialize(data: Buffer): Promise<string> {
    return data.toString();
  }
}
