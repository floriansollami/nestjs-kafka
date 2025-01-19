import { type Deserializer } from '@nestjs/microservices';

export class KafkaVoidDeserializer implements Deserializer<Buffer, null> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async deserialize(_data: Buffer): Promise<null> {
    return null;
  }
}
