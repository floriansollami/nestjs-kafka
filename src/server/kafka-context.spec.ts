import { type Consumer, type KafkaMessage } from 'kafkajs';
import { KafkaContext, type KafkaContextParams } from './kafka-context';
import { KafkaLibMessageUnsetKeyError, KafkaLibMessageUnsetValueError } from './kafka.errors';

describe('KafkaContext', () => {
  let kafkaContext: KafkaContext;
  let mockParams: KafkaContextParams;

  beforeEach(() => {
    mockParams = {
      partition: 0,
      topic: 'test-topic',
      consumer: {} as Consumer,
      heartbeat: jest.fn(),
    };

    kafkaContext = new KafkaContext(mockParams);
  });

  it('should initialize with default values', () => {
    expect(kafkaContext.getMessage()).toEqual({});
    expect(kafkaContext.getPartition()).toBe(mockParams.partition);
    expect(kafkaContext.getTopic()).toBe(mockParams.topic);
    expect(kafkaContext.getConsumer()).toBe(mockParams.consumer);
    expect(kafkaContext.getHeartbeat()).toBe(mockParams.heartbeat);
    expect(kafkaContext.getProducer()).toEqual({});
    expect(kafkaContext.getDecodedHeaders()).toBeUndefined();
    expect(kafkaContext.getDeserializedKey()).toBeUndefined();
    expect(kafkaContext.getDeserializedValue()).toBeUndefined();
    expect(kafkaContext.isValueFullyDeserialized()).toBe(false);
  });

  it('should throw an error when setDecodedHeaders is called and message is not set', () => {
    expect(() => kafkaContext.setDecodedHeaders({})).toThrow(KafkaLibMessageUnsetKeyError);
  });

  it('should throw an error when setDeserializedKey is called and message is not set', () => {
    expect(() => kafkaContext.setDeserializedKey('test-key')).toThrow(KafkaLibMessageUnsetKeyError);
  });

  it('should throw an error when setDeserializedValue is called and message is not set', () => {
    expect(() => kafkaContext.setDeserializedValue('test-value')).toThrow(KafkaLibMessageUnsetValueError);
  });

  it('should throw an error when setDeserializedValue is called with partial deserialization and message is not set', () => {
    expect(() => kafkaContext.setDeserializedValue('test-value', true)).toThrow(KafkaLibMessageUnsetValueError);
  });

  it('should correctly set and retrieve message, headers, and deserialized data', () => {
    const message: KafkaMessage = {
      key: Buffer.from('previous-test-key'),
      value: Buffer.from('previous-test-value'),
      timestamp: Date.now().toString(),
      attributes: 2,
      offset: '1',
      headers: {
        'x-previous-test-id': Buffer.from('previous-test-id'),
      },
    };

    kafkaContext.setRawMessage(message);

    expect(kafkaContext.getMessage()).toBe(message);
    expect(kafkaContext.getDecodedHeaders()).toBeUndefined();
    expect(kafkaContext.getDeserializedKey()).toBeUndefined();
    expect(kafkaContext.getDeserializedValue()).toBeUndefined();
    expect(kafkaContext.isValueFullyDeserialized()).toBe(false);

    kafkaContext.setDecodedHeaders({
      'x-previous-test-id': 'previous-test-id',
    });
    kafkaContext.setDeserializedKey('previous-test-key');
    kafkaContext.setDeserializedValue('previous-test-value');

    expect(kafkaContext.getDecodedHeaders()).toEqual({
      'x-previous-test-id': 'previous-test-id',
    });
    expect(kafkaContext.getDeserializedKey()).toBe('previous-test-key');
    expect(kafkaContext.getDeserializedValue()).toBe('previous-test-value');
    expect(kafkaContext.isValueFullyDeserialized()).toBe(true);
  });
});
