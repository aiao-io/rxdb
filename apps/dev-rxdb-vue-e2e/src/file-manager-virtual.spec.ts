import { test } from '@playwright/test';
import { openPage } from './e2e-utils.js';
import { registerFileManagerTests } from './shared-page-tests.js';

test.describe('File Manager Virtual Page', () => {
  test.beforeEach(async ({ page }) => {
    await openPage(page, '/file-manager-virtual', '文件管理器 - 虚拟滚动');
  });

  registerFileManagerTests({ title: '文件管理器 - 虚拟滚动', entityName: 'E2E 虚拟' });
});
