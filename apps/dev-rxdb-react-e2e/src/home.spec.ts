import { expect, test } from '@playwright/test';

test.describe('Home Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/home');
  });

  test('should display home page', async ({ page }) => {
    // 验证页面加载完成
    await expect(page.getByRole('heading', { level: 1, name: 'Aiao RxDB' })).toBeVisible();
  });

  test('should navigate to different pages from home', async ({ page }) => {
    await page.getByRole('link', { name: 'Todo (findAll)' }).click();

    await expect(page).toHaveURL(/\/todo$/);
    await expect(page.getByRole('heading', { name: 'Todos', exact: true })).toBeVisible();
  });
});
