import { Controller, Inject, UseFilters } from '@nestjs/common';
import { Payload } from '@nestjs/microservices';
import { TestAllExceptionsFilter } from '@libs/testing';
import { ConsumeTopic, KAFKA_SERVICE, type Message } from '../../../../src';
import { type MessageService } from '../../../../src/message-service.interface';
import { type MessageKey, type MessageValue, inputTopic, outputTopic } from './custom-function-error-handler.fixtures';

@Controller()
@UseFilters(new TestAllExceptionsFilter()) // avoid default NestJS ExceptionsHandler to re-map the thrown error.
export class CustomFunctionErrorHandlerController {
  constructor(
    @Inject(KAFKA_SERVICE)
    private readonly messageService: MessageService,
  ) {}

  @ConsumeTopic(inputTopic)
  async test1(
    @Payload()
    message: Message<MessageKey, MessageValue>,
  ): Promise<void> {
    if (message.value.contextCode === '22') {
      throw new Error();
    }

    await this.messageService.emit<MessageKey, MessageValue>({
      topic: outputTopic,
      messages: [message],
    });
  }
}
