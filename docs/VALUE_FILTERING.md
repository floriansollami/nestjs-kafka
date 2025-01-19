# Value Filtering

## Overview

This library provides a powerful mechanism for message value filtering. Value filtering can be configured through the `forFeature(Async)` method of the `KafkaModule`, allowing each feature module to specify custom filtering logic on a per-topic basis.

> **⚠️ This feature can be particularly useful if you need to filter messages based on values. For performance reasons, to avoid deserializing the full message value, this decorator provides a way to specify a lightweight Avro schema, allowing you to deserialize only the fields required for your filter.**

## Value Filter Type Definition

The `valueFilter` property in an input topic configuration supports the use of an object to define value filtering logic:

```typescript
type Filters = {
  ...,
  valueFilter?: {
    lightSchema?: KafkaJSAvroSchema;
    filter: ValueFilterFunction;
  };
};
```

1. **KafkaJSAvroSchema** – The lightSchema property enables you to deserialize only the necessary fields required for filtering, significantly improving performance by avoiding full message deserialization.

2. **ValueFilterFunction** – The filter function allows you to define a predicate to decide whether to keep specific messages based on their values.

### Value Filter Function

To provide a custom filter, you need to define a function that adheres to the `ValueFilter` interface:

```typescript
interface ValueFilter<T = unknown> {
  matches(deserializedValue: T): boolean;
}
```

Parameters:

- **deserializedValue**: The deserialized value of the message, which contains various fields that you can use to filter messages.

This setup allows you to apply your predicate logic based on the deserialized value to decide whether to keep the message.

#### Example

```ts
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { KafkaModule, TopicType, DecodeFunction, SerializedHeader, KafkaJSAvroSchema } from '@fsol/nestjs-kafka';

type MessageValue = { businessUnit: string; itemId: string };

const aLightAvroSchema: KafkaJSAvroSchema = {
  type: 'record',
  name: 'Example',
  fields: [{ name: 'businessUnit', type: 'string' }],
};

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
            valueFilter: {
              lightSchema: aLightAvroSchema,
              filter: (deserializedValue: MessageValue): boolean =>
                deserializedValue.businessUnit === config.getOrThrow('BUSINESS_UNIT'),
            },
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
