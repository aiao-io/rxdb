import baseConfig from '../../eslint.config.mjs';
import { reactFlatConfig } from '../../tools/eslint/react-flat-config.mjs';

export default [
  ...baseConfig,
  ...reactFlatConfig,
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      'react-hooks/exhaustive-deps': 'error',
      'react-hooks/incompatible-library': 'error',
      'react-hooks/unsupported-syntax': 'error'
    }
  }
];
