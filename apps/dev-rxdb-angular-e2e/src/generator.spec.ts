import { expect, test } from './fixtures.js';

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

  // 三端同一场景：Menu 是 TreeRepository 实体，页面要注册树生成器才产得出代码（只断标签可见测不到）
  test('Menu 示例生成树实体代码并可下载', async ({ page }) => {
    // Angular 的示例标签带 aria-hidden，按角色找要连隐藏元素一起找
    await page.getByRole('tab', { name: 'Menu', includeHidden: true }).click();

    await expect(page.getByTestId('generator-output-editor')).toContainText('@aiao/rxdb-plugin-tree');
    const download = page.getByTestId('generator-download');
    await expect(download).toBeEnabled();
    const downloading = page.waitForEvent('download');
    await download.click();
    expect((await downloading).suggestedFilename()).toMatch(/\.zip$/);
  });
});
