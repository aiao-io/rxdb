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

    // 等待输入框清空（保存成功后清空）
    await expect(input).toHaveValue('');
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
    await expect(input).toHaveValue('', { timeout: 15000 });

    // 等待任务出现（确保数据保存成功）
    const todoItem = page.getByTestId('todo-row').filter({ hasText: '待编辑任务' });
    await expect(todoItem).toBeVisible({ timeout: 15000 });

    // 悬停显示编辑按钮
    await todoItem.hover();

    // 验证编辑按钮可见
    const editButton = todoItem.getByTestId('todo-edit');
    await expect(editButton).toBeVisible();
  });

  test('should delete todo', async ({ page }) => {
    const input = page.getByTestId('todo-title-input');

    // 使用唯一标识避免跨测试污染（localStorage 共享导致 DB 持久化）
    const uniqueTitle = `待删除任务_${Date.now()}`;

    // 添加一个新任务
    await input.fill(uniqueTitle);
    await input.press('Enter');

    // 等待输入框清空（保存成功）
    await expect(input).toHaveValue('', { timeout: 15000 });

    // 等待任务出现
    const todoItem = page.getByTestId('todo-row').filter({ hasText: uniqueTitle });
    await expect(todoItem).toBeVisible({ timeout: 15000 });

    // 悬停显示删除按钮
    await todoItem.hover();

    // 点击删除按钮
    const deleteButton = todoItem.getByTestId('todo-delete');
    await expect(deleteButton).toBeVisible();
    await deleteButton.click();

    // 验证任务已被删除（与 angular e2e 对齐，避免慢机/并发下 3s 超时）
    await expect(todoItem).toBeHidden({ timeout: 30000 });
  });

  test('should filter todos by status', async ({ page }) => {
    const input = page.getByTestId('todo-title-input');

    // 添加两个任务
    await input.fill('活跃任务');
    await input.press('Enter');
    await expect(page.getByTestId('todo-row').filter({ hasText: '活跃任务' })).toBeVisible({ timeout: 10000 });
    await expect(input).toHaveValue('', { timeout: 15000 });

    await input.fill('已完成任务');
    await input.press('Enter');
    await expect(page.getByTestId('todo-row').filter({ hasText: '已完成任务' })).toBeVisible({ timeout: 10000 });
    await expect(input).toHaveValue('', { timeout: 15000 });

    // 标记第二个任务为完成
    const completedTodo = page.getByTestId('todo-row').filter({ hasText: '已完成任务' });
    await expect(completedTodo).toBeVisible();

    const checkbox = completedTodo.getByTestId('todo-completed');
    await checkbox.click();
    await expect(checkbox).toBeChecked();

    // 切换到"进行中"标签
    const activeTab = page.getByTestId('todo-tab-active');
    await activeTab.click();
    await expect(activeTab).toHaveClass(/tab-active/);

    // 验证只显示活跃任务
    await expect(page.getByTestId('todo-row').filter({ hasText: '活跃任务' })).toBeVisible();
    await expect(page.getByTestId('todo-row').filter({ hasText: '已完成任务' })).toBeHidden();

    // 切换到"已完成"标签
    const completedTab = page.getByTestId('todo-tab-completed');
    await completedTab.click();
    await expect(completedTab).toHaveClass(/tab-active/);

    // 验证只显示已完成任务
    await expect(page.getByTestId('todo-row').filter({ hasText: '已完成任务' })).toBeVisible();
    await expect(page.getByTestId('todo-row').filter({ hasText: '活跃任务' })).toBeHidden();

    // 切换回"全部"标签
    const allTab = page.getByTestId('todo-tab-all');
    await allTab.click();
    await expect(allTab).toHaveClass(/tab-active/);

    // 验证显示所有任务
    await expect(page.getByTestId('todo-row').filter({ hasText: '活跃任务' })).toBeVisible();
    await expect(page.getByTestId('todo-row').filter({ hasText: '已完成任务' })).toBeVisible();
  });

  test('should have batch add dropdown', async ({ page }) => {
    // 查找批量添加下拉菜单按钮
    const dropdownButton = page.getByTestId('todo-batch-add');
    await expect(dropdownButton).toBeVisible();

    // 点击下拉菜单
    await dropdownButton.click();

    // 验证下拉选项可见
    const add100Button = page.getByTestId('todo-batch-option-100');
    await expect(add100Button).toBeVisible();
  });

  test('should have undo/redo buttons', async ({ page }) => {
    const undoButton = page.getByTestId('todo-undo');
    const redoButton = page.getByTestId('todo-redo');

    await expect(undoButton).toBeVisible();
    await expect(redoButton).toBeVisible();
  });

  test('should have history sidebar toggle', async ({ page }) => {
    const historyButton = page.getByTestId('todo-history');
    await expect(historyButton).toBeVisible();

    // 点击切换历史侧边栏
    await historyButton.click();

    // 再次点击切换回来
    await historyButton.click();
  });
});
