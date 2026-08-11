import { expect, test } from '@playwright/test';

import { addRootFolder, getFileRow, openPage, readCount, requireAttribute } from './e2e-utils.js';

test.describe('File Manager Lazy Loading Page', () => {
  test.beforeEach(async ({ page }) => {
    await openPage(page, '/file-manager-lazy', 'File Manager - Lazy Load');
  });

  test('should display page title', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1, name: 'File Manager - Lazy Load' })).toBeVisible();
  });

  test('should have file controls', async ({ page }) => {
    await expect(page.getByTestId('file-name-input')).toBeVisible();
    await expect(page.getByTestId('file-search-input')).toBeVisible();
    await expect(page.getByTestId('file-sort-select')).toBeVisible();
    await expect(page.getByTestId('file-mode-toggle')).toBeVisible();
    await expect(page.getByTestId('file-history')).toBeVisible();
    await expect(page.getByTestId('file-batch-add')).toBeVisible();
  });

  test('should add root folder', async ({ page }) => {
    const folder = await addRootFolder(page, 'E2E 懒加载文件夹');
    await expect(folder).toBeVisible();
  });

  test('should keep the file row stable while editing', async ({ page }) => {
    const folder = await addRootFolder(page, 'E2E 懒加载可编辑文件夹');
    await folder.hover();
    await folder.getByTestId('file-edit').click();
    await expect(folder.getByTestId('file-edit-input')).toHaveValue('E2E 懒加载可编辑文件夹');
  });

  test('should support batch add and update the count', async ({ page }) => {
    const count = page.getByTestId('file-count');
    const before = readCount(await count.textContent(), 'file-count');
    await page.getByTestId('file-batch-add').click();
    const option = page.getByTestId('file-batch-option-100');
    await expect(option).toBeVisible();
    await option.click();
    await expect(option).toBeEnabled({ timeout: 30000 });
    await expect
      .poll(async () => readCount(await count.textContent(), 'file-count'), { timeout: 30000 })
      .toBeGreaterThan(before);
  });

  test('should use semantic selection state', async ({ page }) => {
    const folder = await addRootFolder(page, 'E2E 懒加载选中文件夹');
    await folder.getByText('E2E 懒加载选中文件夹', { exact: true }).click();
    await expect(folder).toHaveAttribute('aria-selected', 'true');
  });

  test('should expose file row identity and level', async ({ page }) => {
    const folder = await addRootFolder(page, 'E2E 懒加载身份文件夹');
    await expect(folder).toHaveAttribute('data-file-id', /.+/u);
    await expect(folder).toHaveAttribute('data-level', '0');
  });

  test('should locate a row by its stable identity', async ({ page }) => {
    const folder = await addRootFolder(page, 'E2E 懒加载稳定行');
    const row = await getFileRow(page, 'E2E 懒加载稳定行');
    await expect(row).toHaveAttribute('data-file-id', await requireAttribute(folder, 'data-file-id', '文件夹行'));
  });
});
