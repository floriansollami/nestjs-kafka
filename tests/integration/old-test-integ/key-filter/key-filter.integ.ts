import { type INestApplication } from '@nestjs/common';
import { type CustomTransportStrategy, type MicroserviceOptions } from '@nestjs/microservices';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { KafkaTestHelperWithStrategies } from '@libs/testing';
import { KAFKA_SERVER, KafkaModule } from '../../src';
import { DeserializerEnum, SerializerEnum, TopicType } from '../../src';
import { KeyFilterController } from './key-filter.controller';
import { fixtures, inputTopic, MessageKey, outputTopic } from './key-filter.fixtures';

describe('Key filter controller integration', () => {
  let app: INestApplication;
  let kafkaHelper: KafkaTestHelperWithStrategies;
  let noKeyError: Error;
  const expectedBusinessUnit = 'LMFR';

  beforeEach(async () => {
    kafkaHelper = KafkaTestHelperWithStrategies.createKafkaTestHelper();

    await kafkaHelper.setupEnvironment(fixtures);

    const module = await Test.createTestingModule({
      imports: [
        KafkaModule.forRoot(),
        KafkaModule.forFeature([
          {
            name: inputTopic,
            type: TopicType.INPUT,
            topic: {
              deserializers: {
                keyDeserializer: DeserializerEnum.AVRO,
                valueDeserializer: DeserializerEnum.AVRO,
              },
              filters: {
                keyFilter: (key: MessageKey): boolean => {
                  return key.businessUnit === 'LMFR';
                },
              },
              errorHandler: async (thrownError: Error): Promise<void> => {
                noKeyError = thrownError;
              },
            },
          },
          {
            name: outputTopic,
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
        ]),
      ],
      controllers: [KeyFilterController],
    }).compile();

    app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());

    const strategy = app.get<CustomTransportStrategy>(KAFKA_SERVER);

    app.connectMicroservice<MicroserviceOptions>({ strategy });
    app.enableShutdownHooks();

    await app.startAllMicroservices();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    await kafkaHelper.cleanUp();
  });

  it('should throw an error when a message without a key is sent and key filter is provided', async () => {
    await kafkaHelper.produce(inputTopic, [
      {
        useKeySchema: false,
        useValueSchema: true,
        message: {
          headers: { traceId: '1' },
          key: null, // same behavior with undefined
          value: { contextCode: '99' },
        },
      },
    ]);

    // wait for message to be processed
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(noKeyError.message).toBe('Key filter provided but no key');
  });

  it('should filter out batch messages using the key filter', async () => {
    await kafkaHelper.produce(inputTopic, [
      {
        message: {
          headers: { traceId: '1' },
          key: { businessUnit: 'LMIT' },
          value: { contextCode: '22' },
        },
      },
      {
        message: {
          headers: { traceId: '2' },
          key: { businessUnit: expectedBusinessUnit },
          value: { contextCode: '43' },
        },
      },
      {
        message: {
          headers: { traceId: '3' },
          key: { businessUnit: 'LMES' },
          value: { contextCode: '22' },
        },
      },
    ]);

    // wait for message to be processed
    await new Promise(resolve => setTimeout(resolve, 50));

    const consumedMessages = await kafkaHelper.consumeMessages(outputTopic);

    expect(consumedMessages).toEqual([
      {
        headers: { traceId: '2' },
        key: { businessUnit: expectedBusinessUnit },
        value: { contextCode: '43' },
      },
    ]);
  });
});
