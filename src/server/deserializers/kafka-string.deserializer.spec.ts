import { type Deserializer } from '@nestjs/microservices';
import { KafkaStringDeserializer } from './kafka-string.deserializer';

describe('KafkaStringDeserializer', () => {
  let deserializer: Deserializer;

  beforeEach(() => {
    deserializer = new KafkaStringDeserializer();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('decode', () => {
    it('should convert Buffer to string', () => {
      const buffer = Buffer.from('test');
      expect(KafkaStringDeserializer.decode(buffer)).toEqual('test');
    });

    it('should leave a string as string', () => {
      expect(KafkaStringDeserializer.decode('test')).toEqual('test');
    });

    it('should convert an array of Buffers and strings to an array of strings', () => {
      const mixedArray = [Buffer.from('hello'), 'world'];
      expect(KafkaStringDeserializer.decode(mixedArray)).toEqual(['hello', 'world']);
    });

    it('should return undefined if input is undefined', () => {
      expect(KafkaStringDeserializer.decode(undefined)).toBeUndefined();
    });
  });

  describe('decodeHeaders', () => {
    it('should decode a simple headers object', () => {
      const headers = {
        'content-type': Buffer.from('application/json'),
        retry: 'true',
      };
      const expected = {
        'content-type': 'application/json',
        retry: 'true',
      };
      expect(KafkaStringDeserializer.decodeHeaders(headers)).toEqual(expected);
    });

    it('should handle empty headers gracefully', () => {
      expect(KafkaStringDeserializer.decodeHeaders({})).toEqual({});
    });
  });

  describe('deserialize', () => {
    it('should convert buffer data to a string', async () => {
      const buffer = Buffer.from('test string');
      const result = await deserializer.deserialize(buffer);

      expect(result).toEqual('test string');
    });
  });
});
