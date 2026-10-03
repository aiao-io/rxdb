import playwright from 'eslint-plugin-playwright';
import baseConfig from '../../eslint.config.mjs';

export default [
  { ignores: ['out-tsc/**', 'playwright-report/**', 'test-output/**'] },
  playwright.configs['flat/recommended'],
  ...baseConfig,
  {
    files: ['**/*.ts', '**/*.js'],
    rules: {
      // 断言辅助函数内部含 expect，让规则把对它们的调用也算作断言
      'playwright/expect-expect': ['warn', { assertFunctionNames: ['expectOrder'] }]
    }
  }
];
