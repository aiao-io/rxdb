import { test } from '@playwright/test';
import { openPage } from './e2e-utils.js';
import { registerFileManagerTests } from './shared-page-tests.js';

test.describe('File Manager Simple Page', () => {
  test.beforeEach(async ({ page }) => {
    await openPage(page, '/file-manager-simple', 'File Manager - Simple');
  });

  registerFileManagerTests({ title: 'File Manager - Simple', entityName: 'E2E 简单' });
});
