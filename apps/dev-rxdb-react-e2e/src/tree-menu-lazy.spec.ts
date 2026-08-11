import { expect, test } from '@playwright/test';

import { addRootMenu, expectMenuParent, getMenuRow, openPage, readCount } from './e2e-utils.js';

test.describe('Lazy Loading Tree Menu', () => {
  test.beforeEach(async ({ page }) => {
    await openPage(page, '/menu-lazy', 'Tree Menu - Lazy Load');
  });

  test('should display lazy loading menu page', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1, name: 'Tree Menu - Lazy Load' })).toBeVisible();
  });

  test('should have add menu input', async ({ page }) => {
    await expect(page.getByTestId('menu-title-input')).toBeVisible();
  });

  test('should add root menu', async ({ page }) => {
    const menu = await addRootMenu(page, 'E2E 根菜单');
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

  test('should show edit and delete actions on hover', async ({ page }) => {
    const editable = await addRootMenu(page, 'E2E 可编辑菜单');
    await editable.hover();
    await editable.getByTestId('menu-edit').click();
    await expect(editable.getByTestId('menu-edit-input')).toHaveValue('E2E 可编辑菜单');

    const deletable = await addRootMenu(page, 'E2E 可删除菜单');
    await deletable.hover();
    await expect(deletable.getByTestId('menu-delete')).toBeVisible();
  });

  test('should have search and toolbar controls', async ({ page }) => {
    await expect(page.getByTestId('menu-search-input')).toBeVisible();
    await expect(page.getByTestId('menu-batch-add')).toBeVisible();
    await expect(page.getByTestId('menu-undo')).toBeVisible();
    await expect(page.getByTestId('menu-redo')).toBeVisible();
    await expect(page.getByTestId('menu-history')).toBeVisible();
  });

  test('should support history undo', async ({ page }) => {
    await addRootMenu(page, '历史测试菜单');
    const undoButton = page.getByTestId('menu-undo');
    await expect(undoButton).toBeEnabled({ timeout: 15000 });
    await undoButton.click();
    await expect(page.getByText('历史测试菜单', { exact: true })).toHaveCount(0);
  });

  test('should expand all items after adding two batches', async ({ page }) => {
    const badge = page.getByTestId('menu-count');
    const initialCount = readCount(await badge.textContent(), 'menu-count');
    const batch = page.getByTestId('menu-batch-add');
    const option = page.getByTestId('menu-batch-option-100');

    await batch.click();
    await option.click();
    await expect(option).toBeEnabled({ timeout: 60000 });
    await expect
      .poll(async () => readCount(await badge.textContent(), 'menu-count'), { timeout: 30000 })
      .toBeGreaterThan(initialCount);
    const firstCount = readCount(await badge.textContent(), 'menu-count');

    await batch.click();
    await option.click();
    await expect(option).toBeEnabled({ timeout: 60000 });
    await expect
      .poll(async () => readCount(await badge.textContent(), 'menu-count'), { timeout: 30000 })
      .toBeGreaterThan(firstCount);

    await page.getByTestId('menu-toggle-all').click();
    await expect(page.getByTestId('menu-toggle-all')).toHaveAttribute('title', '折叠全部');
  });
});
