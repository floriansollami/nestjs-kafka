import { type Serializer } from '@nestjs/microservices';
import { CompressionTypes, Kafka } from 'kafkajs';
import { ClientKafka } from './kafka-client';
import {
  KafkaLibProducerNotSetError,
  KafkaLibProducerSendError,
  KafkaLibSerializationError,
  KafkaLibSerializerNotSetError,
} from './kafka.errors';

const mockProducer = {
  connect: jest.fn(),
  send: jest.fn(),
  disconnect: jest.fn(),
};

const createMockProducer = jest.fn(() => mockProducer);

jest.mock('kafkajs', () => ({
  Kafka: jest.fn(() => ({
    producer: createMockProducer,
  })),
  CompressionTypes: {
    None: 0,
    GZIP: 1,
    Snappy: 2,
    LZ4: 3,
    ZSTD: 4,
  },
}));

describe('ClientKafka', () => {
  let clientKafka: ClientKafka;
  let mockSerializers: {
    keySerializer: jest.Mocked<Serializer>;
    valueSerializer: jest.Mocked<Serializer>;
  };

  beforeEach(() => {
    mockSerializers = {
      keySerializer: { serialize: jest.fn() },
      valueSerializer: { serialize: jest.fn() },
    };

    clientKafka = new ClientKafka({
      kafka: {
        brokers: ['localhost:9000'],
        clientId: 'test-client-id',
      },
      postfixId: 'test-postfix-id',
    });

    clientKafka.setProducerConfig(
      { allowAutoTopicCreation: false },
      {
        acks: -1,
        timeout: 3600,
        compression: CompressionTypes.GZIP,
      },
    );
    clientKafka.setSerializers(mockSerializers);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create an instance with default values', () => {
      clientKafka = new ClientKafka();

      expect(Kafka).toHaveBeenCalledWith({
        brokers: ['localhost:9092'],
        clientId: 'nestjs-consumer-client',
        logCreator: expect.any(Function),
      });
      expect(clientKafka).toBeInstanceOf(ClientKafka);
    });

    it('should create an instance with custom values', () => {
      expect(Kafka).toHaveBeenCalledWith({
        brokers: ['localhost:9000'],
        clientId: 'test-client-id-test-postfix-id',
        logCreator: expect.any(Function),
      });

      expect(clientKafka).toBeInstanceOf(ClientKafka);
    });
  });

  describe('connect', () => {
    it('should throw an error if Kafka client is not set', async () => {
      clientKafka['client'] = null;

      try {
        await clientKafka.connect();
      } catch (error) {
        expect(error).toEqual(new Error('Kafka client is not set'));
      }
    });

    it('should create and connect the producer', async () => {
      await clientKafka.connect();

      expect(createMockProducer).toHaveBeenCalled();
      expect(mockProducer.connect).toHaveBeenCalled();
    });
  });

  describe('emit', () => {
    it('should throw error if producer is not set', async () => {
      await expect(clientKafka.emit({ topic: 'test', messages: [] })).rejects.toThrow(KafkaLibProducerNotSetError);
    });

    it('should throw error if key serializer is not set', async () => {
      await clientKafka.connect();

      clientKafka['keySerializer'] = undefined;

      await expect(
        clientKafka.emit({
          topic: 'test-topic',
          messages: [{ key: {}, value: {} }],
        }),
      ).rejects.toThrow(KafkaLibSerializerNotSetError);
    });

    it('should throw error if value serializer is not set', async () => {
      await clientKafka.connect();

      clientKafka['valueSerializer'] = undefined;

      await expect(
        clientKafka.emit({
          topic: 'test-topic',
          messages: [{ key: {}, value: {} }],
        }),
      ).rejects.toThrow(KafkaLibSerializerNotSetError);
    });

    it('should throw serialization error if key serialization fails', async () => {
      await clientKafka.connect();

      mockSerializers.keySerializer.serialize.mockRejectedValue(new Error('Serialization Error'));

      await expect(
        clientKafka.emit({
          topic: 'test-topic',
          messages: [{ key: { a: 1 }, value: { b: 2 } }],
        }),
      ).rejects.toThrow(KafkaLibSerializationError);
    });

    it('should throw serialization error if value serialization fails', async () => {
      await clientKafka.connect();

      mockSerializers.valueSerializer.serialize.mockRejectedValue(new Error('Serialization Error'));

      await expect(
        clientKafka.emit({
          topic: 'test-topic',
          messages: [{ key: { a: 1 }, value: { b: 2 } }],
        }),
      ).rejects.toThrow(KafkaLibSerializationError);
    });

    it('should skip serialization if key is null', async () => {
      await clientKafka.connect();
      await clientKafka.emit({
        topic: 'test-topic',
        messages: [{ key: null, value: { b: 2 } }],
      });

      expect(mockSerializers.keySerializer.serialize).not.toHaveBeenCalled();
    });

    it('should skip serialization if value is null', async () => {
      await clientKafka.connect();
      await clientKafka.emit({
        topic: 'test-topic',
        messages: [{ value: null }],
      });

      expect(mockSerializers.valueSerializer.serialize).not.toHaveBeenCalled();
    });

    it('should throw error if producer fails to send', async () => {
      await clientKafka.connect();

      mockProducer.send.mockRejectedValueOnce(new Error('Producer Send Error'));

      await expect(
        clientKafka.emit({
          topic: 'test-topic',
          messages: [{ value: undefined }],
        }),
      ).rejects.toThrow(KafkaLibProducerSendError);
    });

    it('should send serialized data', async () => {
      await clientKafka.connect();

      mockSerializers.keySerializer.serialize.mockResolvedValue(Buffer.from(JSON.stringify({ a: 1 }), 'utf8'));
      mockSerializers.valueSerializer.serialize.mockResolvedValue(Buffer.from(JSON.stringify({ b: 2 }), 'utf8'));

      await clientKafka.emit({
        topic: 'test-topic',
        messages: [{ key: { a: 1 }, value: { b: 2 } }],
      });

      expect(mockProducer.send).toHaveBeenCalledWith({
        topic: 'test-topic',
        messages: [
          {
            key: Buffer.from(JSON.stringify({ a: 1 }), 'utf8'),
            value: Buffer.from(JSON.stringify({ b: 2 }), 'utf8'),
          },
        ],
        acks: -1,
        timeout: 3600,
        compression: CompressionTypes.GZIP,
      });
    });
  });

  describe('close', () => {
    it('should disconnect producer and reset client', async () => {
      await clientKafka.connect();
      await clientKafka.close();

      expect(mockProducer.disconnect).toHaveBeenCalled();
      expect(clientKafka['producer']).toBeNull();
      expect(clientKafka['client']).toBeNull();
    });

    it('should handle case when producer is null', async () => {
      clientKafka['producer'] = null;
      await clientKafka.close();

      expect(clientKafka['producer']).toBeNull();
      expect(clientKafka['client']).toBeNull();
    });
  });
});
