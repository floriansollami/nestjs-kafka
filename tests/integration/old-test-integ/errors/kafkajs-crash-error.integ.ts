import { type INestApplication } from '@nestjs/common';
import { type CustomTransportStrategy, type MicroserviceOptions } from '@nestjs/microservices';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { KafkaTestHelperWithStrategies } from '@libs/testing';
import { KAFKA_SERVER, KafkaModule } from '../../src';
import { DeserializerEnum, TopicType } from '../../src';
import { KafkaJsCrashErrorController } from './kafkajs-crash-error.controller';
import { fixtures, inputTopic } from './kafkajs-crash-error.fixtures';

describe('Kafkajs crash error integration', () => {
  let app: INestApplication;
  let kafkaHelper: KafkaTestHelperWithStrategies;
  let processKillSpy: jest.SpyInstance;

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
            },
          },
        ]),
      ],
      controllers: [KafkaJsCrashErrorController],
    }).compile();

    app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());

    const strategy = app.get<CustomTransportStrategy>(KAFKA_SERVER);

    app.connectMicroservice<MicroserviceOptions>({ strategy });
    app.enableShutdownHooks(); // to enable onApplicationShutdown

    await app.startAllMicroservices();
    await app.init();

    processKillSpy = jest.spyOn(process, 'kill').mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      (pid: number, signal?: string | number | undefined) => {
        process.emit('SIGTERM'); // still sending the event to simulate the SIGTERM
        return true;
      },
    );
  });

  afterEach(async () => {
    // NOT CLOSING THE APP because each test closes it
    jest.clearAllMocks();
    await kafkaHelper.cleanUp();
  });

  describe('kafkajs non-retriable error', () => {
    it('should rethrow the error and shutdown the app gracefully', async () => {
      await kafkaHelper.produce(inputTopic, [
        {
          message: {
            headers: { traceId: '1' },
            key: { businessUnit: 'LMIT' },
            value: { contextCode: '22' },
          },
        },
      ]);

      // wait for message to be processed
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(processKillSpy).toHaveBeenCalledWith(process.pid, 'SIGTERM');
    });
  });

  describe('kafkajs retriable error', () => {
    it('should rethrow the error and shutdown the app gracefully', async () => {
      await kafkaHelper.produce(inputTopic, [
        {
          message: {
            headers: { traceId: '2' },
            key: { businessUnit: 'LMIT' },
            value: { contextCode: '33' },
          },
        },
      ]);

      // wait for message to be processed
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(processKillSpy).toHaveBeenCalledWith(process.pid, 'SIGTERM');
    });
  });
});
