import { Controller, UseFilters } from '@nestjs/common';
import { Payload } from '@nestjs/microservices';
import { KafkaJSProtocolError } from 'kafkajs';
import { ConsumeTopic, Message } from '../../src';
import { inputTopic, MessageKey, MessageValue } from './kafkajs-crash-error.fixtures';
import { TestAllExceptionsFilter } from '@libs/testing';

export class SimulateKafkaJSNonRetriableError extends KafkaJSProtocolError {
  constructor() {
    super({
      type: 'OFFSET_OUT_OF_RANGE',
      code: 1,
      retriable: false,
      message: 'The requested offset is not within the range of offsets maintained by the server',
    } as unknown as Error);
  }
}

export class SimulateKafkaJSRetriableError extends KafkaJSProtocolError {
  constructor() {
    super({
      type: 'UNSTABLE_OFFSET_COMMIT',
      code: 88,
      retriable: true,
      message: 'There are unstable offsets that need to be cleared',
    } as unknown as Error);
  }
}

@Controller()
@UseFilters(new TestAllExceptionsFilter()) // avoid default NestJS ExceptionsHandler to re-map the thrown error.
export class KafkaJsCrashErrorController {
  @ConsumeTopic(inputTopic)
  async test1(
    @Payload()
    message: Message<MessageKey, MessageValue>,
  ): Promise<void> {
    if (message.headers?.['traceId'] === '1') {
      throw new SimulateKafkaJSNonRetriableError();
    }

    if (message.headers?.['traceId'] === '2') {
      throw new SimulateKafkaJSRetriableError();
    }
  }
}
