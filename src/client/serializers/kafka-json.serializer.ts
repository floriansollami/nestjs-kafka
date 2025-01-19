import { isPlainObject } from '@nestjs/common/utils/shared.utils';
import { type Serializer } from '@nestjs/microservices';

export class KafkaJSONSerializer implements Serializer<NonNullable<unknown>, Promise<Buffer | string>> {
  async serialize(value: NonNullable<unknown>): Promise<Buffer | string> {
    if (Buffer.isBuffer(value)) {
      return value;
    }

    if (isPlainObject(value) || Array.isArray(value)) {
      return JSON.stringify(value);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (value as any).toString();
  }
}
