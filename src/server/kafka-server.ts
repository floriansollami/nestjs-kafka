import { Logger } from '@nestjs/common';
import {
  type CustomTransportStrategy,
  type Deserializer,
  KafkaLogger,
  type MessageHandler,
  Server,
  Transport,
} from '@nestjs/microservices';
import {
  type Consumer,
  type ConsumerConfig,
  type ConsumerCrashEvent,
  type ConsumerRunConfig,
  type EachBatchPayload,
  Kafka,
  type KafkaConfig,
  KafkaJSNonRetriableError,
  KafkaJSNumberOfRetriesExceeded,
  type KafkaMessage,
} from 'kafkajs';
import { isObservable, lastValueFrom } from 'rxjs';
import { KafkaStringDeserializer } from './codecs/deserializers/kafka-string.deserializer';
import { KafkaContext } from './kafka-context';
import { DefaultErrorHandler, type ErrorHandler } from './kafka-error-handlers';
import { type HeaderFilter } from './kafka-header-filter.interface';
import { type KeyFilter } from './kafka-key-filter.interface';
import { type ConsumeMessage, KafkaJSAvroSchema } from './kafka-message.types';
import { type ConsumerSubscribeConfig, type Filters, type PartialConsumerConfig, type RunConfig } from './kafka-options.types';
import { type ValueFilter } from './kafka-value-filter.interface';
import {
  KafkaLibDeserializationError,
  KafkaLibDeserializerNotSetError,
  KafkaLibHeaderFilterError,
  KafkaLibKeyFilterError,
} from './kafka.errors';
import { type Deserializers } from './kafka.providers';

export type KafkaServerConfig = {
  kafka?: Partial<KafkaConfig>;
  postfixId?: string;
};

export type ConsumerOptions = {
  consumer?: PartialConsumerConfig;
  run?: RunConfig;
  subscribe?: ConsumerSubscribeConfig;
};

export class KafkaServer extends Server implements CustomTransportStrategy {
  public readonly transportId = Transport.KAFKA;

  protected override logger = new Logger(this.constructor.name);

  private postfixId: string;
  private readonly kafkaConfig: KafkaConfig;

  private consumerConfig?: ConsumerConfig;
  private consumerRunConfig?: ConsumerRunConfig;
  private consumerSubscribeConfig?: ConsumerSubscribeConfig;

  private client: Kafka | null = null;
  private consumer: Consumer | null = null;

  private keyDeserializer?: Deserializer<Buffer, unknown>;
  private valueDeserializer?: Deserializer<Buffer, unknown>;

  private errorHandler: ErrorHandler = new DefaultErrorHandler();

  private headerFilter?: HeaderFilter;
  private keyFilter?: KeyFilter;
  private valueFilter?: ValueFilter;

  constructor(config: KafkaServerConfig = {}) {
    super();

    this.postfixId = config.postfixId ?? 'server';
    this.kafkaConfig = {
      ...config.kafka,
      brokers: config.kafka?.brokers ?? ['localhost:9092'],
      clientId: `${config.kafka?.clientId ?? 'nestjs-consumer'}-${this.postfixId}`,
      logCreator: config.kafka?.logCreator ?? KafkaLogger.bind(null, this.logger),
    };
  }

  setConsumerConfig(options: ConsumerOptions): void {
    const { consumer } = options;

    this.consumerConfig = {
      ...consumer,
      groupId: `${consumer?.groupId ?? 'nestjs-group'}-${this.postfixId}`,
      retry: {
        ...consumer?.retry,
        restartOnFailure: consumer?.retry?.restartOnFailure ?? this.restartOnFailure.bind(this),
      },
    };

    this.consumerRunConfig = {
      ...options.run,
      eachBatch: this.handleBatch.bind(this),
    };

    this.consumerSubscribeConfig = options.subscribe;
  }

  setDeserializers(deserializers: Deserializers): void {
    this.keyDeserializer = deserializers.keyDeserializer;
    this.valueDeserializer = deserializers.valueDeserializer;
  }

  setHandlers(errorHandler: ErrorHandler, filters?: Filters): void {
    this.errorHandler = errorHandler;

    if (filters?.headerFilter) {
      this.headerFilter = { matches: filters.headerFilter };
    }

    if (filters?.keyFilter) {
      this.keyFilter = { matches: filters.keyFilter };
    }

    if (filters?.valueFilter) {
      this.valueFilter = {
        lightSchema: filters.valueFilter.lightSchema,
        matches: filters.valueFilter.filter,
      };
    }
  }

  // called 2nd by NestJS
  async listen(callback: (error?: unknown, ...optionalParams: unknown[]) => void): Promise<void> {
    try {
      if (!this.consumerConfig) {
        throw new Error('Consumer configuration is not provided');
      }

      this.client = new Kafka(this.kafkaConfig);
      this.consumer = this.client.consumer(this.consumerConfig);
      this.consumer.on(this.consumer.events.CRASH, this.handleConsumerCrash.bind(this));

      await this.consumer.connect();
      await this.consumer.subscribe({
        ...this.consumerSubscribeConfig,
        topics: [...this.messageHandlers.keys()],
      });
      await this.consumer.run(this.consumerRunConfig);

      callback();
    } catch (error) {
      this.logger.error(error);
      callback(error);
    }
  }

  async close(): Promise<void> {
    if (this.consumer) {
      await this.consumer.disconnect();
      this.consumer = null;
    }

    this.client = null;
  }

