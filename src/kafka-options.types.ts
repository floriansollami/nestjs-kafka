import { type SchemaRegistryAPIClientArgs } from '@kafkajs/confluent-schema-registry/dist/api';
import type { ModuleMetadata } from '@nestjs/common';
import { type KafkaConfig } from 'kafkajs';

export type KafkaModuleOptions = {
  config?: Partial<KafkaConfig>;
  postfixId?: string;
  schemaRegistry?: {
    config?: Partial<SchemaRegistryAPIClientArgs>;
  };
};

export interface KafkaModuleAsyncOptions extends Pick<ModuleMetadata, 'imports'> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  useFactory: (...args: any[]) => Promise<KafkaModuleOptions> | KafkaModuleOptions;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  inject?: any[];
}
