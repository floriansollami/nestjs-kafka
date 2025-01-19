import { type INestApplication } from '@nestjs/common';
import { type CustomTransportStrategy, type MicroserviceOptions } from '@nestjs/microservices';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { KafkaTestHelperWithStrategies } from '@libs/testing';
import { DeserializerEnum, KAFKA_SERVER, KafkaModule, SerializerEnum, TopicType } from '../../../../src';
import { CustomFunctionErrorHandlerController } from './custom-function-error-handler.controller';
import { fixtures, inputTopic, outputTopic } from './custom-function-error-handler.fixtures';

describe('Custom function error handler integration', () => {
  let app: INestApplication;
  let kafkaHelper: KafkaTestHelperWithStrategies;

  beforeEach(async () => {
    kafkaHelper = KafkaTestHelperWithStrategies.createKafkaTestHelper();

    await kafkaHelper.setupEnvironment(fixtures);

    const module = await Test.createTestingModule({
      imports: [
        KafkaModule.forRoot({
          config: { retry: { retries: 1 } },
        }),
        KafkaModule.forFeature([
          {
            name: inputTopic,
            type: TopicType.INPUT,
            topic: {
              deserializers: {
                keyDeserializer: DeserializerEnum.AVRO,
                valueDeserializer: DeserializerEnum.AVRO,
              },
              errorHandler: async (): Promise<void> => {
                // swallow the error
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
      controllers: [CustomFunctionErrorHandlerController],
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

  it('should swallow the error by appliying the custom error handler function and continue the batch processing', async () => {
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
          key: { businessUnit: 'LMFR' },
          value: { contextCode: '87' },
        },
      },
    ]);

    // wait for message to be processed
    await new Promise(resolve => setTimeout(resolve, 200));

    const consumedMessages = await kafkaHelper.consumeMessages(outputTopic);

    expect(consumedMessages).toEqual([
      {
        headers: { traceId: '2' },
        key: { businessUnit: 'LMFR' },
        value: { contextCode: '87' },
      },
    ]);
  });
});
