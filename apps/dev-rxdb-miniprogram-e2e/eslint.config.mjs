import playwright from 'eslint-plugin-playwright';
import baseConfig from '../../eslint.config.mjs';

export default [
  { ignores: ['out-tsc/**', 'test-output/**'] },
  playwright.configs['flat/recommended'],
  ...baseConfig,
  {
    files: ['**/*.ts'],
    rules: {
      // 被测对象是小程序逻辑层，不是浏览器页面；这两条规则的前提（`page` fixture / DOM 定位器）都不成立。
      'playwright/no-standalone-expect': 'off',
      'playwright/no-conditional-in-test': 'off',
      // `$` / `$$` 在这里是 miniprogram-automator 的 Page API，不是 Playwright 的 ElementHandle。
      // automator 没有 locator 那套惰性求值的等价物，规则想引导去的写法根本不存在。
      'playwright/no-element-handle': 'off'
    }
  }
];
