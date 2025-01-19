import { Controller, Inject } from '@nestjs/common';
import { Ctx, Payload } from '@nestjs/microservices';
import { ConsumeMessage, ConsumeTopic, isTombstone, KAFKA_SERVICE, Tombstone } from '../../src';
import { type KafkaContext } from '../../src/kafka-context';
import { type MessageService } from '../../src/message-service.interface';
import { inputTopic, type MessageKey, type MessageValue, outputTopic } from './value-filter.fixtures';

@Controller()
export class ValueFilterController {
  static tombstoneMessage: Tombstone<MessageKey>;
  static isValueFullyDeserialized: boolean = false;

  constructor(@Inject(KAFKA_SERVICE) private readonly messageService: MessageService) {}

  @ConsumeTopic(inputTopic)
  async test1(@Payload() message: ConsumeMessage<MessageKey, MessageValue>, @Ctx() context: KafkaContext): Promise<void> {
    if (isTombstone(message)) {
      ValueFilterController.tombstoneMessage = message;
      return;
    }

    if (context.isValueFullyDeserialized()) {
      ValueFilterController.isValueFullyDeserialized = context.isValueFullyDeserialized();
    }

    await this.messageService.emit<MessageKey, MessageValue>({
      topic: outputTopic,
      messages: [message],
    });
  }
}
