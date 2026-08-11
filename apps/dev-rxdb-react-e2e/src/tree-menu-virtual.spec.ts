import { expect, test } from '@playwright/test';

import { addRootMenu, openPage } from './e2e-utils.js';

test.describe('Virtual Tree Menu', () => {
  test.beforeEach(async ({ page }) => {
    await openPage(page, '/menu-virtual', /Tree Menu - Virtual/u);
  });

  test('should display virtual menu page', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1, name: /Tree Menu - Virtual/u })).toBeVisible();
  });

  test('should have add menu input and toolbar', async ({ page }) => {
    await expect(page.getByTestId('menu-title-input')).toBeVisible();
    await expect(page.getByTestId('menu-batch-add')).toBeVisible();
    await expect(page.getByTestId('menu-undo')).toBeVisible();
    await expect(page.getByTestId('menu-redo')).toBeVisible();
    await expect(page.getByTestId('menu-history')).toBeVisible();
  });

  test('should add root menu', async ({ page }) => {
    const menu = await addRootMenu(page, 'E2E 虚拟根菜单');
    await expect(menu).toBeVisible();
  });

  test('should keep the menu row stable while editing', async ({ page }) => {
    const menu = await addRootMenu(page, 'E2E 虚拟可编辑菜单');
    await menu.hover();
    await menu.getByTestId('menu-edit').click();
    await expect(menu.getByTestId('menu-edit-input')).toHaveValue('E2E 虚拟可编辑菜单');
  });

  test('should show delete button on hover', async ({ page }) => {
    const menu = await addRootMenu(page, 'E2E 虚拟可删除菜单');
    await menu.hover();
    await expect(menu.getByTestId('menu-delete')).toBeVisible();
  });

  test('should have search input and count badge', async ({ page }) => {
    await expect(page.getByTestId('menu-search-input')).toBeVisible();
    await expect(page.getByTestId('menu-count')).toContainText(/\d+ 项/u);
  });

  test('should have expand/collapse all control', async ({ page }) => {
    const toggle = page.getByTestId('menu-toggle-all');
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute('title', /展开全部|折叠全部/);
  });

  test('should expose row identity and level for a new menu', async ({ page }) => {
    const row = await addRootMenu(page, 'E2E 虚拟身份菜单');
    await expect(row).toHaveAttribute('data-menu-id', /.+/u);
    await expect(row).toHaveAttribute('data-level', '0');
  });
});
