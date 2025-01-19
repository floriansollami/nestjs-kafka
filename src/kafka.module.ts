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

  static forFeature(topicDefinitions: TopicDefinition[] = []): DynamicModule {
    const factories: AsyncTopicFactory[] = topicDefinitions.map(definition => ({
      name: definition.name,
      type: definition.type,
      imports: [],
      useFactory: async (): Promise<TopicDefinition['topic']> => definition.topic,
      inject: [],
    }));

    return this.forFeatureAsync(factories);
  }

  static forFeatureAsync(factories: AsyncTopicFactory[] = []): DynamicModule {
    const providers = createKafkaAsyncProviders(factories);
    const imports = factories.map(factory => factory.imports ?? []);
    const uniqImports = new Set(flatten(imports));

    return {
      module: KafkaModule,
      imports: [...uniqImports],
      providers,
      exports: [],
    };
  }
}
