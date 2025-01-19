import { type INestApplication } from '@nestjs/common';
import { type CustomTransportStrategy, type MicroserviceOptions } from '@nestjs/microservices';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { KafkaTestHelperWithStrategies } from '@libs/testing';
import { KAFKA_SERVER, KafkaModule, TopicType } from '../../src';
import { type Codec } from '../../src/codecs/codec.interface';
import { LZ4_CODEC_PROVIDER, ZSTD_CODEC_PROVIDER } from '../../src/kafka.constants';

describe('Codecs integration', () => {
  let app: INestApplication;
  let kafkaHelper: KafkaTestHelperWithStrategies;
  let zstdCodecProvider: Codec;
  let lz4Provider: Codec;

  beforeEach(async () => {
    kafkaHelper = KafkaTestHelperWithStrategies.createKafkaTestHelper();

    await kafkaHelper.setupEnvironment({ topics: [], schemas: [] });

    const module = await Test.createTestingModule({
      imports: [KafkaModule.forRoot(), KafkaModule.forFeature([{ name: 'test', type: TopicType.INPUT, topic: {} }])],
      controllers: [],
    }).compile();

    app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());

    const strategy = app.get<CustomTransportStrategy>(KAFKA_SERVER);

    zstdCodecProvider = app.get(ZSTD_CODEC_PROVIDER);
    lz4Provider = app.get(LZ4_CODEC_PROVIDER);

    app.connectMicroservice<MicroserviceOptions>({ strategy });
    app.enableShutdownHooks();

    await app.startAllMicroservices();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    await kafkaHelper.cleanUp();
  });

  describe('ZSTD codec', () => {
    it('should correctly compress and decompress data using the actual ZSTD library', async () => {
      const originalObject = { message: 'Hello, world!' };
      const originalData = Buffer.from(JSON.stringify(originalObject)); // simulate non-avro serializing

      const compressed = await zstdCodecProvider.compress({
        buffer: originalData,
      });
      const decompressed = await zstdCodecProvider.decompress(compressed);

      expect(JSON.parse(decompressed.toString())).toEqual(originalObject);
    });
  });

  describe('LZ4 codec', () => {
    it('should correctly compress and decompress data using the actual LZ4 library', async () => {
      const originalObject = {
        message: 'Sierra Golf Alfa Mike India Delta Bravo',
      };
      const originalData = Buffer.from(JSON.stringify(originalObject)); // simulate non-avro serializing

      const compressed = await lz4Provider.compress({
        buffer: originalData,
      });
      const decompressed = await lz4Provider.decompress(compressed);

      expect(JSON.parse(decompressed.toString())).toEqual(originalObject);
    });
  });
});
