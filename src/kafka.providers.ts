import { flatten, Provider } from '@nestjs/common';
import { CORE_MODULE_OPTIONS, KAFKA_SERVER, KAFKA_SERVER_TEMP, KAFKA_SERVICE, KAFKA_SERVICE_TEMP } from './kafka.constants';
import { KafkaModuleOptions } from './kafka-options.types';
import { KafkaServer } from './server/kafka-server';
import { KafkaClient } from './client/kafka-client';

export function createKafkaAsyncProviders(factories: AsyncTopicFactory[]): Provider[] {
  return [
    setUpInputTopics(factories.filter(factory => factory.type === TopicType.INPUT)),
    setUpOutputTopics(factories.filter(factory => factory.type === TopicType.OUTPUT)),
  ];
}

function setUpInputTopics(inputFactories: AsyncTopicFactory[]): Provider {
  return {
    provide: KAFKA_SERVER_TEMP,
    useFactory: async (moduleOptions: KafkaModuleOptions, kafkaServer: KafkaServer, ...args: unknown[]): Promise<KafkaServer> => {
      for (const factory of inputFactories) {
        // TODO promise all
        const topic = (await factory.useFactory(...args)) as InputTopic;

        const config = moduleOptions.schemaRegistry?.config;
        const { consumer, run, subscribe, deserializers } = topic;
        const consumerOptions = { consumer, run, subscribe };

        kafkaServer.setConsumerConfig(consumerOptions);
        kafkaServer.setDeserializers(createDeserializers(deserializers, config));
        kafkaServer.setHandlers(createErrorHandler(topic?.errorHandler), topic?.filters);
      }

      return kafkaServer;
    },
    inject: [CORE_MODULE_OPTIONS, KAFKA_SERVER, ...new Set(flatten(inputFactories.map(factory => factory.inject ?? [])))],
  };
}

function setUpOutputTopics(outputFactories: AsyncTopicFactory[]): Provider {
  return {
    provide: KAFKA_SERVICE_TEMP,
    useFactory: async (moduleOptions: KafkaModuleOptions, kafkaClient: KafkaClient, ...args: unknown[]): Promise<KafkaClient> => {
      if (!outputFactories.length) {
        return kafkaClient;
      }

      for (const factory of outputFactories) {
        // TODO promise all
        const topic = (await factory.useFactory(...args)) as OutputTopic;

        const config = moduleOptions.schemaRegistry?.config;
        const { producer, send, serializers } = topic;

        kafkaClient.setProducerConfig(producer, send);
        kafkaClient.setSerializers(createSerializers(serializers, config));
      }

      await kafkaClient.connect();

      return kafkaClient;
    },
    inject: [CORE_MODULE_OPTIONS, KAFKA_SERVICE, ...new Set(flatten(outputFactories.map(factory => factory.inject ?? [])))],
  };
}

export type Deserializers = {
  keyDeserializer: Deserializer;
  valueDeserializer: Deserializer;
};

export type Serializers = {
  keySerializer: Serializer;
  valueSerializer: Serializer;
};

function createDeserializers(
  deserializer: DeserializerOptions = {},
  schemaRegistryConfig?: SchemaRegistryAPIClientConfig,
): Deserializers {
  const { keyDeserializer = DeserializerEnum.STRING, valueDeserializer = DeserializerEnum.STRING, avroOptions } = deserializer;

  const deserializerMap = {
    [DeserializerEnum.VOID]: new KafkaVoidDeserializer(),
    [DeserializerEnum.STRING]: new KafkaStringDeserializer(),
    [DeserializerEnum.AVRO]: new KafkaAvroDeserializer(schemaRegistryConfig, avroOptions),
  };

  return {
    keyDeserializer: deserializerMap[keyDeserializer],
    valueDeserializer: deserializerMap[valueDeserializer],
  };
}

function createErrorHandler(errorHandler?: ErrorHandlerEnum | ErrorHandlerFunction | ErrorHandler): ErrorHandler {
  if (errorHandler === ErrorHandlerEnum.SKIP_AND_CONTINUE) {
    return new SkipAndContinueErrorHandler();
  }

  if (isFunction(errorHandler)) {
    return { handle: errorHandler };
  }

  if (isObject(errorHandler) && isFunction(errorHandler.handle)) {
    return errorHandler;
  }

  return new DefaultErrorHandler();
}

function createSerializers(
  deserializer: SerializerOptions = {},
  schemaRegistryConfig?: SchemaRegistryAPIClientConfig,
): Serializers {
  const {
    keySerializer = SerializerEnum.JSON,
    valueSerializer = SerializerEnum.JSON,
    avroOptions,
    keyStrategy = TopicNamingStrategy.TOPIC_NAME_STRATEGY,
    valueStrategy = TopicNamingStrategy.TOPIC_NAME_STRATEGY,
  } = deserializer;

  const serializerMap = {
    [SerializerEnum.VOID]: (): Serializer => new KafkaVoidSerializer(),
    [SerializerEnum.JSON]: (): Serializer => new KafkaJSONSerializer(),
    [SerializerEnum.AVRO]: (isKey: boolean): Serializer =>
      new KafkaAvroSerializer({
        schemaRegistryConfig,
        avroOptions,
        topicNamingStrategy: isKey ? keyStrategy : valueStrategy,
        isKey,
      }),
  };

  return {
    keySerializer: serializerMap[keySerializer](true),
    valueSerializer: serializerMap[valueSerializer](false),
  };
}
