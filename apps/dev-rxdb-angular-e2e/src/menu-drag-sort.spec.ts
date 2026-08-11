import { expect, test, type Page } from '@playwright/test';
import { readCount, readRequiredAttribute, resetE2eState } from './e2e-utils.js';

/**
 * P2-5：原先声明为 `async` 但函数体里**没有任何 await** —— 它同步返回一个 Locator，
 * `async` 只是把返回值包了一层 Promise，逼得每个调用点都写 `await`，
 * 并让读者误以为这里有真实的异步等待（比如"等徽标出现"）。Locator 本身是惰性的，
 * 不需要 await。
 */
function getVisibleMenuCountBadge(page: Page) {
  return page.getByTestId('menu-count');
}

async function addRootMenu(page: Page, title: string): Promise<void> {
  const input = page.getByTestId('menu-title-input');
  const addButton = page.getByTestId('menu-add-root');
  const menuCountBadge = getVisibleMenuCountBadge(page);
  const menuCountBefore = readCount(await menuCountBadge.textContent(), '菜单计数徽标');

  await input.fill(title);
  await expect(input).toHaveValue(title);
  await input.blur();
  await addButton.click();
  await expect(menuCountBadge).toHaveText(new RegExp(`^${menuCountBefore + 1}\\s*项$`), { timeout: 20_000 });
  await expect(input).toHaveValue('', { timeout: 15_000 });
}

async function findMenuByTitle(page: Page, title: string) {
  const menuItem = page.getByTestId('menu-row').filter({ hasText: title }).first();

  await expect(menuItem).toBeVisible({ timeout: 20_000 });

  return menuItem;
}

