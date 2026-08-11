import { expect, test, type Page } from '@playwright/test';
import { resetE2eState } from './e2e-utils.js';

function uniqueTitle(prefix: string): string {
  return `${prefix}-${Date.now()}`;
}

function todoRow(page: Page, title: string) {
  return page.getByTestId('todo-row').filter({ hasText: title }).first();
}

async function addTodo(page: Page, title: string) {
  const input = page.getByTestId('todo-title-input');
  await input.fill(title);
  await page.getByTestId('todo-add').click();
  const row = todoRow(page, title);
  await expect(row).toBeVisible({ timeout: 15000 });
  await expect(input).toHaveValue('', { timeout: 15000 });
  return row;
}

test.describe('Todo Page', () => {
  test.beforeEach(async ({ page }) => {
    await resetE2eState(page);
    await page.goto('/todo');
    await expect(page.locator('h1').filter({ hasText: 'Todo' })).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('todo-title-input')).toBeVisible();
  });

  test('should display todo page', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Todo');
  });

  test('should have todo input field', async ({ page }) => {
    await expect(page.getByTestId('todo-title-input')).toBeVisible();
  });

  test('should have add button', async ({ page }) => {
    await expect(page.getByTestId('todo-add')).toBeVisible();
  });

  test('should add a new todo and persist it after reload', async ({ page }) => {
    const title = uniqueTitle('E2E 测试任务');
    await addTodo(page, title);

    await page.reload();
    await expect(page.getByTestId('todo-title-input')).toBeVisible({ timeout: 15000 });
    await expect(todoRow(page, title)).toBeVisible({ timeout: 15000 });
  });

  test('should add todo by pressing Enter', async ({ page }) => {
    const title = uniqueTitle('按回车添加的任务');
    const input = page.getByTestId('todo-title-input');

    await input.fill(title);
    await input.press('Enter');

    await expect(todoRow(page, title)).toBeVisible({ timeout: 15000 });
    await expect(input).toHaveValue('', { timeout: 15000 });
  });

  test('should edit a todo and persist the new title', async ({ page }) => {
    const originalTitle = uniqueTitle('待编辑任务');
    const updatedTitle = uniqueTitle('已编辑任务');
    const row = await addTodo(page, originalTitle);

    await row.hover();
    await row.getByTestId('todo-edit').click();

    // 编辑态会把标题文本替换成 input，原先按 hasText 捕获的 row locator 会动态失配。
    const editingRow = page
      .getByTestId('todo-row')
      .filter({ has: page.getByTestId('todo-edit-input') })
      .first();
    const editInput = editingRow.getByTestId('todo-edit-input');
    await expect(editingRow).toBeVisible();
    await editInput.fill(updatedTitle);
    await editingRow.getByTestId('todo-save').click();

    await expect(todoRow(page, updatedTitle)).toBeVisible({ timeout: 15000 });
    await expect(todoRow(page, originalTitle)).toHaveCount(0);

    await page.reload();
    await expect(page.getByTestId('todo-title-input')).toBeVisible({ timeout: 15000 });
    await expect(todoRow(page, updatedTitle)).toBeVisible({ timeout: 15000 });
  });

  test('should delete todo', async ({ page }) => {
    const title = uniqueTitle('待删除任务');
    const row = await addTodo(page, title);

    await row.hover();
    await row.getByTestId('todo-delete').click();

    await expect(row).toBeHidden({ timeout: 30000 });
  });

  test('should filter todos by status', async ({ page }) => {
    const activeTitle = uniqueTitle('活跃任务');
    const completedTitle = uniqueTitle('已完成任务');
    const activeRow = await addTodo(page, activeTitle);
    const completedRow = await addTodo(page, completedTitle);

    const checkbox = completedRow.getByTestId('todo-completed');
    await checkbox.click();
    await expect(checkbox).toBeChecked();

    await page.getByTestId('todo-tab-active').click();
    await expect(activeRow).toBeVisible();
    await expect(completedRow).toBeHidden();

    await page.getByTestId('todo-tab-completed').click();
    await expect(todoRow(page, completedTitle)).toBeVisible();
    await expect(todoRow(page, activeTitle)).toBeHidden();

    await page.getByTestId('todo-tab-all').click();
    await expect(todoRow(page, activeTitle)).toBeVisible();
    await expect(todoRow(page, completedTitle)).toBeVisible();
  });

  test('should have batch add dropdown', async ({ page }) => {
    await page.getByTestId('todo-batch-add').click();
    await expect(page.getByTestId('todo-batch-option-1')).toBeVisible();
    await expect(page.getByTestId('todo-batch-option-10')).toBeVisible();
    await expect(page.getByTestId('todo-batch-option-100')).toBeVisible();
  });

  test('should have undo and redo buttons', async ({ page }) => {
    await expect(page.getByTestId('todo-undo')).toBeVisible();
    await expect(page.getByTestId('todo-redo')).toBeVisible();
  });

  test('should have clear completed button', async ({ page }) => {
    await expect(page.getByTestId('todo-clear-completed')).toBeVisible();
  });

  test('should have toggle all button', async ({ page }) => {
    await expect(page.getByTestId('todo-toggle-all')).toBeVisible();
  });

  test('should display todo count badge', async ({ page }) => {
    const badge = page.getByTestId('todo-count');
    await expect(badge).toBeVisible();
    await expect(badge).toContainText('待办');
  });
});
