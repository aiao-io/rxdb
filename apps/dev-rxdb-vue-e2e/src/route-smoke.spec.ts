import { expect, test, type Page } from '@playwright/test';

/**
 * 五个功能路由的初始化冒烟。
 *
 * VUE-E2E-FRESH-02 + P1-8：`/workspace`、`/branch-manager`、`/opfs`、`/remote-cache`、
 * `/encrypted` 此前**没有任何 `page.goto()` 进入过** ——
 * 不是断言不够深，是连"这个页面能不能打开"都没有浏览器级门禁。
 *
 * 这五页各自依赖一条独立能力（workspace 插件、分支管理、OPFS、远端缓存、字段加密），
 * 任何一条在打包或初始化阶段坏掉都不会被现有用例发现。
 *
 * 刻意只做**初始化断言**：路由能进、页面主结构渲染出来、没有崩到错误屏。
 * 每页的行为断言应各自立项 —— 冒烟的价值在于"永远快、永远稳"。
 */
test.describe('功能路由初始化冒烟', () => {
  /** Vue 未捕获错误 / lazy chunk 加载失败时的兜底文案。 */
  const assertNoAppCrash = async (page: Page): Promise<void> => {
    await expect(page.getByText('Failed to fetch dynamically imported module')).toHaveCount(0);
    await expect(page.locator('#root')).not.toBeEmpty();
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

  test('/encrypted 能打开并停在未解锁状态', async ({ page }) => {
    await page.goto('/encrypted');

    await expect(page.getByRole('heading', { name: '本地字段加密演示' })).toBeVisible({ timeout: 20000 });
    // 未输入口令时解锁按钮必须禁用 —— 这条同时钉住 keyring 的初始状态
    await expect(page.getByRole('button', { name: '解锁', exact: true })).toBeDisabled();
    await assertNoAppCrash(page);
  });

  test('/opfs 能打开并渲染文件操作工具栏', async ({ page }) => {
    await page.goto('/opfs');

    await expect(page.getByRole('button', { name: '上传文件', exact: true })).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole('button', { name: '新建文件夹' })).toBeVisible();
    await assertNoAppCrash(page);
  });

  test('/remote-cache 能打开并渲染缓存面板', async ({ page }) => {
    await page.goto('/remote-cache');

    await expect(page.getByRole('heading', { name: 'Remote Cache' })).toBeVisible({ timeout: 20000 });
    await assertNoAppCrash(page);
  });
});
