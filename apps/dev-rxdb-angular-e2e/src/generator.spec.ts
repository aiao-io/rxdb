import { expect, test } from '@playwright/test';

test.describe('Generator Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/generator');
    await expect(page.getByTestId('generator-input-editor')).toBeVisible();
  });

  /**
   * P1-2：原用例是 `expect(page.locator('app-generator-page')).toBeVisible()` ——
   * **与 beforeEach 里那一行逐字相同**。整个文件因此只验证了"路由能进"，
   * 而生成器页面的核心控件一个都没断。
   */
  test('渲染生成并下载入口', async ({ page }) => {
    await expect(page.getByTestId('generator-download')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('generator-output-editor')).toBeVisible();
  });
});
