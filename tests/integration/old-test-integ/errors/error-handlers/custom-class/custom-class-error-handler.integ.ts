import { Module, type INestApplication } from '@nestjs/common';
import { type CustomTransportStrategy, type MicroserviceOptions } from '@nestjs/microservices';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { KafkaTestHelperWithStrategies } from '@libs/testing';
import {
  DeserializerEnum,
  ErrorHandler,
  InputTopic,
  KAFKA_SERVER,
  KafkaModule,
  OutputTopic,
  SerializerEnum,
  TopicType,
} from '../../../../src';
import { CustomClassErrorHandlerController } from './custom-class-error-handler.controller';
import { fixtures, inputTopic, outputTopic } from './custom-class-error-handler.fixtures';

class CustomErrorHandler implements ErrorHandler {
  async handle(): Promise<void> {
    // swallow the error
  }
}

@Module({
  providers: [CustomErrorHandler],
  exports: [CustomErrorHandler],
})
class TestModule {}

describe('Custom class error handler integration', () => {
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
        KafkaModule.forFeatureAsync([
          {
            name: inputTopic,
            type: TopicType.INPUT,
            imports: [TestModule],
            useFactory: (errorHandler: ErrorHandler): InputTopic => ({
              deserializers: {
                keyDeserializer: DeserializerEnum.AVRO,
                valueDeserializer: DeserializerEnum.AVRO,
              },
              errorHandler,
            }),
            inject: [CustomErrorHandler],
          },
          {
            name: outputTopic,
            type: TopicType.OUTPUT,
            useFactory: (): OutputTopic => ({
              producer: {
                allowAutoTopicCreation: false,
              },
              serializers: {
                keySerializer: SerializerEnum.AVRO,
                valueSerializer: SerializerEnum.AVRO,
              },
            }),
          },
        ]),
      ],
      controllers: [CustomClassErrorHandlerController],
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

  it('should swallow the error by appliying the custom error handler class and continue the batch processing', async () => {
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
