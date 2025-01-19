import { type INestApplication } from '@nestjs/common';
import { type CustomTransportStrategy, type MicroserviceOptions } from '@nestjs/microservices';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { KafkaTestHelperWithStrategies } from '@libs/testing';
import { KAFKA_SERVER, KafkaModule } from '../../src';
import { DecodeFunction, SerializedHeader } from '../../src/kafka-header-filter.interface';
import { DeserializerEnum, SerializerEnum, TopicType } from '../../src';
import { HeaderFilterController } from './header-filter.controller';
import { fixtures, inputTopic, MessageHeader, outputTopic } from './header-filter.fixture';

describe('Header filter controller integration2', () => {
  let app: INestApplication;
  let kafkaHelper: KafkaTestHelperWithStrategies;
  let noHeaderError: Error;
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
                headerFilter: (header: SerializedHeader<MessageHeader>, decode: DecodeFunction): boolean => {
                  return decode(header.businessUnit) === 'LMFR';
                },
              },
              errorHandler: async (thrownError: Error): Promise<void> => {
                noHeaderError = thrownError;
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
      controllers: [HeaderFilterController],
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

  it('should throw an error when a message without a header is sent and header filter is provided', async () => {
    await kafkaHelper.produce(inputTopic, [
      {
        message: {
          headers: undefined,
          key: { itemId: '1' },
          value: { contextCode: '99' },
        },
      },
    ]);

    // wait for message to be processed
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(noHeaderError.message).toBe('Header filter provided but no header (or empty header)');
  });

  it('should filter out batch messages using the value filter', async () => {
    await kafkaHelper.produce(inputTopic, [
      {
        message: {
          headers: { businessUnit: 'LMIT' },
          key: { itemId: '1' },
          value: { contextCode: '99' },
        },
      },
      {
        message: {
          headers: { businessUnit: expectedBusinessUnit },
          key: { itemId: '2' },
          value: { contextCode: '43' },
        },
      },
      {
        message: {
          headers: { businessUnit: 'LMES' },
          key: { itemId: '3' },
          value: { contextCode: '21' },
        },
      },
    ]);

    // wait for message to be processed
    await new Promise(resolve => setTimeout(resolve, 50));

    const consumedMessages = await kafkaHelper.consumeMessages(outputTopic);

    expect(consumedMessages).toEqual([
      {
        headers: { businessUnit: expectedBusinessUnit },
        key: { itemId: '2' },
        value: { contextCode: '43' },
      },
    ]);
  });
});
