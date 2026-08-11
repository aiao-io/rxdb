import { expect, test } from '@playwright/test';

import { readCount } from './e2e-utils.js';

test.describe('Todo Cursor Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/todo-cursor');
    await expect(page.getByRole('heading', { level: 1, name: /Todo \(Cursor\)/ })).toBeVisible();
    await expect(page.getByTestId('todo-cursor-add-1')).toBeEnabled({ timeout: 15000 });
  });

  test('should display todo cursor page', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1, name: /Todo \(Cursor\)/ })).toBeVisible();
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

  test('should have add 1000 button', async ({ page }) => {
    const add1000Button = page.getByTestId('todo-cursor-add-1000');
    await expect(add1000Button).toBeVisible();
    await expect(add1000Button).toBeEnabled();
  });

  test('should have add 10000 button', async ({ page }) => {
    const add10000Button = page.getByTestId('todo-cursor-add-10000');
    await expect(add10000Button).toBeVisible();
    await expect(add10000Button).toBeEnabled();
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
   * P0-2：原实现点两下 Completed 按钮，**一条断言都没有** ——
   * 按钮就算被换成 `onClick={() => {}}` 它照样绿。
   *
   * 排序真正可观察的效果是**行顺序翻转**：查询是
   * `orderBy: [{ completed }, { id: 'desc' }]`，asc 时未完成在前，desc 时已完成在前。
   * 所以这里造一条已完成 + 一条未完成，断言首行在两次点击间来回换。
   */
  test('should toggle completed sort', async ({ page }) => {
    const input = page.getByTestId('todo-cursor-title-input');
    await input.fill('已完成项');
    await input.press('Enter');
    await expect(page.getByTestId('todo-cursor-row').filter({ hasText: '已完成项' })).toBeVisible({ timeout: 15000 });
    await input.fill('未完成项');
    await input.press('Enter');
    await expect(page.getByTestId('todo-cursor-row').filter({ hasText: '未完成项' })).toBeVisible({ timeout: 15000 });

    // 先等列表稳定：第二次新增会触发 `resource.refresh()` 重建行，
    // 在重建过程中点 checkbox，点击可能落在已被替换掉的 DOM 节点上，React 收不到 change。
    const rows = page.getByTestId('todo-cursor-row').filter({ hasText: /完成项/ });
    await expect(rows).toHaveCount(2, { timeout: 15000 });

    // 用 click 而不是 check：checkbox 是受控的，勾选要等仓储写回后 React 才 rerender，
    // Playwright 的 `check()` 会因为"点完 DOM 状态没立刻变"而直接失败。
    const doneCheckbox = page
      .getByTestId('todo-cursor-row')
      .filter({ hasText: '已完成项' })
      .getByTestId('todo-cursor-completed');
    await expect(async () => {
      if (!(await doneCheckbox.isChecked())) await doneCheckbox.click();
      await expect(doneCheckbox).toBeChecked({ timeout: 3000 });
    }).toPass({ timeout: 20000 });

    const sortButton = page.getByTestId('todo-cursor-sort');

    // asc：未完成排前
    await expect(rows).toHaveText([/未完成项/u, /已完成项/u], { timeout: 15000 });

    await sortButton.click();
    // desc：已完成排前
    await expect(rows).toHaveText([/已完成项/u, /未完成项/u], { timeout: 15000 });

    await sortButton.click();
    await expect(rows).toHaveText([/未完成项/u, /已完成项/u], { timeout: 15000 });
  });

  test('should show left count badge', async ({ page }) => {
    const badge = page.getByTestId('todo-cursor-count');
    await expect(badge).toBeVisible();
  });

  test('should load the next cursor page when scrolled to the bottom', async ({ page }) => {
    const oldestTitle = `cursor-page-2-${Date.now()}`;
    const input = page.getByTestId('todo-cursor-title-input');

    await input.fill(oldestTitle);
    await input.press('Enter');
    await expect(page.getByText(oldestTitle, { exact: true })).toBeVisible({ timeout: 15000 });

    const add10Button = page.getByTestId('todo-cursor-add-10');
    for (let batch = 0; batch < 5; batch++) {
      await add10Button.click();
      await expect(add10Button).toBeEnabled({ timeout: 15000 });
    }

    const viewport = page.getByTestId('todo-cursor-viewport');
    const pageSize = Number(await viewport.getAttribute('data-page-size'));

    expect(pageSize).toBeGreaterThan(0);
    await expect(viewport).toHaveAttribute('data-loaded-count', String(pageSize));

    await viewport.evaluate(element => element.scrollTo({ top: element.scrollHeight }));
    await expect
      .poll(async () => Number(await viewport.getAttribute('data-loaded-count')), { timeout: 15000 })
      .toBeGreaterThan(pageSize);

    await viewport.evaluate(element => element.scrollTo({ top: element.scrollHeight }));
    await expect(page.getByText(oldestTitle, { exact: true })).toBeVisible({ timeout: 15000 });
  });
});
