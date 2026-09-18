import { expect, test } from '@playwright/test';

test.describe('Entity Model Pages', () => {
  test.describe('Entity List', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/entity-list');
    });

    test('should render entity list toolbar and table', async ({ page }) => {
      await expect(page.getByText('Todo', { exact: true }).first()).toBeVisible();
      await expect(page.getByRole('button', { name: '撤销 (Ctrl+Z)' })).toBeVisible();
      await expect(page.getByRole('button', { name: '重做 (Ctrl+Shift+Z)' })).toBeVisible();
      await expect(page.getByRole('button', { name: '筛选' })).toBeVisible();
      await expect(page.getByRole('button', { name: '+ 新增' })).toBeVisible();
      // 空库时表格渲染空态
      await expect(page.getByText('暂无数据')).toBeVisible();
    });
  });

  test.describe('Entity Detail', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/entity-detail');
    });

    test('should render create-mode detail form with draft lifecycle', async ({ page }) => {
      await expect(page.getByRole('tab', { name: '基本信息' })).toBeVisible();
      await expect(page.getByLabel('title')).toBeVisible();
      await expect(page.getByLabel('completed')).toBeVisible();
      await expect(page.getByRole('button', { name: '保存' })).toBeVisible();
      await expect(page.getByRole('button', { name: '取消' })).toBeVisible();
    });
  });

  test.describe('Query Builder', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/query-builder');
    });

    test('should render query builder with Todo schema', async ({ page }) => {
      await expect(page.getByRole('heading', { name: 'Query Builder — Todo' })).toBeVisible();
      await expect(page.getByRole('search', { name: '查询条件构建器' })).toBeVisible();
      await expect(page.getByText(/匹配 \d+ 条/)).toBeVisible();
    });
  });
});
