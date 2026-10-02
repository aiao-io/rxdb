import playwright from 'eslint-plugin-playwright';
import baseConfig from '../../eslint.config.mjs';

export default [
  { ignores: ['out-tsc/**', 'playwright-report/**', 'test-output/**'] },
  playwright.configs['flat/recommended'],
  ...baseConfig,
  {
    files: ['**/*.ts', '**/*.js'],
    // Override or add rules here
    rules: {}
  },
  {
    // US-909：失败现场归档挂在 ./fixtures 的 auto fixture 上，直接用 `@playwright/test` 的 `test` 就绕开了它。
    // 只禁 `test`；`expect` 与类型照常从 `@playwright/test` 取。
    files: ['src/**/*.ts'],
    ignores: ['src/fixtures.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@playwright/test',
              importNames: ['test'],
              message: '从 ./fixtures.js 取 test（US-909 失败现场归档）'
            }
          ]
        }
      ]
    }
  }
];
