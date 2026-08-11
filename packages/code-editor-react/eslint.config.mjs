import baseConfig from '../../eslint.config.mjs';
import { reactFlatConfig } from '../../tools/eslint/react-flat-config.mjs';

export default [
  ...baseConfig,
  ...reactFlatConfig,
  {
    settings: {
      react: {
        version: '19.2'
      }
    }
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    rules: {}
  },
  {
    ignores: ['**/out-tsc']
  }
];
