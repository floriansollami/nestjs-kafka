import { INestApplication, ModuleMetadata, Type } from '@nestjs/common';
import { CustomTransportStrategy, MicroserviceOptions } from '@nestjs/microservices';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test, TestingModule } from '@nestjs/testing';
import {
  BatchConfig,
  DeserializerEnum,
  ErrorHandlerEnum,
  Filters,
  InputTopic,
  KAFKA_SERVER,
  KafkaModule,
  OutputTopic,
  ProcessingModeEnum,
  SerializerEnum,
  TopicDefinition,
  TopicType,
} from '../src';
import { ErrorHandler, ErrorHandlerFunction } from '../src/kafka-error-handlers';
import { HeaderFilterFunction } from '../src/kafka-header-filter.interface';
import { KeyFilterFunction } from '../src/kafka-key-filter.interface';
import { ValueFilterFunction } from '../src/kafka-value-filter.interface';

interface InputTopicMapping {
  input: TopicDefinition & {
    topic: InputTopic & {
      filters: Filters;
      imports: Type<unknown>[];
      inject: unknown[];
    };
  };
  output: TopicDefinition & { topic: OutputTopic };
}

export class TestModuleBuilder {
  private controllers: ModuleMetadata['controllers'] = [];
  private readonly kafkaTopics: InputTopicMapping;

  constructor() {
    this.kafkaTopics = {
      input: {
        name: 'inputTopic',
        type: TopicType.INPUT,
        topic: {
          consumer: {
            maxWaitTimeInMs: 1000, // Allows to stop quickly the consumer if there are no more messages to consume.
          },
          processingMode: ProcessingModeEnum.MESSAGE,
          deserializers: {
            keyDeserializer: DeserializerEnum.AVRO,
            valueDeserializer: DeserializerEnum.AVRO,
          },
          filters: {},
          imports: [],
          inject: [],
        },
      },
      output: {
        name: 'outputTopic',
        type: TopicType.OUTPUT,
        topic: {
          producer: {
            allowAutoTopicCreation: false,
          },
          serializers: {
            keySerializer: SerializerEnum.AVRO,
            valueSerializer: SerializerEnum.AVRO,
          },
        },
      },
    };
  }

  static create(): TestModuleBuilder {
    return new TestModuleBuilder();
  }

  setInputTopic(inputTopic: string): this {
    this.kafkaTopics.input.name = inputTopic;
    return this;
  }

  setOutputTopic(outputTopic: string): this {
    this.kafkaTopics.output.name = outputTopic;
    return this;
  }

  setBatchConfig(config?: BatchConfig): this {
    this.kafkaTopics.input.topic.batch = config;
    return this;
  }

  setProcessingMode(processingMode = ProcessingModeEnum.MESSAGE): this {
    this.kafkaTopics.input.topic.processingMode = processingMode;
    return this;
  }

  setHeaderFilter(filter: HeaderFilterFunction): this {
    this.kafkaTopics.input.topic.filters.headerFilter = filter;
    return this;
  }

  setKeyFilter(filter: KeyFilterFunction): this {
    this.kafkaTopics.input.topic.filters.keyFilter = filter;
    return this;
  }

  withoutValueFilter(): this {
    this.kafkaTopics.input.topic.filters.valueFilter = { filter: undefined };
    return this;
  }

  setValueFilter<T>(filter?: ValueFilterFunction<T>): this {
    this.kafkaTopics.input.topic.filters.valueFilter = { filter };
    return this;
  }

  ignoreTombstone(ignoreTombstone: boolean): this {
    if (this.kafkaTopics.input.topic.filters.valueFilter) {
      this.kafkaTopics.input.topic.filters.valueFilter.ignoreTombstone = ignoreTombstone;
    }

    return this;
  }

  setErrorHandler(handler: ErrorHandlerEnum | ErrorHandlerFunction | ErrorHandler): this {
    this.kafkaTopics.input.topic.errorHandler = handler;

    return this;
  }

  setErrorHandlerToInject(module: Type<unknown>, inject: unknown): this {
    this.kafkaTopics.input.topic.imports = [module];
    this.kafkaTopics.input.topic.inject = [inject];

    return this;
  }

  addControllers(controllers: ModuleMetadata['controllers']): this {
    this.controllers = controllers;
    return this;
  }

  async build(): Promise<INestApplication> {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        KafkaModule.forRoot({
          config: { retry: { retries: 1 } },
        }),

        KafkaModule.forFeatureAsync([
          {
            name: this.kafkaTopics.input.name,
            type: TopicType.INPUT,
            imports: this.kafkaTopics.input.topic.imports,
            useFactory: (errorHandler: ErrorHandler): InputTopic => ({
              errorHandler: errorHandler,
              ...this.kafkaTopics.input.topic,
            }),
            inject: this.kafkaTopics.input.topic.inject,
          },
          {
            name: this.kafkaTopics.output.name,
            type: TopicType.OUTPUT,
            useFactory: (): OutputTopic => this.kafkaTopics.output.topic,
          },
        ]),
      ],
      controllers: this.controllers,
    }).compile();

    const app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());

    const strategy = app.get<CustomTransportStrategy>(KAFKA_SERVER);

    app.connectMicroservice<MicroserviceOptions>({ strategy });
    app.enableShutdownHooks();

    await app.startAllMicroservices();
    await app.init();

    return app;
  }
}
