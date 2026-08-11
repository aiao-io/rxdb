import { expect, test } from '@playwright/test';
import { openPage } from './e2e-utils.js';
import { registerTreeMenuTests } from './shared-page-tests.js';

test.describe('Virtual Tree Menu', () => {
  test.beforeEach(async ({ page }) => {
    await openPage(page, '/menu-virtual', 'Tree Menu - Virtual');
  });

  registerTreeMenuTests({ title: 'Tree Menu - Virtual', entityName: 'E2E 虚拟' });

  test('should have batch add control', async ({ page }) => {
    await expect(page.getByTestId('menu-batch-add')).toBeVisible();
  });

  test('should have undo and redo controls', async ({ page }) => {
    await expect(page.getByRole('button', { name: '撤销' })).toBeVisible();
    await expect(page.getByRole('button', { name: '重做' })).toBeVisible();
  });

  test('should have history toggle button', async ({ page }) => {
    await expect(page.getByRole('button', { name: '历史记录' })).toBeVisible();
  });
});
