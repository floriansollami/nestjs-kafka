# Error Handlers

## Overview

Our Kafka library provides a comprehensive error-handling mechanism for managing exceptions during Kafka message processing. This feature is essential for building reliable and fault-tolerant Kafka consumer applications by allowing you to define specific error-handling strategies for each topic.

Error handlers can be configured through the `forFeature(Async)` method of the `KafkaModule`, allowing each feature module to specify how to handle errors on a per-topic basis.

## Error Handler Type Definition

The `errorHandler` property in an input topic configuration supports three types:

```typescript
type InputTopic = {
  ...,
  errorHandler?: ErrorHandlerEnum | ErrorHandlerFunction | ErrorHandler;
};
```

1. **ErrorHandlerEnum** – Use built-in error handlers.
2. **ErrorHandlerFunction** – Define a custom error-handling function.
3. **ErrorHandler** – Use a custom class that implements the `ErrorHandler` interface.

### Enum to Use Existing Error Handlers

Two built-in error handlers are available in the library as part of the `ErrorHandlerEnum`.

#### Default Error Handler

The `DefaultErrorHandler` logs the error details and rethrows it, passing control to KafkaJS’s upstream error-handling mechanism as described in [External Errors (thrown by your application logic)](./kafkajs-external-error.png). This approach is suitable for cases where a retry should be attempted, and if unsuccessful, will terminate the application.

```typescript
import { KafkaModule, topicEnum, TopicType, ErrorHandlerEnum } from '@fsol/nestjs-kafka';

KafkaModule.forFeature([
  {
    name: topicEnum.COMMERCIAL_PROPOSAL_V1,
    type: TopicType.INPUT,
    topic: {
      errorHandler: ErrorHandlerEnum.DEFAULT,
    },
  },
]);
```

#### Skip and Continue Error Handler

The `SkipAndContinueErrorHandler` logs the error but does not rethrow it, enabling the consumer to skip the current message and continue processing the next message. This is useful when certain errors can be safely ignored without disrupting the message flow.

#### Example

```typescript
import { KafkaModule, topicEnum, TopicType, ErrorHandlerEnum } from '@fsol/nestjs-kafka';

KafkaModule.forFeature([
  {
    name: topicEnum.COMMERCIAL_PROPOSAL_V1,
    type: TopicType.INPUT,
    topic: {
      errorHandler: ErrorHandlerEnum.SKIP_AND_CONTINUE,
    },
  },
]);
```

### Custom Function

You can also provide a custom error-handling function directly to the `errorHandler` property. This function must conform to the `ErrorHandler` interface method signature:

```typescript
interface ErrorHandler {
  handle(thrownError: unknown, context: KafkaContext): Promise<void>;
}
```

Parameters:

- **thrownError**: The exception that was thrown during message processing.
- **context**: The context includes the Kafka message that caused the exception along with other useful information such as `partition`, `topic`, `heartbeat` function, etc.

This approach is ideal when you need to perform specific actions like logging or recovery steps without creating a dedicated error handler class.

#### Example

```typescript
import { KafkaModule, topicEnum, TopicType } from '@fsol/nestjs-kafka';

KafkaModule.forFeature([
  {
    name: topicEnum.COMMERCIAL_PROPOSAL_V1,
    type: TopicType.INPUT,
    topic: {
      errorHandler: async (thrownError: unknown, context: KafkaContext): Promise<void> => {
        console.error('Error encountered in Kafka message processing:', {
          error: thrownError,
          topic: context.getTopic(),
          partition: context.getPartition(),
          offset: context.getMessage().offset,
        });

        if (thrownError instanceof SomeSpecificError) {
          await someRecoveryFunction(context);
        }
      },
    },
  },
]);
```

### Custom Class

For advanced error-handling requirements, you can create a custom error handler class by implementing the `ErrorHandler` interface. This class-based approach is useful when you need to manage dependencies or encapsulate complex error-handling logic.

```typescript
interface ErrorHandler {
  handle(thrownError: unknown, context: KafkaContext): Promise<void>;
}
```

Parameters:

- **thrownError**: The exception that was thrown during message processing.
- **context**: The context includes the Kafka message that caused the exception along with other useful information such as `partition`, `topic`, `heartbeat` function, etc.

#### Example

```typescript
import { type ErrorHandler, type KafkaContext } from '@fsol/nestjs-kafka';
import { InjectMetrics, MetricsService } from '@libs/metrics';
import { Logger, Module } from '@nestjs/common';

class MetricsErrorHandler implements ErrorHandler {
  private logger = new Logger(this.constructor.name);

  constructor(@InjectMetrics() private readonly metricsService: MetricsService) {}

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

    this.metricsService.increment('kafka.errors.count');
  }
}

@Module({
  providers: [MetricsErrorHandler],
  exports: [MetricsErrorHandler],
})
class ErrorHandlerModule {}
```

To use the custom error handler class, configure the topic with `forFeatureAsync` and inject the class instance.

```typescript
import { KafkaModule, topicEnum, TopicType, type ErrorHandler, type InputTopic } from '@fsol/nestjs-kafka';

KafkaModule.forFeatureAsync([
  {
    name: topicEnum.COMMERCIAL_PROPOSAL_V1,
    type: TopicType.INPUT,
    imports: [ErrorHandlerModule],
    useFactory: (errorHandler: ErrorHandler): InputTopic => ({
      errorHandler,
    }),
    inject: [MetricsErrorHandler],
  },
]);
```
