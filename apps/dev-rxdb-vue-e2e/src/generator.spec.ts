import { expect, test } from '@playwright/test';

test.describe('Generator Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/generator');
    await page.waitForLoadState('domcontentloaded');
  });

  test('should display demo tabs', async ({ page }) => {
    const todoTab = page.getByRole('tab', { name: 'Todo' });
    await expect(todoTab).toBeVisible();

    const menuTab = page.getByRole('tab', { name: 'Menu' });
    await expect(menuTab).toBeVisible();
  });

  test('should have generate and download button', async ({ page }) => {
    const button = page.getByTestId('generator-download');
    await expect(button).toBeVisible();
  });

  test('should have code editors', async ({ page }) => {
    await expect(page.getByTestId('generator-input-editor')).toBeVisible();
    await expect(page.getByTestId('generator-output-editor')).toBeVisible();
  });
});
