import { expect, test } from '@playwright/test';
import { resetE2eState } from './e2e-utils.js';

test.describe('File Manager Page', () => {
  test.beforeEach(async ({ page }) => {
    await resetE2eState(page);
    await page.goto('/file-manager-simple');
    await expect(page.locator('app-file-manager-simple-page')).toBeVisible();
  });

  test('should display file manager page', async ({ page }) => {
    await expect(page.locator('h1')).toContainText(/File Manager|文件管理器/);
  });

  // P1-2：这里原有一条 `should load file manager component`，
  // 断言与 beforeEach 里那一行逐字相同（`app-file-manager-simple-page` 可见）。
  // 前置条件不需要在用例体里再断一次 —— beforeEach 失败时整组用例本来就不会跑。

  /**
   * P1-8：原先是 `locator('input[placeholder*="添加"]').or(locator('input[type="text"]')).last()`。
   * `.or()` 的语义是"两个都试，谁匹配上算谁" —— **第一个选择器失效时不会报错，
   * 会静默退到第二个**，而第二个 (`input[type="text"]`) 宽到能匹配页面上任何文本框。
   * 于是"输入框还在吗"这个断言，在输入框被换掉之后依然会绿。
   *
   * 同一文件 `:40` 早就有稳定选择器 `input#file-name-input` —— 直接用它。
   */
  test('should have file/folder input field', async ({ page }) => {
    await expect(page.getByTestId('file-name-input')).toBeVisible();
  });

  test('should have add folder button', async ({ page }) => {
    const addButton = page.getByTestId('file-submit');
    await expect(addButton).toBeVisible();
  });

  test('should have file mode toggle button', async ({ page }) => {
    // 查找文件模式切换按钮
    const fileButton = page.locator('button[aria-label="切换模式"]');
    await expect(fileButton).toBeVisible();
  });

  test('should have sort dropdown', async ({ page }) => {
    // 查找排序下拉框
    const sortSelect = page.getByTestId('file-sort-select');
    await expect(sortSelect).toBeVisible();
  });

  test('should have file name input placeholder', async ({ page }) => {
    const input = page.getByTestId('file-name-input');
    await expect(input).toBeVisible();

    // P2-5：原先这里有一行 `const placeholder = input;` —— 一个不改变任何语义的别名，
    // 只会让读者以为 placeholder 是另一个元素。
    await expect(input).toHaveAttribute('placeholder');
  });

  test('should have search input', async ({ page }) => {
    // 找到搜索框
    const searchInput = page.getByTestId('file-search-input');
    await expect(searchInput).toBeVisible();
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

  test('should have expand/collapse all button', async ({ page }) => {
    const toggleAllButton = page.getByTestId('file-toggle-all');
    await expect(toggleAllButton).toBeVisible();
  });

  test('should have delete all button', async ({ page }) => {
    const deleteAllButton = page.getByTestId('file-delete-all');
    await expect(deleteAllButton).toBeVisible();
  });

  test('should display file count badge', async ({ page }) => {
    const badge = page.getByTestId('file-count');
    await expect(badge).toBeVisible();
  });

  test('should display expanded count', async ({ page }) => {
    const expandedCount = page.getByTestId('file-expanded-count');
    await expect(expandedCount).toBeVisible();
  });
});
