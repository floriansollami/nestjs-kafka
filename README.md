# @fsol/nestjs-kafka [WIP]

> **Note:** During the development of `@fsol/nestjs-kafka`, Confluent introduced [`confluent-kafka-javascript`](https://github.com/confluentinc/confluent-kafka-javascript), a native JavaScript client for Apache Kafka. This client aims to provide high performance and reliability by leveraging the `librdkafka` C library. However, as of now, it is not yet production-ready. Therefore, our library continues to utilize `KafkaJS` to ensure stability in production environments. We are monitoring the progress of `confluent-kafka-javascript` and will consider its integration once it matures.

## Overview

`@fsol/nestjs-kafka` is a robust library designed to integrate **KafkaJS** seamlessly with **NestJS** applications. It simplifies the setup and management of Kafka through a dynamic module approach, facilitating efficient configuration for both producers and consumers.

Unlike the existing [NestJS Kafka](https://docs.nestjs.com/microservices/kafka), which primarily focuses on client-server communication and lacks support for batch consumption—a critical feature for high-performance requirements—`@fsol/nestjs-kafka` was custom-built to address these specific needs. This design choice ensures enhanced customizability and faster message processing.

Drawing inspiration from popular libraries like [@nestjs/typeorm](https://www.npmjs.com/package/@nestjs/typeorm) and [@nestjs/mongoose](https://www.npmjs.com/package/@nestjs/mongoose), `@fsol/nestjs-kafka` employs a `forFeature` approach. This method allows developers to define and configure consumed and produced topics with their respective settings within individual modules, promoting modularity and clarity in topic management. In contrast, other libraries, such as [nestjs-kafka](https://www.npmjs.com/package/nestjs-kafka), require extending abstract consumers, which can be less intuitive and flexible. Additionally, `@fsol/nestjs-kafka` retains the decorator-based design of NestJS's internal Kafka transport, combining the best of both worlds to provide a clear and powerful solution without the need to connect multiple microservices for different configurations.

Key features of `@fsol/nestjs-kafka` include:

- **Single or Batch Message Consumption**: Efficiently handle messages with support for both individual and batch processing.
- **Confluent Schema Registry Integration**: Seamlessly integrate with Confluent’s Schema Registry for schema validation and management.
- **Support for Compression Codecs**: Utilize compression formats like **lz4**, **snappy**, and **gzip** to optimize message transmission.
- **Header, Key, or Value Filtering**: Allows filtering of messages based on headers, keys, or values, enabling precise control over message processing workflows.
- **Error Handling Mechanism**: Incorporates an error handler mechanism similar to Spring Boot's Kafka error handler, providing structured error processing.

By adopting this tailored approach, `@fsol/nestjs-kafka` offers a clear and powerful solution for building scalable, Kafka-driven microservices in NestJS, aligning with the specific performance and customization needs of development teams.

## Getting Started

Ensure you have KafkaJS and NestJS set up in your project. This guide assumes you're familiar with basic NestJS project structure and configuration.

### Installation

First, add `@fsol/nestjs-kafka` to your project:

```sh
npm install @fsol/nestjs-kafka
```

Note: `@fsol/nestjs-kafka` has the following peer dependencies that need to be installed separately. These dependencies ensure compatibility and extend functionality within your NestJS application:

- @nestjs/common (version ^10.2.10), @nestjs/core (version ^10.3.0), and @nestjs/microservices (version ^10.2.10) are required for NestJS integration.
- @kafkajs/confluent-schema-registry (version ^3.3.0) is also optional and should be included if you intend to use Avro serialization and deserialization.

### Configuration in AppModule

#### Using `forRootAsync`

```ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TimestampMicrosDate } from '@libs/common';
import { KafkaModule, CompressionTypes, Partitioners } from '@fsol/nestjs-kafka';

@Module({
  imports: [
    KafkaModule.forRootAsync({
      useFactory: (config: ConfigService) => ({
        client: {
          producer: {
            createPartitioner: Partitioners.DefaultPartitioner,
            allowAutoTopicCreation: false,
            idempotent: false,
          },
          send: {
            acks: -1,
            compression: CompressionTypes.GZIP,
          },
        },
        config: {
          brokers: [config.getOrThrow('KAFKA_HOST')],
          ssl: {
            rejectUnauthorized: false,
          },
          sasl: {
            mechanism: 'plain',
            username: config.getOrThrow('KAFKA_SASL_USERNAME'),
            password: config.getOrThrow('KAFKA_SASL_PASSWORD'),
          },
          clientId: config.getOrThrow('KAFKA_CLIENT_ID'),
        },
        schemaRegistry: {
          config: {
            host: config.getOrThrow('KAFKA_SCHEMA_REGISTRY'),
            auth: {
              username: config.getOrThrow('KAFKA_SCHEMA_REGISTRY_USERNAME'),
              password: config.getOrThrow('KAFKA_SCHEMA_REGISTRY_PASSWORD'),
            },
          },
          options: {
            avro: {
              logicalTypes: { 'timestamp-micros': TimestampMicrosDate },
            },
          },
        },
        server: {
          consumer: {
            groupId: config.getOrThrow('KAFKA_CONSUMER_GROUP_ID'),
            sessionTimeout: 60000,
            maxBytesPerPartition: 50000,
          },
          run: {
            autoCommit: true,
            eachBatchAutoResolve: true,
            partitionsConsumedConcurrently: 1,
          },
          subscribe: {
            fromBeginning: true,
          },
        },
      }),
      inject: [ConfigService],
    }),
  ],
})
export class AppModule {}
```

### Configuration in Feature Modules

#### Using `forFeature`

```ts
import { Module } from '@nestjs/common';
import { KafkaModule, TopicType, ProcessingModeEnum } from '@fsol/nestjs-kafka';

@Module({
  imports: [
    KafkaModule.forFeature([
      {
        name: 'STOCK_PRICES',
        type: TopicType.INPUT,
        topic: {
          consumer: {
            groupId: 'my-consumer-group-id',
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
          deserializers: {
            keyDeserializer: DeserializerEnum.STRING,
            valueDeserializer: DeserializerEnum.AVRO,
          },
          processingMode: ProcessingModeEnum.MESSAGE,
        },
      },
      {
        name: 'PROCESSED_STOCKS',
        type: TopicType.OUTPUT,
        topic: {
          producer: {
            createPartitioner: Partitioners.DefaultPartitioner,
            allowAutoTopicCreation: false,
          },
          send: {
            acks: -1,
            compression: CompressionTypes.GZIP,
          },
          serializers: {
            keySerializer: SerializerEnum.AVRO,
            valueSerializer: SerializerEnum.AVRO,
          },
        },
      },
    ]),
  ],
  controllers: [],
  providers: [],
  exports: [],
})
export class StockModule {}
```

#### Using `forFeatureAsync`

The `forFeatureAsync` method is suitable for asynchronous configuration, enabling you to inject services or providers to dynamically determine the topic configurations. Here's how to implement it:

```ts
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CompressionTypes,
  InputTopic,
  KafkaModule,
  OutputTopic,
  Partitioners,
  SerializerEnum,
  TopicType,
  processingMode
} from '@fsol/nestjs-kafka';

@Module({
  imports: [
    KafkaModule.forFeatureAsync([
      {
        name: 'STOCK_PRICES',
        type: TopicType.INPUT,
        useFactory: (config: ConfigService): InputTopic => ({
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
          deserializers: {
            keyDeserializer: DeserializerEnum.STRING,
            valueDeserializer: DeserializerEnum.AVRO,
          },
          processingMode: ProcessingModeEnum.MESSAGE,
        }),
        inject: [ConfigService],
      },
      {
        name: 'PROCESSED_STOCKS',
        type: TopicType.OUTPUT,
        useFactory: (config: ConfigService): OutputTopic => ({
          producer: {
            createPartitioner: Partitioners.DefaultPartitioner,
            allowAutoTopicCreation: config.getOrThrow('KAFKA_PRODUCER_AUTO_TOPIC_CREATION'),
          },
          send: {
            acks: -1,
            compression: CompressionTypes.GZIP,
          },
          serializers: {
            keySerializer: SerializerEnum.AVRO,
            valueSerializer: SerializerEnum.AVRO,
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
export class StockOfferModule {}
```

### Consuming Topics

To consume Kafka topics in a NestJS application, you can use the @ConsumeTopic decorator. This decorator automatically injects the messages into your controller methods and handles filtering based on consumer configurations.

#### Single Message Mode

In this mode, the controller receives individual messages.
Note: If filters are defined in the consumer configuration, only relevant messages will be processed.

```ts
import { Controller } from '@nestjs/common';
import { Payload } from '@nestjs/microservices';
import { ConsumeTopic, Message } from '@fsol/nestjs-kafka';
import { StockPriceUpdated } from '../../__generated__/kafka/stock-price-value';
import { UpdateStockPriceUseCases } from './update-stock-price.use-case';

@Controller()
export class UpdateStockPriceController {
  constructor(private readonly updateStockPriceUseCases: UpdateStockPriceUseCases) {}

  @ConsumeTopic('STOCK_PRICES')
  async updateStockPrice(@Payload() message: Message<string, StockPriceUpdated>): Promise<void> {
    const result = await this.updateStockPriceUseCases.execute(message.value);

    if (result.isErr()) {
      throw result.unwrapError();
    }
  }
}
```

#### Batch Mode

If batch mode is enabled, the Kafka batch will be represented as an array of messages.
Note: If filters are defined in the consumer configuration, only relevant messages will be processed.

```ts
import { Controller } from '@nestjs/common';
import { Payload } from '@nestjs/microservices';
import { StockPriceUpdatesException } from '@libs/core';
import { ConsumeTopic, KafkaLibBatchFailedError, Message } from '@fsol/nestjs-kafka';
import { StockPriceUpdated } from '../../__generated__/kafka/stock-price-value';
import { UpdateStockPricesUseCase } from './update-stock-prices.use-case';

@Controller()
export class UpdateStockPricesController {
  constructor(private readonly updateStockPricesUseCases: UpdateStockPricesUseCase) {}

  @ConsumeTopic('STOCK-PRICES')
  async updateStockPrices(@Payload() messages: Message<string, StockPriceUpdated>[]): Promise<void> {
    const stockPricesValues = messages.map(message => message.value);

    const result = await this.updateStockPricesUseCases.execute(stockPricesValues);

    if (!result.isErr()) {
      return;
    }

    const error = result.unwrapError();

    if (error instanceof StockPriceUpdatesException) {
      const firstFailedStock = error.getFirstFailedStock();
      const stock = firstFailedStock.getProps();

      const consumeMessage = messages.find(message => stock.id === message.value.stockId);

      if (consumeMessage) {
        throw new KafkaLibBatchFailedError({ consumeMessage, cause: error });
      }
    }

    throw error;
  }
}
```

## Current issue

In NestJS's native Kafka custom transport, consuming multiple topics or producing to multiple topics with consumers and producers having different configurations is only possible by connecting multiple microservices with distinct configurations. For example:

```ts
const app = await NestFactory.create(AppModule);
const configService = app.get(ConfigService);

app.connectMicroservice(KAFKA_CONSUMER1_OPTION);
app.connectMicroservice(KAFKA_CONSUMER2_OPTION);
```

Unfortunately, as highlighted in NestJS issues [#11298](https://github.com/nestjs/nest/issues/11298) and [#13421](https://github.com/nestjs/nest/issues/13421), this approach does not work as expected. Even when configuring multiple Kafka clients with different groupIds and distinct options, each client ends up consuming messages from all topics. This leads to event duplication and mismanagement of consumer responsibilities.

The `@fsol/nestjs-kafka` library follows the same behavior and currently supports only one topic for consumption and one topic for production. This limitation stems from the underlying challenges in handling multiple Kafka clients within a single NestJS application.

In our team, it is a recommended practice to have one consumer per microservice to simplify the architecture and ensure clear separation of responsibilities. However, if consuming or producing multiple topics within a single application is a requirement, this library will need to be adapted to support such use cases.

## Kafka Message Filtering

### Header Filtering

For detailed information on how to filter Kafka messages based on header filter, please refer to the [Message Header Filtering Documentation](docs/HEADER_FILTERING.md).

### Key Filtering

For detailed information on how to filter Kafka messages based on key filter, please refer to the [Message Key Filtering Documentation](docs/KEY_FILTERING.md).

### Value Filtering

For detailed information on how to filter Kafka messages based on value filter, please refer to the [Message Value Filtering Documentation](docs/VALUE_FILTERING.md).

## Error Handling

### KafkaJS Error Mechanism

For detailed information on how `KafkaJS` handles errors, including `retriable` and `non-retriable `errors, please refer to the [KafkaJS Error Handling Documentation](docs/KAFKAJS_ERROR_HANDLING.md).

### Handle Errors During Message Processing

For detailed information on how to manage and handle errors that occur during message processing, please refer to the [Error Handlers Documentation.](docs/ERROR_HANDLERS.md).

## Codecs and Serialization

For detailed information on Kafka codecs and serialization, please refer to the [Kafka Codecs and Serialization Documentation](docs/CODECS_AND_SERIALIZATION.md).

## Kafka Batch Size Calculation

For detailed information on calculating the ideal `maxBytesPerPartition` and `maxBytes` for Kafka, please refer to the [Kafka Batch Size Calculation Documentation](docs/BATCH_SIZE_CALCULATION.md).
