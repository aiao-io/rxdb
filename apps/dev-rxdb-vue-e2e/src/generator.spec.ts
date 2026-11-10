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

  // 三端同一场景：Menu 是 TreeRepository 实体，页面要注册树生成器才产得出代码（只断标签可见测不到）
  test('Menu 示例生成树实体代码并可下载', async ({ page }) => {
    await page.getByRole('tab', { name: 'Menu' }).click();

    await expect(page.getByTestId('generator-output-editor')).toContainText('@aiao/rxdb-plugin-tree');
    const download = page.getByTestId('generator-download');
    await expect(download).toBeEnabled();
    const downloading = page.waitForEvent('download');
    await download.click();
    expect((await downloading).suggestedFilename()).toMatch(/\.zip$/);
  });
});
