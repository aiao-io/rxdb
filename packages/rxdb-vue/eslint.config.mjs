import tsParser from '@typescript-eslint/parser';
import vue from 'eslint-plugin-vue';
import baseConfig from '../../eslint.config.mjs';

export default [
  ...baseConfig,
  ...vue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: {
        parser: tsParser
      }
    }
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx', '**/*.vue'],
    rules: {
      'vue/multi-word-component-names': 'off'
    }
  },
  {
    // 规约针对的是 SFC 组织方式；测试里的宿主组件是一次性夹具，
    // 一个用例一个宿主远比拆成一堆 .vue 文件清楚
    files: ['**/__tests__/**/*.ts', '**/*.spec.ts'],
    rules: {
      'vue/one-component-per-file': 'off'
    }
  }
];
