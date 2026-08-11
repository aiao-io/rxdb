import { expect, test } from '@playwright/test';

test.describe('Home Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/home');
    await expect(page.locator('app-home')).toBeVisible();
  });

  test('should display home page with title', async ({ page }) => {
    await expect(page.locator('app-home')).toContainText('Aiao RxDB');
  });

  test('should navigate to different pages from home', async ({ page }) => {
    await page.getByRole('link', { name: 'Todo (findAll)' }).click();

    await expect(page).toHaveURL(/\/todo$/);
    await expect(page.getByRole('heading', { name: 'Todos', exact: true })).toBeVisible();
  });
});
