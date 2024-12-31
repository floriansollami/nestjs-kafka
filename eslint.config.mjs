// @ts-check

import eslint from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/*',
      '**/src/__generated__/*',
      '**/jest.*.js',
      'commitlint.config.js',
    ],
  },
  eslint.configs.recommended,
  tseslint.configs.recommended,
  eslintConfigPrettier,
  {
    files: ['**/*.ts'],
    rules: {
      '@typescript-eslint/explicit-function-return-type': 'error',
      '@typescript-eslint/member-ordering': ['error'],
      '@typescript-eslint/no-non-null-assertion': ['error'],
    },
  },
);
