import { expect, test } from '@playwright/test';

import { readCount, resetE2eState } from './e2e-utils.js';

test.describe('Todo Cursor Page', () => {
  test.beforeEach(async ({ page }) => {
    await resetE2eState(page);
    await page.goto('/todo-cursor');
    await expect(page.getByTestId('todo-cursor-viewport')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('todo-cursor-add-1')).toBeEnabled({ timeout: 15000 });
  });

  test('should display todo cursor page', async ({ page }) => {
    await expect(page.getByTestId('todo-cursor-viewport')).toBeVisible();
    await expect(page.getByTestId('todo-cursor-count')).toBeVisible();
  });

  test('should have add 1 button', async ({ page }) => {
    const add1Button = page.getByTestId('todo-cursor-add-1');
    await expect(add1Button).toBeVisible();
    await expect(add1Button).toBeEnabled();
  });

  test('should have add 10 button', async ({ page }) => {
    const add10Button = page.getByTestId('todo-cursor-add-10');
    await expect(add10Button).toBeVisible();
    await expect(add10Button).toBeEnabled();
  });

  test('should have add 100 button', async ({ page }) => {
    const add100Button = page.getByTestId('todo-cursor-add-100');
    await expect(add100Button).toBeVisible();
    await expect(add100Button).toBeEnabled();
  });

  /**
   * P0-1：原实现点了 `add 1`，然后只断言按钮**又变回可用** ——
   * 用例名写着 "functional"，但它对"到底加没加进去"一个字都没说。
   * 把批量添加整个换成空实现，这条用例照样绿。
   *
   * 改为断言真实效果：`N left` 计数在点击后**恰好加一**。
   *
   * 这条修复 2026-08-06 只落在 Vue 一端，React / Angular 两端的同名用例
   * 逐字保留着缺陷版本，本轮（2026-08-07）补齐，见 APP-dev-rxdb-vue-e2e-p0-1。
   */
  test('should have functional batch add buttons', async ({ page }) => {
    const add1Button = page.getByTestId('todo-cursor-add-1');
    const leftBadge = page.getByTestId('todo-cursor-count');

    await expect(leftBadge).toBeVisible({ timeout: 15000 });
    const before = readCount(await leftBadge.textContent(), 'left 计数');

    await add1Button.click();
    await expect(add1Button).toBeEnabled({ timeout: 15000 });

    await expect
      .poll(async () => readCount(await leftBadge.textContent(), 'left 计数'), { timeout: 15000 })
      .toBe(before + 1);
  });

  test('should be able to add todos using input field', async ({ page }) => {
    const input = page.getByTestId('todo-cursor-title-input');
    const addButton = page.getByTestId('todo-cursor-add');
    const title = `Test todo from e2e-${Date.now()}`;

    // 输入待办事项
    await input.fill(title);

    // 点击添加按钮
    await addButton.click();

    // 等待输入框清空
    await expect(input).toHaveValue('', { timeout: 15000 });

    // 验证新的 todo 出现在列表中
    const newTodo = page.getByTestId('todo-cursor-row').filter({ hasText: title }).first();
    await expect(newTodo).toBeVisible({ timeout: 10000 });
  });

  test('should have filter tabs', async ({ page }) => {
    const allTab = page.getByTestId('todo-cursor-tab-all');
    const activeTab = page.getByTestId('todo-cursor-tab-active');
    const completedTab = page.getByTestId('todo-cursor-tab-completed');

    await expect(allTab).toBeVisible();
    await expect(activeTab).toBeVisible();
    await expect(completedTab).toBeVisible();
  });
});