test.describe('Menu Page - E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    await resetE2eState(page);
    await page.goto('/menu-simple');
    await page.waitForLoadState('domcontentloaded');
    // 等待页面完全加载
    await expect(page.locator('app-tree-menu-simple-page')).toBeVisible();
    await expect(page.getByTestId('menu-title-input')).toBeVisible({ timeout: 15000 });
  });

  test('should display menu page', async ({ page }) => {
    await expect(page.locator('h1')).toContainText(/Tree Menu - Simple|场景1：基础树形菜单/);
  });

  test('should have add menu input', async ({ page }) => {
    const input = page.getByTestId('menu-title-input');
    await expect(input).toBeVisible();
  });

  test('should add root menu', async ({ page }) => {
    await addRootMenu(page, 'E2E 根菜单');
    const rootMenu = await findMenuByTitle(page, 'E2E 根菜单');
    await expect(rootMenu).toBeVisible();
  });

  test('should add child menu', async ({ page }) => {
    const input = page.getByTestId('menu-title-input');

    // 先添加一个根菜单
    await addRootMenu(page, '父菜单');

    // 找到新添加的菜单
    const parentMenu = await findMenuByTitle(page, '父菜单');

    // 悬停显示操作按钮
    await parentMenu.hover();

    // 点击"添加子菜单"按钮
    const addChildButton = parentMenu.getByTestId('menu-add-child');
    await expect(addChildButton).toBeVisible();
    await addChildButton.click();

    // 验证输入框显示父节点信息
    await expect(page.getByTestId('menu-selected-parent')).toBeVisible();

    // 输入子菜单标题
    await input.fill('子菜单');
    await input.press('Enter');

    // 验证添加按钮文本变回"添加根菜单"
    const childMenu = page.getByTestId('menu-row').filter({ hasText: '子菜单' }).first();
    const parentId = await readRequiredAttribute(parentMenu, 'data-menu-id', '父菜单行');
    await expect(childMenu).toBeVisible({ timeout: 20_000 });
    await expect(childMenu).toHaveAttribute('data-parent-id', parentId);
    await expect(page.getByTestId('menu-add-root')).toBeVisible();

    await page.reload();
    await expect(page.locator('app-tree-menu-simple-page')).toBeVisible({ timeout: 20_000 });
    await page.getByTestId('menu-search-input').fill('子菜单');
    await expect(page.getByTestId('menu-row').filter({ hasText: '子菜单' }).first()).toHaveAttribute(
      'data-parent-id',
      parentId,
      { timeout: 20_000 }
    );
  });

  test('should expand and collapse menu', async ({ page }) => {
    const input = page.getByTestId('menu-title-input');

    // 添加父菜单
    await addRootMenu(page, '可展开菜单');

    // 找到菜单项
    const parentMenu = await findMenuByTitle(page, '可展开菜单');

    // 悬停并添加子菜单
    await parentMenu.hover();
    const addChildButton = parentMenu.getByTestId('menu-add-child');
    await addChildButton.click();
    await input.fill('子项');
    await input.press('Enter');

    // 找到展开/折叠按钮
    const childMenu = page.getByTestId('menu-row').filter({ hasText: '子项' }).first();
    await expect(childMenu).toBeVisible({ timeout: 20_000 });
    const expandButton = parentMenu.getByTestId('menu-node-toggle');
    await expect(expandButton).toBeVisible();

    // 点击折叠
    await expandButton.click();
    await expect(childMenu).toBeHidden();

    // 点击展开
    await expandButton.click();
    await expect(childMenu).toBeVisible();
  });

  test('should show edit button on hover', async ({ page }) => {
    // 添加菜单
    await addRootMenu(page, '待编辑菜单');

    // 找到菜单项
    const menuItem = await findMenuByTitle(page, '待编辑菜单');

    // 悬停显示编辑按钮
    await menuItem.hover();

    // 验证编辑按钮可见
    const editButton = menuItem.getByTestId('menu-edit');
    await expect(editButton).toBeVisible();
  });

  test('should show delete button on hover', async ({ page }) => {
    // 添加菜单
    await addRootMenu(page, '待删除菜单');

    // 找到菜单项
    const menuItem = await findMenuByTitle(page, '待删除菜单');

    // 悬停显示删除按钮
    await menuItem.hover();

    // 验证删除按钮可见
    const deleteButton = menuItem.getByTestId('menu-delete');
    await expect(deleteButton).toBeVisible();
  });

  test('should have search input', async ({ page }) => {
    // 找到搜索框
    const searchInput = page.getByTestId('menu-search-input');
    await expect(searchInput).toBeVisible();
  });

  test('should clear search', async ({ page }) => {
    const searchInput = page.getByTestId('menu-search-input');

    // 输入搜索关键词
    await searchInput.fill('测试');

    // 点击清除按钮
    const clearButton = page.getByTestId('menu-clear-search');
    await expect(clearButton).toBeVisible();
    await clearButton.click();

    // 验证搜索框已清空
    await expect(searchInput).toHaveValue('');
  });

  test('should have batch add button', async ({ page }) => {
    // 查找批量添加按钮（按 aria-label 精确定位）
    const dropdownButton = page.getByTestId('menu-batch-add');
    await expect(dropdownButton).toBeVisible();
  });

  test('should have expand/collapse all button', async ({ page }) => {
    const input = page.getByTestId('menu-title-input');

    // 添加一个带子菜单的菜单
    await addRootMenu(page, '父菜单');

    const parentMenu = await findMenuByTitle(page, '父菜单');
    await parentMenu.hover();

    const addChildButton = parentMenu.getByTestId('menu-add-child');
    await addChildButton.click();
    await input.fill('子菜单');
    await input.press('Enter');
    await expect(parentMenu.getByTestId('menu-node-toggle')).toBeVisible({ timeout: 20_000 });

    // 查找展开/折叠全部按钮
    const toggleAllButton = page.getByTestId('menu-toggle-all');
    await expect(toggleAllButton).toBeVisible({ timeout: 10000 });
  });

  test('should have undo and redo buttons', async ({ page }) => {
    const undoButton = page.locator('button[aria-label="撤销"]');
    const redoButton = page.locator('button[aria-label="重做"]');

    await expect(undoButton).toBeVisible();
    await expect(redoButton).toBeVisible();
  });

  test('should have history toggle button', async ({ page }) => {
    const historyButton = page.locator('button[aria-label="历史记录"]');
    await expect(historyButton).toBeVisible();

    // 点击打开历史侧边栏
    await historyButton.click();

    // 验证历史侧边栏可见
    const historySidebar = page.locator('ao-history-sidebar');
    await expect(historySidebar).toBeVisible();
  });

  test('should have delete all button', async ({ page }) => {
    const deleteAllButton = page.getByTestId('menu-delete-all');
    await expect(deleteAllButton).toBeVisible();
  });

  test('should display menu count badge', async ({ page }) => {
    const badge = page.getByTestId('menu-count');
    await expect(badge).toBeVisible();
  });

  test('should display expanded count', async ({ page }) => {
    const expandedCount = page.getByTestId('menu-expanded-count');
    await expect(expandedCount).toBeVisible();
  });
});
