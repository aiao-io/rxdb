import { test } from '@playwright/test';
import { openPage } from './e2e-utils.js';
import { registerFileManagerTests } from './shared-page-tests.js';

test.describe('File Manager Lazy Page', () => {
  test.beforeEach(async ({ page }) => {
    await openPage(page, '/file-manager-lazy', 'File Manager - Lazy');
  });

  registerFileManagerTests({ title: 'File Manager - Lazy', entityName: 'E2E 懒加载' });
});
