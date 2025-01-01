import {
  Module,
  type DynamicModule,
  type OnApplicationShutdown,
} from '@nestjs/common';
import type { KafkaModuleAsyncOptions } from './kafka-options.types.js';

// @Global()
@Module({})
export class KafkaCoreModule implements OnApplicationShutdown {
  constructor() {}

  static forRootAsync(options: KafkaModuleAsyncOptions): DynamicModule {
    return {
      module: KafkaCoreModule,
      imports: options.imports,
      providers: [],
      exports: [],
    };
  }

  async onApplicationShutdown(): Promise<void> {}
}
