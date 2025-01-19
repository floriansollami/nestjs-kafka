import { type INestApplication } from '@nestjs/common';
import { type CustomTransportStrategy, type MicroserviceOptions } from '@nestjs/microservices';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { KafkaTestHelperWithStrategies } from '@libs/testing';
import { KAFKA_SERVER, KafkaJSAvroSchema, KafkaModule } from '../../src';
import { DeserializerEnum, SerializerEnum, TopicType } from '../../src';
import { ValueFilterController } from './value-filter.controller';
import { fixtures, inputTopic, inputTopicLightSchema, MessageValue, outputTopic } from './value-filter.fixtures';

let app: INestApplication;
let kafkaHelper: KafkaTestHelperWithStrategies;
const expectedBusinessUnit = 'LMFR';

describe('Value filter controller integration', () => {
  beforeEach(async () => {
    kafkaHelper = KafkaTestHelperWithStrategies.createKafkaTestHelper();
    await kafkaHelper.setupEnvironment(fixtures);
  });

  afterEach(async () => {
    await app.close();
    await kafkaHelper.cleanUp();
  });

  it('should keep the tombstone message without applying the value filter', async () => {
    await startAnApplicationWithoutLightSchema();

    await kafkaHelper.produce(inputTopic, [
      {
        useKeySchema: true,
        useValueSchema: false,
        message: {
          headers: { traceId: '1' },
          key: { contextCode: '99' },
          value: null, // same behavior with undefined
        },
      },
    ]);

    // wait for message to be processed
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(ValueFilterController.tombstoneMessage).toMatchObject({
      headers: { traceId: '1' },
      key: { contextCode: '99' },
      value: null,
    });
  });

  it('should partially deserialize the message using the light schema when applying the value filter', async () => {
    await startAnApplicationWithLightSchema();

    await kafkaHelper.produce(inputTopic, [
      {
        message: {
          headers: { traceId: '2' },
          key: { contextCode: '22' },
          value: {
            itemId: '1234',
            businessUnit: 'LMIT',
          },
        },
      },
    ]);

    // wait for message to be processed
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(ValueFilterController.isValueFullyDeserialized).toEqual(false);
  });

  it('should filter out batch messages using the value filter', async () => {
    await startAnApplicationWithoutLightSchema();

    await kafkaHelper.produce(inputTopic, [
      {
        message: {
          headers: { traceId: '3' },
          key: { contextCode: '45' },
          value: {
            itemId: '1234',
            businessUnit: 'LMIT',
          },
        },
      },
      {
        message: {
          headers: { traceId: '4' },
          key: { contextCode: '76' },
          value: {
            itemId: '5678',
            businessUnit: expectedBusinessUnit,
          },
        },
      },
      {
        message: {
          headers: { traceId: '5' },
          key: { contextCode: '53' },
          value: {
            itemId: '9101',
            businessUnit: 'LMES',
          },
        },
      },
    ]);

    // wait for message to be processed
    await new Promise(resolve => setTimeout(resolve, 50));

    const consumedMessages = await kafkaHelper.consumeMessages(outputTopic);

    expect(consumedMessages).toHaveLength(1);
    expect(consumedMessages).toEqual([
      {
        headers: { traceId: '4' },
        key: { contextCode: '76' },
        value: {
          itemId: '5678',
          businessUnit: expectedBusinessUnit,
        },
      },
    ]);
  });
});

async function startAnApplicationWithoutLightSchema(): Promise<void> {
  return initTestingModule();
}

async function startAnApplicationWithLightSchema(): Promise<void> {
  return initTestingModule(inputTopicLightSchema);
}

async function initTestingModule(lightSchema?: KafkaJSAvroSchema): Promise<void> {
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
              valueFilter: {
                lightSchema: lightSchema,
                filter: (value: MessageValue): boolean => {
                  return value.businessUnit === 'LMFR';
                },
              },
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
    controllers: [ValueFilterController],
    providers: [],
  }).compile();

  app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());

  const strategy = app.get<CustomTransportStrategy>(KAFKA_SERVER);

  app.connectMicroservice<MicroserviceOptions>({ strategy });
  app.enableShutdownHooks();

  await app.startAllMicroservices();
  await app.init();
}