  private async restartOnFailure(error: Error): Promise<boolean> {
    if (error instanceof KafkaJSNumberOfRetriesExceeded) {
      this.logger.error('kafkajs retries are exhausted', { error });
    } else {
      this.logger.error('kafkajs error occured', { error });
    }

    process.kill(process.pid, 'SIGTERM'); // gracefully shutdown NestJS

    return false;
  }

  private handleConsumerCrash(event: ConsumerCrashEvent): void {
    const { error } = event.payload;

    if (error instanceof KafkaJSNumberOfRetriesExceeded) {
      return; // already handled by restartOnFailure hook
    }

    if (error instanceof KafkaJSNonRetriableError) {
      this.logger.error('kafkajs nonretriable error occurred', { event });
    } else {
      this.logger.error('kafkajs error occurred', { event });
    }

    process.kill(process.pid, 'SIGTERM'); // gracefully shutdown NestJS
  }

  private async handleBatch(payload: EachBatchPayload): Promise<void> {
    if (!this.consumer) {
      throw new Error('Consumer instance is not initialized');
    }

    const { batch, isRunning, isStale, heartbeat } = payload;
    const { topic, messages, partition } = batch;
    const handler = this.messageHandlers.get(topic);

    if (!handler) {
      throw new Error(`Handler not found for topic "${topic}"`);
    }

    const context = new KafkaContext({
      partition,
      topic,
      consumer: this.consumer,
      heartbeat,
    });

    for (const message of messages) {
      if (!isRunning() || isStale()) {
        throw new Error('Stale or non-running status');
      }

      context.setRawMessage(message);

      const [headerFilterPassed, keyFilterPassed, valueFilterPassed] = await Promise.all([
        this.applyHeaderFilter(message, context),
        this.applyKeyFilter(message, context),
        this.applyValueFilter(message, context),
      ]);

      if (headerFilterPassed && keyFilterPassed && valueFilterPassed) {
        await this.processHandler(handler, message, context);
      }
    }
  }

  private async applyHeaderFilter(message: KafkaMessage, context: KafkaContext): Promise<boolean> {
    try {
      if (!this.headerFilter) {
        return true;
      }

      // before kafka 0.11.0 headers were optional
      const { headers } = message;

      if (!headers || !Object.keys(headers).length) {
        throw new KafkaLibHeaderFilterError();
      }

      return this.headerFilter.matches(headers, KafkaStringDeserializer.decode);
    } catch (error) {
      await this.errorHandler.handle(error, context);

      return false;
    }
  }

  private async deserializeKey(key: Buffer | null): Promise<unknown> {
    if (!this.keyDeserializer) {
      throw new KafkaLibDeserializerNotSetError();
    }

    if (!key) {
      return null;
    }

    try {
      return await this.keyDeserializer.deserialize(key);
    } catch (error) {
      throw new KafkaLibDeserializationError(error);
    }
  }

  private async applyKeyFilter(message: KafkaMessage, context: KafkaContext): Promise<boolean> {
    try {
      if (!this.keyFilter) {
        return true;
      }

      const { key } = message;

      if (!key) {
        throw new KafkaLibKeyFilterError();
      }

      const deserializedKey = await this.deserializeKey(key);

      context.setDeserializedKey(deserializedKey);

      return this.keyFilter.matches(deserializedKey);
    } catch (error) {
      await this.errorHandler.handle(error, context);

      return false;
    }
  }

  private async deserializeValue(value: Buffer | null, lightSchema?: KafkaJSAvroSchema): Promise<unknown> {
    if (!this.valueDeserializer) {
      throw new KafkaLibDeserializerNotSetError();
    }

    if (!value) {
      return null;
    }

    try {
      return await this.valueDeserializer.deserialize(value, { lightSchema });
    } catch (error) {
      throw new KafkaLibDeserializationError(error);
    }
  }

  private async applyValueFilter(message: KafkaMessage, context: KafkaContext): Promise<boolean> {
    try {
      const { value } = message;
      const isTombstone = !value;

      if (!this.valueFilter || isTombstone) {
        return true;
      }

      const { lightSchema } = this.valueFilter;
      const deserializedValue = await this.deserializeValue(value, lightSchema);

      context.setDeserializedValue(deserializedValue, !!lightSchema);

      return this.valueFilter.matches(deserializedValue);
    } catch (error) {
      await this.errorHandler.handle(error, context);

      return false;
    }
  }

  private async processHandler(
    handler: MessageHandler<ConsumeMessage, KafkaContext, unknown>,
    message: KafkaMessage,
    context: KafkaContext,
  ): Promise<void> {
    try {
      const deserializedMessage = {
        key: context.getDeserializedKey() ?? (await this.deserializeKey(message.key)),
        value: context.isValueFullyDeserialized() ? context.getDeserializedValue() : await this.deserializeValue(message.value),
        timestamp: message.timestamp,
        attributes: message.attributes,
        offset: message.offset,
        headers: message.headers ? KafkaStringDeserializer.decodeHeaders(message.headers) : {},
        size: message.size,
      };

      context.setDecodedHeaders(deserializedMessage.headers);
      context.setDeserializedKey(deserializedMessage.key);
      context.setDeserializedValue(deserializedMessage.value);

      const resultOrStream = await handler(deserializedMessage, context);

      // e.g: using an interceptor
      if (isObservable(resultOrStream)) {
        await lastValueFrom(resultOrStream);
      }
    } catch (error) {
      await this.errorHandler.handle(error, context);
    } finally {
      await context.getHeartbeat()();
    }
  }
}
