import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { createCategory, resetE2eState } from './e2e-utils.js';

/**
 * 工作台 a11y 走查（axe）：扫描范围锁在应用壳内（app-nav + layout-container），
 * 页面级扫描各做一次；发现的违规就地修组件，这份 spec 是回归门禁。
 */
test.describe('工作台 a11y 走查', () => {
  test.beforeEach(async ({ page }) => {
    await resetE2eState(page);
  });

  test('首页 axe 零违规', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('link', { name: '从备份恢复', exact: true })).toBeVisible();
    const results = await new AxeBuilder({ page }).include('#layout-container').analyze();
    expect(results.violations).toEqual([]);
  });

  test('实体列表页 axe 零违规', async ({ page }) => {
    await page.goto('/entities/assets/AssetCategory');
    await createCategory(page, '办公设备');
    await expect(page.getByTestId('entity-shell')).toBeVisible();
    const results = await new AxeBuilder({ page }).include('[data-testid="app-nav"], #layout-container').analyze();
    expect(results.violations).toEqual([]);
  });

  test('备份恢复页 axe 零违规', async ({ page }) => {
    await page.goto('/backup');
    await expect(page.getByTestId('backup-start')).toBeVisible();
    const results = await new AxeBuilder({ page }).include('#layout-container').analyze();
    expect(results.violations).toEqual([]);
  });

  test('搜索页 axe 零违规', async ({ page }) => {
    await page.goto('/search');
    await expect(page.getByTestId('search-input')).toBeVisible();
    const results = await new AxeBuilder({ page }).include('#layout-container').analyze();
    expect(results.violations).toEqual([]);
  });
});
