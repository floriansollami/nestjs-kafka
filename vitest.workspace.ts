import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  {
    extends: './vitest.config.ts',
    test: {
      name: 'unit',
      include: ['tests/unit/**/*.unit.spec.ts'],
      typecheck: {
        tsconfig: './tsconfig.unit.json',
      },
      poolOptions: {
        threads: {
          singleThread: false,
        },
      },
    },
  },
  {
    extends: './vitest.config.ts',
    test: {
      name: 'integration',
      include: ['tests/integration/**/*.integration.spec.ts'],
      typecheck: {
        tsconfig: './tsconfig.integration.json',
      },
      poolOptions: {
        threads: {
          singleThread: true,
        },
      },
    },
  },
]);
