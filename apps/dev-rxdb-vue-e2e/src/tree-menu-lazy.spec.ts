import { expect, test } from '@playwright/test';
import { addChildMenu, addRootMenu, openPage } from './e2e-utils.js';
import { registerTreeMenuTests } from './shared-page-tests.js';

test.describe('Lazy Loading Tree Menu', () => {
  test.beforeEach(async ({ page }) => {
    await openPage(page, '/menu-lazy', 'Tree Menu - Lazy Load');
  });

  registerTreeMenuTests({ title: 'Tree Menu - Lazy Load', entityName: 'E2E 懒加载' });

  test('should add child menu', async ({ page }) => {
    const parent = await addRootMenu(page, 'E2E 懒加载父菜单');
    const child = await addChildMenu(page, parent, 'E2E 懒加载子菜单');
    await expect(child).toBeVisible();
  });
});
