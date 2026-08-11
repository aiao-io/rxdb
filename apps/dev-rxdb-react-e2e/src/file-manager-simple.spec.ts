import { expect, test } from '@playwright/test';

import { addRootFolder, openPage } from './e2e-utils.js';

test.describe('File Manager Simple Page', () => {
  test.beforeEach(async ({ page }) => {
    await openPage(page, '/file-manager-simple', 'File Manager - Simple');
  });

  test('should display page title', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1, name: 'File Manager - Simple' })).toBeVisible();
  });

  test('should have file controls', async ({ page }) => {
    await expect(page.getByTestId('file-name-input')).toBeVisible();
    await expect(page.getByTestId('file-search-input')).toBeVisible();
    await expect(page.getByTestId('file-mode-toggle')).toBeVisible();
    await expect(page.getByTestId('file-history')).toBeVisible();
  });

  test('should add root folder', async ({ page }) => {
    const folder = await addRootFolder(page, 'E2E 测试文件夹');
    await expect(folder).toBeVisible();
  });
});
