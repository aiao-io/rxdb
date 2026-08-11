import { expect, test } from '@playwright/test';
import { readCount } from './e2e-utils.js';

test.describe('Todo Cursor Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/todo-cursor');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByTestId('todo-cursor-add-1')).toBeEnabled({ timeout: 15000 });
  });

  test('should display todo cursor page', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Todo');
  });

  test('should have batch add buttons', async ({ page }) => {
    for (const count of [1, 10, 100, 1000, 10000] as const) {
      const button = page.getByTestId(`todo-cursor-add-${count}`);
      await expect(button).toBeVisible();
      await expect(button).toBeEnabled();
    }
  });

  /**
   * P0-1 / P1-7：原实现点了 `add 1`，然后只断言按钮**又变回可用** ——
   * 用例名写着 "functional"，但它对"到底加没加进去"一个字都没说。
   * 把 `add_many_todo` 整个换成空实现，这条用例照样绿。
   *
   * 改为断言真实效果：`N left` 计数在点击后**恰好加一**。
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

    // 输入待办事项
    await input.fill('Test todo from e2e');

    // 点击添加按钮
    await addButton.click();

    // 验证新的 todo 出现在列表中
    await expect(page.getByTestId('todo-cursor-row').filter({ hasText: 'Test todo from e2e' })).toBeVisible({
      timeout: 15000
    });
    await expect(input).toHaveValue('', { timeout: 15000 });
  });

  test('should have filter tabs', async ({ page }) => {
    const allTab = page.getByTestId('todo-cursor-tab-all');
    const activeTab = page.getByTestId('todo-cursor-tab-active');
    const completedTab = page.getByTestId('todo-cursor-tab-completed');

    await expect(allTab).toBeVisible();
    await expect(activeTab).toBeVisible();
    await expect(completedTab).toBeVisible();
  });

  /**
   * P0-1 / P1-7：原实现点两下排序按钮、**一条断言都没有** ——
   * 按钮换成 `@click="() => {}"` 它照样绿。
   *
   * 排序真正可观察的效果是行顺序翻转：查询是 `orderBy: [{ completed }, { id: 'desc' }]`，
   * asc 时未完成在前、desc 时已完成在前。
   */
  test('should toggle completed sort', async ({ page }) => {
    const input = page.getByTestId('todo-cursor-title-input');
    await input.fill('已完成项');
    await input.press('Enter');
    await expect(page.getByTestId('todo-cursor-row').filter({ hasText: '已完成项' })).toBeVisible({ timeout: 15000 });
    await input.fill('未完成项');
    await input.press('Enter');
    await expect(page.getByTestId('todo-cursor-row').filter({ hasText: '未完成项' })).toBeVisible({ timeout: 15000 });

    const rows = page.getByTestId('todo-cursor-row').filter({ hasText: /完成项/u });
    await expect(rows).toHaveCount(2, { timeout: 15000 });

    // 用 click 而不是 check：checkbox 是受控的，勾选要等仓储写回后才 rerender。
    const doneCheckbox = page
      .getByTestId('todo-cursor-row')
      .filter({ hasText: '已完成项' })
      .getByTestId('todo-cursor-completed');
    await expect(async () => {
      if (!(await doneCheckbox.isChecked())) await doneCheckbox.click();
      await expect(doneCheckbox).toBeChecked({ timeout: 3000 });
    }).toPass({ timeout: 20000 });

    const sortButton = page.getByTestId('todo-cursor-sort');
    const firstMatchingTitle = () => rows.evaluateAll(elements => elements[0]?.textContent ?? '');

    await expect.poll(firstMatchingTitle, { timeout: 15000 }).toContain('未完成项');
    await sortButton.click();
    await expect.poll(firstMatchingTitle, { timeout: 15000 }).toContain('已完成项');
    await sortButton.click();
    await expect.poll(firstMatchingTitle, { timeout: 15000 }).toContain('未完成项');
  });
});
