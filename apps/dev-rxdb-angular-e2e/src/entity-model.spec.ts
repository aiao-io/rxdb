import { expect, test } from '@playwright/test';

test.describe('Entity Model Pages', () => {
  test.describe('Entity List (/entities)', () => {
    test('left catalog renders and auto-redirects to the first entity', async ({ page }) => {
      await page.goto('/entities');
      // 左侧实体目录 + 自动重定向到首个实体（public:Article）
      await expect(page.getByText('实体类型')).toBeVisible();
      await page.waitForURL('**/entities/public/Article');
      await expect(page.getByText('Article', { exact: true }).first()).toBeVisible();
    });

    test('should switch the right list by clicking the left catalog', async ({ page }) => {
      await page.goto('/entities/public/Article');

      // 限定在壳页目录内：全局侧边栏菜单也有 "Todo (findAll)" 链接
      await page.locator('app-entity').getByRole('link', { name: /^Todo/ }).click();
      await page.waitForURL('**/entities/public/Todo');

      await expect(page.getByText('Todo', { exact: true }).first()).toBeVisible();
      await expect(page.getByRole('button', { name: '撤销 (Ctrl+Z)' })).toBeVisible();
      await expect(page.getByRole('button', { name: '重做 (Ctrl+Shift+Z)' })).toBeVisible();
      await expect(page.getByRole('button', { name: '筛选' })).toBeVisible();
      await expect(page.getByRole('button', { name: '+ 新增' })).toBeVisible();
      // 空库时表格渲染空态
      await expect(page.getByText('暂无数据')).toBeVisible();
    });

    test('should create a todo through the detail dialog and refresh the list', async ({ page }) => {
      await page.goto('/entities/public/Todo');
      await page.getByRole('button', { name: '+ 新增' }).click();
      // 对话框内是 create 模式的实体详情（Tab + 表单）
      await expect(page.getByRole('tab', { name: '基本信息' })).toBeVisible();
      await expect(page.getByRole('group', { name: 'title' }).getByRole('textbox')).toBeVisible();
      await expect(page.getByRole('group', { name: 'completed' }).getByRole('checkbox')).toBeVisible();

      await page.getByRole('group', { name: 'title' }).getByRole('textbox').fill('e2e-connected-todo');
      await page.getByRole('button', { name: '保存', exact: true }).click();

      // 保存成功：对话框关闭，列表刷新后空态消失
      await expect(page.getByRole('tab', { name: '基本信息' })).toHaveCount(0);
      await expect(page.getByText('暂无数据')).toHaveCount(0);
    });
  });
});
