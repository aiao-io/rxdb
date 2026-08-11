import { expect, test } from '@playwright/test';

test.describe('Code Editor Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/code-editor');
    await page.waitForLoadState('domcontentloaded');
  });

  test('should load code editor component', async ({ page }) => {
    const editor = page.getByTestId('code-editor');
    await expect(editor).toBeVisible({ timeout: 5000 });
  });

  test('should have content', async ({ page }) => {
    const content = page.getByTestId('code-editor').getByRole('textbox');
    await expect(content).toBeVisible();
    await expect(content).toContainText('CREATE TABLE');
  });
});
