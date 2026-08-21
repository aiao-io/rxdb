import playwright from 'eslint-plugin-playwright';
import baseConfig from '../../eslint.config.mjs';

export default [
  { ignores: ['out-tsc/**', 'playwright-report/**', 'test-output/**'] },
  playwright.configs['flat/recommended'],
  ...baseConfig,
  {
    files: ['**/*.ts', '**/*.js'],
    rules: {
      // 规则要拦的是「悄悄停掉一条用例」的裸 `test.skip()`。带条件的那种是运行期逃生口，
      // 性质完全不同：`electron-smoke.spec.ts` 用它在显式要求显示窗口时让开「窗口必须隐藏」那条断言。
      // `allowConditional` 只放行条件形式，裸 `test.skip()` 照样报。
      'playwright/no-skipped-test': ['warn', { allowConditional: true }]
    }
  }
];
