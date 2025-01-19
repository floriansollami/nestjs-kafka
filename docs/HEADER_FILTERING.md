# Header Filtering

## Overview

`KafkaModule` provides a streamlined mechanism for filtering messages based on headers, configured directly within the `forFeature` method of the input topic configuration.

Header filtering is particularly useful for performance in multi-topic scenarios, as it enables you to process only the relevant messages without deserializing the full message body—just by inspecting the headers.

## Header Filter Type Definition

The `headerFilter` property in an input topic configuration supports the use of a custom function to define header filtering logic:

```typescript
type Filters = {
  ...,
  headerFilter?: HeaderFilterFunction;
};
```

1. **HeaderFilterFunction** – Define a custom header filter function to specify which messages should be processed.

### Header Filter Function

The header filter function uses the `HeaderFilter` interface to evaluate the headers of each message before processing. This function provides flexibility, allowing you to decode only the header fields you need and apply your custom filtering logic.

```typescript
interface HeaderFilter<T extends string = string> {
  matches(header: SerializedHeader<T>, decode: DecodeFunction): boolean;
}
```

Parameters:

- **header**: The raw header of the message, containing key-value pairs.
- **decode**: A decode function for interpreting the raw header values.

#### Example

```typescript
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { KafkaModule, TopicType, DecodeFunction, SerializedHeader } from '@fsol/nestjs-kafka';

type MessageHeader = 'businessUnit' | 'traceId';

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
            headerFilter: (header: SerializedHeader<MessageHeader>, decode: DecodeFunction) =>
              decode(header.businessUnit) === config.getOrThrow('businessUnit'),
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
