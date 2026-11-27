import { test } from '@playwright/test';
import { openPage } from './e2e-utils.js';
import { registerFileManagerTests } from './shared-page-tests.js';

test.describe('File Manager Simple Page', () => {
  test.beforeEach(async ({ page }) => {
    await openPage(page, '/file-manager-simple', '文件管理器 - 简单模式');
  });

  registerFileManagerTests({ title: '文件管理器 - 简单模式', entityName: 'E2E 简单' });
});
