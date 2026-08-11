import { expect, test } from '@playwright/test';

test.describe('AG Grid Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/ag-grid');
    await page.waitForLoadState('domcontentloaded');
  });

  test('should load ag-grid component', async ({ page }) => {
    const grid = page.getByTestId('ag-grid');
    await expect(grid).toBeVisible({ timeout: 10000 });
  });

  test('should have column headers', async ({ page }) => {
    const header = page.getByTestId('ag-grid').getByRole('columnheader').filter({ hasText: 'id' });
    await expect(header).toBeVisible();
  });
});
