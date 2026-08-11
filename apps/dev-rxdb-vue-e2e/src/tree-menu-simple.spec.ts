import { expect, test } from '@playwright/test';
import { addChildMenu, addRootMenu, openPage } from './e2e-utils.js';
import { registerTreeMenuTests } from './shared-page-tests.js';

test.describe('Tree Menu Simple Page', () => {
  test.beforeEach(async ({ page }) => {
    await openPage(page, '/menu-simple', 'Tree Menu - Simple');
  });

  registerTreeMenuTests({ title: 'Tree Menu - Simple', entityName: 'E2E 测试' });

  test('should have batch add control', async ({ page }) => {
    await expect(page.getByTestId('menu-batch-add')).toBeVisible();
  });

  test('should add child menu', async ({ page }) => {
    const parent = await addRootMenu(page, 'E2E 父菜单');
    const child = await addChildMenu(page, parent, 'E2E 子菜单');
    await expect(child).toBeVisible();
  });
});
