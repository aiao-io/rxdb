import { test } from '@playwright/test';
import { openPage } from './e2e-utils.js';
import { registerFileManagerTests } from './shared-page-tests.js';

test.describe('File Manager Virtual Page', () => {
  test.beforeEach(async ({ page }) => {
    await openPage(page, '/file-manager-virtual', 'File Manager - Virtual');
  });

  registerFileManagerTests({ title: 'File Manager - Virtual', entityName: 'E2E 虚拟' });
});
