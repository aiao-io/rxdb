import { expect, test } from '@playwright/test';

import { addRootFolder, openPage, readCount } from './e2e-utils.js';

test.describe('File Manager Virtual Page', () => {
  test.beforeEach(async ({ page }) => {
    await openPage(page, '/file-manager-virtual', 'File Manager - Virtual');
  });

  test('should display page title and controls', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1, name: 'File Manager - Virtual' })).toBeVisible();
    await expect(page.getByTestId('file-name-input')).toBeVisible();
    await expect(page.getByTestId('file-search-input')).toBeVisible();
    await expect(page.getByTestId('file-batch-add')).toBeVisible();
  });

  test('should display count badge', async ({ page }) => {
    await expect(page.getByTestId('file-count')).toContainText(/\d+ 项/u);
  });

  test('should support batch add 100 items', async ({ page }) => {
    const count = page.getByTestId('file-count');
    const before = readCount(await count.textContent(), 'file-count');
    await page.getByTestId('file-batch-add').click();
    const option = page.getByTestId('file-batch-option-100');
    await expect(option).toBeVisible();
    await option.click();
    await expect(option).toBeEnabled({ timeout: 30000 });
    await expect
      .poll(async () => readCount(await count.textContent(), 'file-count'), { timeout: 30000 })
      .toBe(before + 100);
  });

  test('should handle file extensions correctly', async ({ page }) => {
    await page.getByTestId('file-mode-toggle').click();
    const input = page.getByTestId('file-name-input');
    await page.getByTestId('file-extension-select').selectOption('.txt');
    await input.fill('test-extension');
    await page.getByTestId('file-submit').click();

    await expect(page.getByTestId('file-row').filter({ hasText: 'test-extension.txt' })).toBeVisible({
      timeout: 15000
    });
    await expect(page.getByText('test-extension.txt.txt', { exact: true })).toHaveCount(0);
  });

  test('should expose semantic selection state', async ({ page }) => {
    const folder = await addRootFolder(page, 'E2E 虚拟选中文件夹');
    await folder.getByText('E2E 虚拟选中文件夹', { exact: true }).click();
    await expect(folder).toHaveAttribute('aria-selected', 'true');
  });
});
