import { expect, test } from '@playwright/test';
import { createCategory, resetE2eState } from './e2e-utils.js';

test.describe('资产工作台 Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await resetE2eState(page);
  });

  test('首页保留安全入口，进入 Dashboard 后展示空库状态和快捷操作', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: '开始使用工作台', exact: true })).toBeVisible();
    await expect(page.getByTestId('dashboard-page')).toHaveCount(0);

    await page.goto('/dashboard');
    await expect(page.getByTestId('dashboard-connection-status')).toHaveText('数据库已连接');
    await expect(page.getByTestId('dashboard-empty')).toBeVisible();
    await expect(page.getByTestId('dashboard-metric-card')).toHaveCount(3);
    await expect(page.locator('[data-testid="dashboard-metric-card"][data-metric="categories"]')).toHaveAttribute(
      'href',
      '/entities/assets/AssetCategory'
    );
    await expect(page.getByTestId('dashboard-quick-actions')).toContainText('快捷操作');

    await page.getByTestId('dashboard-quick-actions').getByRole('link', { name: '搜索记录', exact: true }).click();
    await page.waitForURL('**/search');
    await expect(page.getByTestId('search-input')).toBeVisible();
  });

  test('实体新增后 Dashboard 统计卡和总数自动更新', async ({ page }) => {
    await page.goto('/entities/assets/AssetCategory');
    await createCategory(page, 'Dashboard 分类');

    await page.goto('/dashboard');
    await expect(page.getByTestId('dashboard-connection-status')).toHaveText('数据库已连接');
    await expect(page.locator('[data-testid="dashboard-metric-card"][data-metric="categories"]')).toContainText('1');
    await expect(page.getByTestId('dashboard-total')).toContainText('记录总数：1');
    await expect(page.getByTestId('dashboard-empty')).toHaveCount(0);
  });
});
