import { Controller, Inject } from '@nestjs/common';
import { Payload } from '@nestjs/microservices';
import { ConsumeTopic, KAFKA_SERVICE, type Message } from '../../src';
import { type MessageService } from '../../src/message-service.interface';
import { inputTopic, type MessageKey, type MessageValue, outputTopic } from './header-filter.fixture';

@Controller()
export class HeaderFilterController {
  constructor(
    @Inject(KAFKA_SERVICE)
    private readonly messageService: MessageService,
  ) {}

  @ConsumeTopic(inputTopic)
  async test1(
    @Payload()
    message: Message<MessageKey, MessageValue>,
  ): Promise<void> {
    await this.messageService.emit<MessageKey, MessageValue>({
      topic: outputTopic,
      messages: [message],
    });
  }
}
