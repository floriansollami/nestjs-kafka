import { Logger } from '@nestjs/common';
import { type KafkaContext } from '@nestjs/microservices';

export interface ErrorHandler {
  handle(thrownError: unknown, context: KafkaContext): Promise<void>;
}

export type ErrorHandlerFunction = ErrorHandler['handle'];

export class DefaultErrorHandler implements ErrorHandler {
  private logger = new Logger(this.constructor.name);

  async handle(thrownError: unknown, context: KafkaContext): Promise<void> {
    this.logger.error('Error processing kafka message', {
      error: thrownError,
      context: {
        topic: context.getTopic(),
        partition: context.getPartition(),
        offset: context.getMessage().offset,
        timestamp: context.getMessage().timestamp,
      },
    });

    throw thrownError;
  }
}

export class SkipAndContinueErrorHandler implements ErrorHandler {
  private logger = new Logger(this.constructor.name);

  async handle(thrownError: unknown, context: KafkaContext): Promise<void> {
    this.logger.error('Error processing kafka message', {
      error: thrownError,
      context: {
        topic: context.getTopic(),
        partition: context.getPartition(),
        offset: context.getMessage().offset,
        timestamp: context.getMessage().timestamp,
      },
    });

    // not rethrowing
  }
}
