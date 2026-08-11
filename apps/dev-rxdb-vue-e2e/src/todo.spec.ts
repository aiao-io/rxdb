import { expect, test } from '@playwright/test';

test.describe('Todo Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/todo');
    await expect(page.getByTestId('todo-page')).toBeVisible();
  });

  test('should display todo page', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1, name: 'Todos' })).toBeVisible();
  });

  test('should have todo input field', async ({ page }) => {
    const input = page.getByTestId('todo-title-input');
    await expect(input).toBeVisible();
  });

  test('should have add button', async ({ page }) => {
    const addButton = page.getByTestId('todo-add');
    await expect(addButton).toBeVisible();
  });

  test('should add a new todo', async ({ page }) => {
    const input = page.getByTestId('todo-title-input');
    const addButton = page.getByTestId('todo-add');

    // 输入待办事项
    await input.fill('E2E 测试任务');

    // 点击添加按钮
    await addButton.click();

    // 验证新的 todo 出现在列表中 (使用更宽松的选择器)
    await expect(page.getByTestId('todo-row').filter({ hasText: 'E2E 测试任务' })).toBeVisible({ timeout: 15000 });
    await expect(input).toHaveValue('', { timeout: 15000 });
  });

  test('should add todo by pressing Enter', async ({ page }) => {
    const input = page.getByTestId('todo-title-input');

    // 输入待办事项并按 Enter
    await input.fill('按回车添加的任务');
    await input.press('Enter');

    // 验证新的 todo 出现在列表中
    await expect(page.getByTestId('todo-row').filter({ hasText: '按回车添加的任务' })).toBeVisible({ timeout: 15000 });
    await expect(input).toHaveValue('', { timeout: 15000 });
  });

  test('should show edit button on hover', async ({ page }) => {
    const input = page.getByTestId('todo-title-input');

    // 添加一个新任务
    await input.fill('待编辑任务');
    await input.press('Enter');

    // 等待任务出现
    const todoItem = page.getByTestId('todo-row').filter({ hasText: '待编辑任务' });
    await expect(todoItem).toBeVisible({ timeout: 15000 });
    await expect(input).toHaveValue('', { timeout: 15000 });

    // 悬停显示编辑按钮
    await todoItem.hover();

    // 验证编辑按钮可见
    const editButton = todoItem.getByTestId('todo-edit');
    await expect(editButton).toBeVisible();
  });

  test('should delete todo', async ({ page }) => {
    const input = page.getByTestId('todo-title-input');

    // 添加一个新任务
    await input.fill('待删除任务');
    await input.press('Enter');

    // 等待任务出现
    const todoItem = page.getByTestId('todo-row').filter({ hasText: '待删除任务' });
    await expect(todoItem).toBeVisible({ timeout: 15000 });
    await expect(input).toHaveValue('', { timeout: 15000 });

    // 悬停显示删除按钮
    await todoItem.hover();

    // 点击删除按钮
    const deleteButton = todoItem.getByTestId('todo-delete');
    await expect(deleteButton).toBeVisible();
    await deleteButton.click();

    // 验证任务已被删除
    await expect(todoItem).toBeHidden({ timeout: 10000 });
  });
});
