import playwright from 'eslint-plugin-playwright';
import baseConfig from '../../eslint.config.mjs';

export default [
  { ignores: ['out-tsc/**', 'test-output/**'] },
  playwright.configs['flat/recommended'],
  ...baseConfig,
  {
    files: ['**/*.ts'],
    rules: {
      // 被测对象是模拟器逻辑层，经 CDP 求值读报告，没有 `page` fixture；报告在 beforeAll 里取一次，各用例只做断言。
      'playwright/no-standalone-expect': 'off'
    }
  }
];
