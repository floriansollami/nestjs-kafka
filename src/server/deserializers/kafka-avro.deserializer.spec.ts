import { SchemaRegistry, SchemaType } from '@kafkajs/confluent-schema-registry';
import { type KafkaJSAvroSchema } from '../../kafka-message.types';
import { KafkaAvroDeserializer } from './kafka-avro.deserializer';

jest.mock('@kafkajs/confluent-schema-registry');

describe('KafkaAvroDeserializer', () => {
  let decodeMock: jest.SpyInstance;
  let deserializer: KafkaAvroDeserializer;

  beforeEach(() => {
    deserializer = new KafkaAvroDeserializer();

    decodeMock = jest.spyOn(SchemaRegistry.prototype, 'decode').mockImplementation(async (buffer: Buffer) => {
      return JSON.parse(buffer.toString());
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should instantiate SchemaRegistry with default host', () => {
      const config = {
        host: 'http://localhost:8082',
        clientId: 'client-id-test',
      };
      const avroOptions = {
        namespace: 'namespace-test',
      };

      new KafkaAvroDeserializer(config, avroOptions);

      expect(SchemaRegistry).toHaveBeenCalledWith(config, {
        [SchemaType.AVRO]: avroOptions,
      });
    });

    it('should instantiate SchemaRegistry with provided host', () => {
      const config = {
        clientId: 'client-id-test',
      };
      const avroOptions = {
        namespace: 'namespace-test',
      };

      new KafkaAvroDeserializer(config, avroOptions);

      expect(SchemaRegistry).toHaveBeenCalledWith(
        {
          ...config,
          host: 'http://localhost:8081',
        },
        {
          [SchemaType.AVRO]: avroOptions,
        },
      );
    });
  });

  describe('deserialize', () => {
    it('should deserialize the data using the registry and return the result (with light schema)', async () => {
      const data = Buffer.from(JSON.stringify({ key: 'value' }));
      const lightSchema = {} as KafkaJSAvroSchema;

      const result = await deserializer.deserialize(data, { lightSchema });

      expect(decodeMock).toHaveBeenCalledWith(data, {
        [SchemaType.AVRO]: { readerSchema: lightSchema },
      });
      expect(result).toEqual({ key: 'value' });
    });

    it('should deserialize the data using the registry and return the result (without light schema)', async () => {
      const data = Buffer.from(JSON.stringify({ key: 'value' }));

      const result = await deserializer.deserialize(data);

      expect(decodeMock).toHaveBeenCalledWith(data, {
        [SchemaType.AVRO]: { readerSchema: undefined },
      });
      expect(result).toEqual({ key: 'value' });
    });
  });
});
