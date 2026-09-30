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
      'react-hooks/unsupported-syntax': 'error',
      // flat/react 里这几条规则与本项目的 React 用法不兼容，禁用
      'react/no-direct-mutation-state': 'off',
      'react/no-typos': 'off',
      'react/require-render-return': 'off',
      'react/jsx-no-useless-fragment': 'off'
    }
  }
];
