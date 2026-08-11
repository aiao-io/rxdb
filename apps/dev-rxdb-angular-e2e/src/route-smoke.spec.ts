import { expect, test, type Page } from '@playwright/test';

/**
 * 五个功能路由的初始化冒烟。
 *
 * ANGULAR-E2E-FRESH-01：`/workspace`、`/branch-manager`、`/remote-cache`、
 * `/menu-virtual`、`/file-manager-virtual` 此前**没有任何 `page.goto()` 进入过** ——
 * 不是断言不够深，是连"这个页面能不能打开"都没有浏览器级门禁。
 *
 * 其中 `menu-virtual` / `file-manager-virtual` 尤其值得补：同系列的
 * simple 与 lazy 两个变体都有 spec，**唯独 virtual 这一档没有** ——
 * 而它是三者里唯一走 CDK 虚拟滚动的，初始化路径与另两个不同。
 *
 * 刻意只做**初始化断言**：路由能进、页面主结构渲染出来、没有崩到错误屏。
 * 每页的行为断言应各自立项 —— 冒烟的价值在于"永远快、永远稳"。
 */
test.describe('功能路由初始化冒烟', () => {
  /** Angular 未捕获错误会清空 `<app-root>`；lazy chunk 加载失败则留下这段文案。 */
  const assertNoAppCrash = async (page: Page): Promise<void> => {
    await expect(page.getByText('Failed to fetch dynamically imported module')).toHaveCount(0);
    await expect(page.locator('app-root')).not.toBeEmpty();
  };

  test('/workspace 能打开并渲染草稿恢复面板', async ({ page }) => {
    await page.goto('/workspace');

    await expect(page.getByRole('heading', { name: 'Workspace 草稿恢复' })).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole('heading', { name: '创建未保存草稿' })).toBeVisible();
    await assertNoAppCrash(page);
  });

  test('/branch-manager 能打开并渲染分支管理', async ({ page }) => {
    await page.goto('/branch-manager');

    await expect(page.getByRole('heading', { name: '分支管理' })).toBeVisible({ timeout: 20000 });
    await assertNoAppCrash(page);
  });

  test('/remote-cache 能打开并渲染缓存面板', async ({ page }) => {
    await page.goto('/remote-cache');

    await expect(page.getByRole('heading', { name: 'Remote Cache' })).toBeVisible({ timeout: 20000 });
    await assertNoAppCrash(page);
  });

  test('/menu-virtual 能打开并渲染虚拟滚动菜单', async ({ page }) => {
    await page.goto('/menu-virtual');

    await expect(page.getByRole('heading', { level: 1, name: 'Tree Menu - Virtual Scroll' })).toBeVisible({
      timeout: 20000
    });
    await assertNoAppCrash(page);
  });

  test('/file-manager-virtual 能打开并渲染虚拟滚动文件管理器', async ({ page }) => {
    await page.goto('/file-manager-virtual');

    await expect(page.getByRole('heading', { level: 1, name: 'File Manager - Virtual Scroll' })).toBeVisible({
      timeout: 20000
    });
    await assertNoAppCrash(page);
  });
});
