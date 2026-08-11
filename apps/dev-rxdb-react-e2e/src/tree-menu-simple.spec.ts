import { expect, test } from '@playwright/test';

import { addRootMenu, expectMenuParent, getMenuRow, openPage } from './e2e-utils.js';

test.describe('Tree Menu Simple Page', () => {
  test.beforeEach(async ({ page }) => {
    await openPage(page, '/menu-simple', 'Tree Menu - Simple');
  });

  test('should display tree menu simple page', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1, name: 'Tree Menu - Simple' })).toBeVisible();
  });

  test('should have add root menu input', async ({ page }) => {
    await expect(page.getByTestId('menu-title-input')).toBeVisible();
  });

  test('should have batch add dropdown', async ({ page }) => {
    await expect(page.getByTestId('menu-batch-add')).toBeVisible();
  });

  test('should add a new root menu', async ({ page }) => {
    const menu = await addRootMenu(page, 'E2E 测试菜单');
    await expect(menu).toBeVisible();
  });

  test('should add child menu', async ({ page }) => {
    const parent = await addRootMenu(page, 'E2E 父菜单');

    await parent.hover();
    await parent.getByTestId('menu-add-child').click();
    await expect(page.getByTestId('menu-submit-child')).toBeVisible();

    await page.getByTestId('menu-title-input').fill('E2E 子菜单');
    await page.getByTestId('menu-submit-child').click();

    const child = await getMenuRow(page, 'E2E 子菜单');
    await expectMenuParent(child, parent);
  });

  test('should show edit button on hover', async ({ page }) => {
    const menu = await addRootMenu(page, 'E2E 可编辑菜单');
    await menu.hover();
    await menu.getByTestId('menu-edit').click();
    await expect(menu.getByTestId('menu-edit-input')).toHaveValue('E2E 可编辑菜单');
  });

  test('should show delete button on hover', async ({ page }) => {
    const menu = await addRootMenu(page, 'E2E 可删除菜单');
    await menu.hover();
    await expect(menu.getByTestId('menu-delete')).toBeVisible();
  });

  test('should have search input and clear action', async ({ page }) => {
    const searchInput = page.getByTestId('menu-search-input');
    await expect(searchInput).toBeVisible();
    await searchInput.fill('测试');
    await page.getByTestId('menu-clear-search').click();
    await expect(searchInput).toHaveValue('');
  });

  test('should have expand/collapse all button', async ({ page }) => {
    const toggleAll = page.getByTestId('menu-toggle-all');
    await expect(toggleAll).toBeVisible();
    await expect(toggleAll).toHaveAttribute('title', /展开全部|折叠全部/);
  });

  test('should have history, undo and redo controls', async ({ page }) => {
    await expect(page.getByTestId('menu-history')).toBeVisible();
    await expect(page.getByTestId('menu-undo')).toBeVisible();
    await expect(page.getByTestId('menu-redo')).toBeVisible();
  });

  test('should show menu count badge', async ({ page }) => {
    await expect(page.getByTestId('menu-count')).toContainText(/\d+ 项/u);
  });

  test('should display empty state when no menus', async ({ page }) => {
    await addRootMenu(page, '待删除的菜单');
    await page.getByTestId('menu-delete-all').click();
    await expect(page.getByRole('heading', { name: '暂无菜单数据' })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('待删除的菜单', { exact: true })).toHaveCount(0);
  });
});
