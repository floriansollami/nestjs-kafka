import { Global, Module, type DynamicModule } from '@nestjs/common';
import { KafkaCoreModule } from './kafka-core.module.js';
import type { KafkaModuleAsyncOptions, KafkaModuleOptions } from './kafka-options.types.js';

@Global()
@Module({})
export class KafkaModule {
  static forRoot(config: KafkaModuleOptions = {}): DynamicModule {
    return this.forRootAsync({
      useFactory: () => config,
      inject: [],
    });
  }

  static forRootAsync(options: KafkaModuleAsyncOptions): DynamicModule {
    return {
      module: KafkaModule,
      imports: [KafkaCoreModule.forRootAsync(options)],
    };
  }
}
