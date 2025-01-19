# Key Filtering

## Overview

Our Kafka library provides a powerful mechanism for message key filtering. Key filtering can be configured through the `forFeature(Async)` method of the `KafkaModule`, allowing each feature module to specify custom filtering logic on a per-topic basis.

This feature is particularly useful when filtering messages based on deserialized keys. However, note that the full key is deserialized, so it may be less performant compared to header filtering.

## Key Filter Type Definition

The `keyFilter` property in an input topic configuration supports the use of a custom function to define key filtering logic:

```typescript
type Filters = {
  ...,
  keyFilter?: KeyFilterFunction;
};
```

1. **KeyFilterFunction** – Define a custom key filter function to specify which messages should be processed.

### Key Filter Function

To provide a custom filter, you need to define a function that adheres to the `KeyFilter` interface:

```typescript
interface KeyFilter<T = unknown> {
  matches(deserializedKey: T): boolean;
}
```

Parameters:

- **deserializedKey**: The deserialized key of the message, which contains various fields that you can use to filter messages.

This setup allows you to apply your predicate logic based on the deserialized key to decide whether to keep the message.

#### Example

```ts
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { KafkaModule, TopicType, DecodeFunction, SerializedHeader } from '@fsol/nestjs-kafka';

type MessageKey = { businessUnit: string; };

@Module({
  imports: [
    KafkaModule.forFeatureAsync([
      {
        name: 'STOCK_PRICES',
        type: TopicType.INPUT,
        useFactory: (config: ConfigService) => ({
          consumer: {
            groupId: config.getOrThrow('KAFKA_CONSUMER_GROUP_ID'),
            minBytes: 16000,
            maxBytesPerPartition: 1048576,
            maxBytes: 10485760,
            maxWaitTimeInMs: 1000,
          },
          run: {
            partitionsConsumedConcurrently: 1,
          },
          subscribe: {
            fromBeginning: true,
          },
          filters: {
            keyFilter: (deserializedKey: MessageKey) => deserializedKey.businessUnit === config.getOrThrow('BUSINESS_UNIT');
            ,
          },
        }),
        inject: [ConfigService],
      },
    ]),
  ],
  controllers: [],
  providers: [],
  exports: [],
})
export class StockModule {}
```
