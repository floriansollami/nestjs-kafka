import { SchemaRegistry, SchemaType } from '@kafkajs/confluent-schema-registry';
import 'reflect-metadata'; // fix Reflect.getMetadata is not a function
import { TopicNamingStrategy } from '../../kafka-options.types';
import { KafkaLibAvroSchemaIdNotFoundInMemoryError } from '../../kafka.errors';
import { KafkaAvroSerializer, KafkaAvroSerializerConfig } from './kafka-avro.serializer';

jest.mock('@kafkajs/confluent-schema-registry');

describe('KafkaAvroSerializer', () => {
  describe('constructor', () => {
    it('should initialize with default values when no config is provided', () => {
      new KafkaAvroSerializer({});

      expect(SchemaRegistry).toHaveBeenCalledWith({ host: 'http://localhost:8081' }, { [SchemaType.AVRO]: undefined });
    });

    it('should initialize with provided config values', () => {
      const config: KafkaAvroSerializerConfig = {
        schemaRegistryConfig: {
          host: 'http://custom-host:8081',
        },
        avroOptions: { referencedSchemas: [] },
        topicNamingStrategy: TopicNamingStrategy.TOPIC_NAME_STRATEGY,
        isKey: true,
        schemaFetchIntervalSeconds: 1800,
      };

      new KafkaAvroSerializer(config);

      // Check if the SchemaRegistry was instantiated with custom values
      expect(SchemaRegistry).toHaveBeenCalledWith(
        { host: 'http://custom-host:8081' }, // Custom host
        { AVRO: config.avroOptions }, // Custom avroOptions
      );
    });
  });

  describe('serialize', () => {
    let serializer: KafkaAvroSerializer;
    let encodeSpy: jest.SpyInstance;
    let getLatestSchemaIdSpy: jest.SpyInstance;

    beforeAll(() => {
      jest.useFakeTimers();
    });

    beforeEach(() => {
      serializer = new KafkaAvroSerializer({ schemaFetchIntervalSeconds: 60 });
      encodeSpy = jest.spyOn(SchemaRegistry.prototype, 'encode');
      getLatestSchemaIdSpy = jest.spyOn(SchemaRegistry.prototype, 'getLatestSchemaId');
    });

    afterEach(() => {
      jest.clearAllTimers();
      jest.clearAllMocks();
    });

    afterAll(() => {
      jest.useRealTimers();
    });

    it('should throw an error if schema id is not found in memory', async () => {
      serializer = new KafkaAvroSerializer({
        schemaFetchIntervalSeconds: Number.MAX_SAFE_INTEGER, // to be always less than Date.now()}
      });

      await expect(serializer.serialize({ id: '1' }, { topic: 'topic-test' })).rejects.toThrow(
        KafkaLibAvroSchemaIdNotFoundInMemoryError,
      );
    });

    it('should serialize messages correctly', async () => {
      getLatestSchemaIdSpy.mockResolvedValueOnce(1);

      encodeSpy.mockImplementation(async (schemaId: number, value: unknown) => {
        return Buffer.from(JSON.stringify(value), 'utf8');
      });

      const result = await serializer.serialize({ id: '1' }, { topic: 'topic-test' });

      expect(encodeSpy).toHaveBeenCalledTimes(1);
      expect(result).toEqual(Buffer.from(JSON.stringify({ id: '1' }), 'utf8'));
    });

    it('should update schemas when interval has passed', async () => {
      getLatestSchemaIdSpy.mockResolvedValueOnce(1).mockResolvedValueOnce(2);

      await serializer.serialize({ id: '1' }, { topic: 'topic-test' });
      expect(getLatestSchemaIdSpy).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(61000); // Advance Jest timers by 61 seconds (more than 60 seconds)

      // Perform another serialization which should trigger another schema fetch due to interval
      await serializer.serialize({ id: '1' }, { topic: 'topic-test' });
      expect(getLatestSchemaIdSpy).toHaveBeenCalledTimes(2);
    });

    it('should not update schemas when the interval has not passed', async () => {
      getLatestSchemaIdSpy.mockResolvedValueOnce(1).mockResolvedValueOnce(2);

      await serializer.serialize({ id: '1' }, { topic: 'topic-test' });
      expect(getLatestSchemaIdSpy).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(59000); // Advance by 59 seconds (less than 60 seconds)

      // getLatestSchemaId should not have been called again since the interval has not passed
      await serializer.serialize({ id: '1' }, { topic: 'topic-test' });
      expect(getLatestSchemaIdSpy).toHaveBeenCalledTimes(1);
    });
  });
});
