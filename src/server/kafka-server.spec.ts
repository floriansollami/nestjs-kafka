import { type Deserializer, type KafkaContext, type MessageHandler } from '@nestjs/microservices';
import { type EachBatchPayload, Kafka } from 'kafkajs';
import { type ConsumeMessage } from './kafka-message.types';
import { type ConsumerOptions, KafkaServer, type KafkaServerConfig } from './kafka-server';
import { KafkaLibDeserializationError, KafkaLibDeserializerNotSetError } from './kafka.errors';

const mockConsumer = {
  connect: jest.fn(),
  disconnect: jest.fn(),
  subscribe: jest.fn(),
  run: jest.fn(),
  on: jest.fn(),
  events: { CRASH: 'consumer.crash' },
};

jest.mock('kafkajs', () => ({
  Kafka: jest.fn(() => ({
    consumer: jest.fn(() => mockConsumer),
  })),
}));

describe('KafkaServer', () => {
  let mockKeyDeserializer: jest.Mocked<Deserializer>;
  let mockValueDeserializer: jest.Mocked<Deserializer>;
  let kafkaServerConfig: KafkaServerConfig;
  let consumerConfig: ConsumerOptions;
  let callback: MessageHandler<ConsumeMessage, KafkaContext, unknown>;
  let kafkaServer: KafkaServer;

  beforeEach(() => {
    mockKeyDeserializer = { deserialize: jest.fn().mockResolvedValue({}) };
    mockValueDeserializer = { deserialize: jest.fn().mockResolvedValue({}) };

    kafkaServerConfig = {
      kafka: {
        brokers: ['localhost:9093'],
        clientId: 'client-id',
        logCreator: jest.fn(),
      },
      postfixId: 'a-postfix-id',
    };

    consumerConfig = {
      consumer: {
        groupId: 'group-id',
        maxBytesPerPartition: 80000,
        retry: {
          maxRetryTime: 30000,
          initialRetryTime: 300,
          factor: 0.2,
          multiplier: 2,
          retries: 5,
          restartOnFailure: jest.fn(),
        },
      },
      run: { partitionsConsumedConcurrently: 1 },
      subscribe: { fromBeginning: true },
    };

    callback = jest.fn().mockResolvedValue(undefined);

    kafkaServer = new KafkaServer(kafkaServerConfig);
    kafkaServer.setConsumerConfig(consumerConfig);
    kafkaServer.setDeserializers({
      keyDeserializer: mockKeyDeserializer,
      valueDeserializer: mockValueDeserializer,
    });

    kafkaServer['addHandler']('test-topic-1', callback, true);
    kafkaServer['addHandler']('test-topic-2', callback, true);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('listen', () => {
    it('should throw an error when consumer configuration is not provided', async () => {
      kafkaServer['consumerConfig'] = undefined;

      const listenCallback = jest.fn();

      await kafkaServer.listen(listenCallback);

      expect(listenCallback).toHaveBeenCalledWith(new Error('Consumer configuration is not provided'));
    });

    it('should initialize Kafka client with default values and consumer, and handle connection successfully', async () => {
      kafkaServer = new KafkaServer();
      kafkaServer.setConsumerConfig({});
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (kafkaServer as any)['messageHandlers'] = new Map([
        ['test-topic-1', {}],
        ['test-topic-2', {}],
      ]);

      const listenCallback = jest.fn();

      await kafkaServer.listen(listenCallback);

      expect(Kafka).toHaveBeenCalledWith({
        brokers: ['localhost:9092'],
        clientId: 'nestjs-consumer-server',
        logCreator: expect.any(Function),
      });
      expect(mockConsumer.connect).toHaveBeenCalled();
      expect(listenCallback).toHaveBeenCalledWith();
    });

    it('should initialize Kafka client with given values and consumer, and handle connection successfully', async () => {
      const listenCallback = jest.fn();

      await kafkaServer.listen(listenCallback);

      expect(Kafka).toHaveBeenCalledWith({
        ...kafkaServerConfig.kafka,
        clientId: 'client-id-a-postfix-id',
        logCreator: expect.any(Function),
      });
      expect(mockConsumer.connect).toHaveBeenCalled();
      expect(listenCallback).toHaveBeenCalledWith();
    });

    it('should handle errors in connection setup', async () => {
      const error = new Error('Connection failed');

      (Kafka as jest.MockedClass<typeof Kafka>).mockImplementationOnce(() => {
        throw error;
      });

      const listenCallback = jest.fn();

      await kafkaServer.listen(listenCallback);

      expect(listenCallback).toHaveBeenCalledWith(error);
    });
  });

  describe('close', () => {
    it('should disconnect the consumer and nullify client and consumer', async () => {
      await kafkaServer.listen(() => {});
      await kafkaServer.close();

      expect(mockConsumer.disconnect).toHaveBeenCalled();
      expect(kafkaServer['consumer']).toBeNull();
      expect(kafkaServer['client']).toBeNull();
    });

    it('should handle disconnection gracefully when consumer is already null', async () => {
      await kafkaServer.listen(() => {});
      kafkaServer['consumer'] = null;

      await kafkaServer.close();

      expect(kafkaServer['consumer']).toBeNull();
      expect(kafkaServer['client']).toBeNull();
    });
  });

  describe('handleBatch', () => {
    const createPayload = (topic: string, isRunning = true, isStale = false): EachBatchPayload =>
      ({
        batch: { topic, messages: [{ key: {}, value: {} }] },
        isRunning: () => isRunning,
        isStale: () => isStale,
        heartbeat: jest.fn(),
      }) as unknown as EachBatchPayload;

    it('should throw an error if consumer is not initialized', async () => {
      await expect(kafkaServer['handleBatch'](createPayload('unhandled-topic'))).rejects.toThrow(
        'Consumer instance is not initialized',
      );
    });

    it('should throw an error if no handler is found for the topic', async () => {
      await kafkaServer.listen(jest.fn());

      await expect(kafkaServer['handleBatch'](createPayload('unhandled-topic'))).rejects.toThrow(
        'Handler not found for topic "unhandled-topic"',
      );
    });

    it('should throw an error if isRunning returns false', async () => {
      await kafkaServer.listen(jest.fn());

      await expect(kafkaServer['handleBatch'](createPayload('test-topic-1', false))).rejects.toThrow(
        'Stale or non-running status',
      );
    });

    it('should throw an error if isStale returns true', async () => {
      await kafkaServer.listen(jest.fn());

      await expect(kafkaServer['handleBatch'](createPayload('test-topic-1', true, true))).rejects.toThrow(
        'Stale or non-running status',
      );
    });

    it('should throw error if key deserializer is not set', async () => {
      kafkaServer['keyDeserializer'] = undefined;

      await kafkaServer.listen(jest.fn());

      await expect(kafkaServer['handleBatch'](createPayload('test-topic-1'))).rejects.toThrow(KafkaLibDeserializerNotSetError);
    });

    it('should throw error if value deserializer is not set', async () => {
      kafkaServer['valueDeserializer'] = undefined;

      await kafkaServer.listen(jest.fn());

      await expect(kafkaServer['handleBatch'](createPayload('test-topic-1'))).rejects.toThrow(KafkaLibDeserializerNotSetError);
    });

    it('should throw serialization error if key serialization fails', async () => {
      await kafkaServer.listen(jest.fn());

      mockKeyDeserializer.deserialize.mockRejectedValue(new Error('Key deserialization error'));

      await expect(kafkaServer['handleBatch'](createPayload('test-topic-1'))).rejects.toThrow(KafkaLibDeserializationError);

      expect(mockKeyDeserializer.deserialize).toHaveBeenCalled();
    });

    it('should throw serialization error if value serialization fails', async () => {
      await kafkaServer.listen(jest.fn());

      mockValueDeserializer.deserialize.mockRejectedValue(new Error('Value deserialization error'));

      await expect(kafkaServer['handleBatch'](createPayload('test-topic-1'))).rejects.toThrow(KafkaLibDeserializationError);

      expect(mockValueDeserializer.deserialize).toHaveBeenCalled();
    });
  });
});
