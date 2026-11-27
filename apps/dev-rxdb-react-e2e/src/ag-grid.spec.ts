import { expect, test } from '@playwright/test';
import { checkAgGridLocale } from '../../../modules/e2e-parity/ag-grid-locale.mjs';
import { resetE2eState } from './e2e-utils.js';

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

test.describe('英文浏览器的 AG Grid', () => {
  test.use({ locale: 'en-US', timezoneId: 'UTC' });

  test('日期和布尔筛选跟随当前语言', async ({ page }) => {
    await resetE2eState(page);
    await checkAgGridLocale(page);
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-Hans');
  });
});
