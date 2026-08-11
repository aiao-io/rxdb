import { expect, test } from '@playwright/test';
import { readRequiredAttribute, resetE2eState } from './e2e-utils.js';

test.describe('File Manager Lazy Loading Page', () => {
  test.beforeEach(async ({ page }) => {
    await resetE2eState(page);
    await page.goto('/file-manager-lazy');
    const title = page.locator('h1').filter({ hasText: 'File Manager' });
    await expect(title).toBeVisible({ timeout: 15000 });
  });

  test('should display page title', async ({ page }) => {
    const title = page.locator('h1').filter({ hasText: 'File Manager' });
    await expect(title).toBeVisible();
  });

  test('should have file name input', async ({ page }) => {
    const input = page.getByTestId('file-name-input');
    await expect(input).toBeVisible();
  });

  test('should have search input', async ({ page }) => {
    const searchInput = page.getByTestId('file-search-input');
    await expect(searchInput).toBeVisible();
  });

  test('should render virtual scroll after adding a node', async ({ page }) => {
    const input = page.getByTestId('file-name-input');
    const addButton = page.getByTestId('file-submit');

    await input.fill('虚拟滚动测试文件夹');
    await addButton.click();

    await expect(page.getByTestId('file-row').filter({ hasText: '虚拟滚动测试文件夹' })).toBeVisible({
      timeout: 10000
    });
    await expect(page.locator('app-file-manager-lazy-page .virtual-scroll-viewport')).toBeVisible();
  });

  test('should have control buttons', async ({ page }) => {
    // 验证撤销按钮
    const undoButton = page.locator('button[aria-label="撤销"]').first();
    await expect(undoButton).toBeVisible();

    // 验证重做按钮
    const redoButton = page.locator('button[aria-label="重做"]').first();
    await expect(redoButton).toBeVisible();

    // 验证历史按钮
    const historyButton = page.locator('button[aria-label="历史记录"]').first();
    await expect(historyButton).toBeVisible();
  });

  test('should add root folder', async ({ page }) => {
    const input = page.getByTestId('file-name-input');
    await input.waitFor({ state: 'visible' });

    const addButton = page.getByTestId('file-submit');
    await addButton.waitFor({ state: 'visible' });

    await input.fill('E2E测试文件夹');
    await addButton.click();

    // 等待操作完成

    // 验证文件夹出现
    const folder = page.getByTestId('file-row').filter({ hasText: 'E2E测试文件夹' });
    await expect(folder).toBeVisible({ timeout: 10000 });
  });

  test('should toggle file mode', async ({ page }) => {
    const toggleButton = page.locator('button[aria-label="切换模式"]');
    await toggleButton.waitFor({ state: 'visible' });

    await toggleButton.click();

    // 验证扩展名选择器出现（更精确的选择器，避免与排序选择器冲突）
    const extensionSelect = page.getByTestId('file-extension-select');
    await expect(extensionSelect).toBeVisible();
  });

  test('should search and highlight results', async ({ page }) => {
    const input = page.getByTestId('file-name-input');
    const addButton = page.getByTestId('file-submit');
    const searchInput = page.getByTestId('file-search-input');

    // 添加测试文件夹
    await input.fill('搜索测试文件夹');
    await addButton.click();

    const folder = page.getByTestId('file-row').filter({ hasText: '搜索测试文件夹' }).first();
    await expect(folder).toBeVisible({ timeout: 10000 });

    // 搜索
    await searchInput.fill('搜索测试');
    // 验证搜索高亮
    const highlighted = page.getByTestId('file-search-match');
    await expect(highlighted.first()).toBeVisible({ timeout: 10000 });
  });

  test('should show folder actions on hover', async ({ page }) => {
    const input = page.getByTestId('file-name-input');
    const addButton = page.getByTestId('file-submit');

    // 添加文件夹
    await input.fill('悬停测试');
    await addButton.click();

    const folder = page.getByTestId('file-row').filter({ hasText: '悬停测试' }).first();
    await expect(folder).toBeVisible({ timeout: 10000 });
    await folder.hover();

    // 验证操作按钮
    const actions = folder.getByTestId('file-actions');
    await expect(actions).toBeVisible();
  });

  test('should support draggable nodes', async ({ page }) => {
    const input = page.getByTestId('file-name-input');
    const addButton = page.getByTestId('file-submit');
    const sourceTitle = `拖拽源-${Date.now()}`;
    const targetTitle = `拖拽目标-${Date.now()}`;

    // 添加两个根文件夹，真实执行一次拖入操作。
    await input.fill(targetTitle);
    await addButton.click();
    const target = page.getByTestId('file-row').filter({ hasText: targetTitle }).first();
    await expect(target).toBeVisible({ timeout: 10000 });

    await input.fill(sourceTitle);
    await addButton.click();
    const source = page.getByTestId('file-row').filter({ hasText: sourceTitle }).first();
    await expect(source).toBeVisible({ timeout: 10000 });

    await expect(source).toHaveAttribute('draggable', 'true');
    await source.dragTo(target);

    await expect(source).toHaveAttribute(
      'data-parent-id',
      await readRequiredAttribute(target, 'data-file-id', '拖拽目标行'),
      {
        timeout: 20000
      }
    );
    await expect(target.getByTestId('file-node-toggle')).toBeVisible({ timeout: 20000 });
  });
});
