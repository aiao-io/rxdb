import { expect, test } from '@playwright/test';
import { createCategory, expectActionIcon, expectListHasRows, fillField, resetE2eState } from './e2e-utils.js';

test.describe('资产工作台 Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await resetE2eState(page);
  });

  test('首页保留安全入口，进入 Dashboard 后展示空库状态和快捷操作', async ({ page }) => {
    const wasmRequests: string[] = [];
    page.on('request', request => {
      if (new URL(request.url()).pathname.endsWith('.wasm')) wasmRequests.push(request.url());
    });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: '开始使用工作台', exact: true })).toBeVisible();
    expect(wasmRequests).toEqual([]);
    await expect(page.getByTestId('dashboard-page')).toHaveCount(0);

    await page.goto('/dashboard');
    await expect(page.getByTestId('dashboard-connection-status')).toHaveText('数据库已连接');
    await expect(page.getByTestId('dashboard-empty')).toBeVisible();
    await expect(page.getByTestId('dashboard-recent-activity-empty')).toBeVisible();
    expect(wasmRequests).toHaveLength(1);
    await expect(page.getByTestId('dashboard-metric-card')).toHaveCount(3);
    await expect(page.locator('[data-testid="dashboard-metric-card"][data-metric="categories"]')).toHaveAttribute(
      'href',
      '/entities/assets/AssetCategory'
    );
    await expect(page.getByTestId('dashboard-quick-actions')).toContainText('快捷操作');

    await page.getByTestId('dashboard-quick-actions').getByRole('link', { name: '搜索记录', exact: true }).click();
    await page.waitForURL('**/search');
    await expect(page.getByTestId('search-input')).toBeVisible();
  });

  test('桌面菜单、页签、面包屑和命令面板共用 Dashboard 路由', async ({ page }) => {
    await page.goto('/entities/assets/AssetCategory');
    await createCategory(page, '页面扩展保留分类');
    await page.getByTestId('dashboard-nav-link').click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole('heading', { name: '资产工作台概览', exact: true })).toBeVisible();
    await expect(page).toHaveTitle('Dashboard · 工作台');
    const breadcrumb = page.getByTestId('admin-breadcrumb');
    await expect(breadcrumb).toContainText('概览');
    await expect(breadcrumb.locator('[aria-current="page"]')).toHaveText('Dashboard');
    const tabs = page.getByTestId('admin-tabbar');
    const dashboardTab = tabs.getByRole('link', { name: 'Dashboard', exact: true });
    await expect(dashboardTab).toHaveAttribute('aria-current', 'page');

    await page.getByTestId('dashboard-quick-actions').getByRole('link', { name: '管理资产', exact: true }).click();
    await expect(page).toHaveURL(/\/entities\/assets\/Asset$/);
    await expect(page.getByRole('button', { name: '+ 新增', exact: true })).toBeVisible();
    await dashboardTab.click();
    await expect(page.getByTestId('dashboard-total')).toContainText('记录总数：1');
    await page.getByTestId('dashboard-quick-actions').getByRole('link', { name: '备份 / 恢复', exact: true }).click();
    await expect(page).toHaveURL(/\/backup$/);
    await expect(page.getByTestId('backup-start')).toBeVisible();

    await page.keyboard.press('ControlOrMeta+k');
    await page.getByTestId('admin-palette-input').fill('Dashboard');
    await page.getByTestId('admin-palette-option').filter({ hasText: 'Dashboard' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByTestId('admin-palette')).toBeHidden();
    await expect(dashboardTab).toHaveAttribute('aria-current', 'page');
    await expect(breadcrumb.locator('[aria-current="page"]')).toHaveText('Dashboard');
    await tabs.getByRole('link', { name: '资产分类', exact: true }).click();
    await expectListHasRows(page, { name: '页面扩展保留分类' });
  });

  test('移动菜单进入 Dashboard 自动收起，深链刷新后仍可进入实体和备份页', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/backup');
    const toggle = page.getByTestId('admin-menu-toggle');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await page.getByTestId('dashboard-nav-link').click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByTestId('dashboard-empty')).toBeVisible();
    await page.reload();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByTestId('dashboard-connection-status')).toHaveText('数据库已连接');
    await expect(
      page.getByTestId('admin-tabbar').getByRole('link', { name: 'Dashboard', exact: true })
    ).toHaveAttribute('aria-current', 'page');
    await toggle.click();
    await page.getByTestId('admin-menu').getByRole('link', { name: '资产分类' }).click();
    await expect(page).toHaveURL(/\/entities\/assets\/AssetCategory$/);
    await expect(page.getByRole('button', { name: '+ 新增', exact: true })).toBeVisible();
    await toggle.click();
    await page.getByTestId('dashboard-nav-link').click();
    await page.getByTestId('dashboard-quick-actions').getByRole('link', { name: '备份 / 恢复', exact: true }).click();
    await expect(page.getByTestId('restore-input')).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  test('实体新增后 Dashboard 统计卡和总数自动更新', async ({ page }) => {
    await page.goto('/entities/assets/AssetCategory');
    await createCategory(page, 'Dashboard 分类');

    await page.goto('/dashboard');
    await expect(page.getByTestId('dashboard-connection-status')).toHaveText('数据库已连接');
    await expect(page.locator('[data-testid="dashboard-metric-card"][data-metric="categories"]')).toContainText('1');
    await expect(page.getByTestId('dashboard-total')).toContainText('记录总数：1');
    await expect(page.getByTestId('dashboard-empty')).toHaveCount(0);
    await expect(page.getByTestId('dashboard-recent-activity')).toContainText('最近活动');
    await expect(page.getByTestId('dashboard-activity-item')).toHaveCount(1);
    await expect(page.getByTestId('dashboard-activity-item').first()).toContainText('创建资产分类');
  });

  test('最近活动按增删改时间倒序展示五条，刷新后保留', async ({ page }) => {
    await page.goto('/entities/assets/AssetCategory');
    for (let index = 1; index <= 4; index += 1) {
      await createCategory(page, `Dashboard 活动 ${index}`);
    }

    const edit = await expectActionIcon(page, 'view-action');
    await page.mouse.click(edit.x, edit.y);
    await expect(page.getByRole('group', { name: '分类名' }).getByRole('textbox')).toHaveValue(/Dashboard 活动/);
    await fillField(page, '分类名', 'Dashboard 活动更新');
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await expect(page.getByRole('tab', { name: '基本信息' })).toHaveCount(0);
    const remove = await expectActionIcon(page, 'delete-action');
    await page.mouse.click(remove.x, remove.y);
    await page.getByTestId('delete-confirm-submit').click();
    await expect(page.getByTestId('delete-confirm-submit')).toHaveCount(0);

    await page.getByTestId('dashboard-nav-link').click();
    const items = page.getByTestId('dashboard-activity-item');
    await expect(items).toHaveCount(5);
    await expect(items.nth(0)).toContainText('删除资产分类');
    await expect(items.nth(1)).toContainText('更新资产分类');
    await expect(items.nth(2)).toContainText('创建资产分类');
    const timestamps = await items
      .locator('time')
      .evaluateAll(elements => elements.map(element => element.getAttribute('datetime')));
    await page.reload();
    await expect(items).toHaveCount(5);
    await expect(items.nth(0)).toHaveAttribute('data-activity-type', 'DELETE');
    await expect(items.nth(1)).toHaveAttribute('data-activity-type', 'UPDATE');
    expect(
      await items.locator('time').evaluateAll(elements => elements.map(element => element.getAttribute('datetime')))
    ).toEqual(timestamps);
  });

  test('语言切换同时更新活动、实体和时间，窄屏没有横向溢出', async ({ page }) => {
    await page.goto('/entities/assets/AssetCategory');
    await createCategory(page, '活动本地化');
    await page.getByTestId('dashboard-nav-link').click();
    const item = page.getByTestId('dashboard-activity-item');
    await expect(item).toContainText('创建资产分类');
    await page.getByTestId('admin-widget-language').click();
    await page.getByRole('menuitemradio', { name: 'English', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByTestId('dashboard-recent-activity')).toContainText('Recent activity');
    await expect(item).toContainText('Created Asset categories');
    await expect(item).not.toContainText('entity.assets');
    await expect(item).not.toContainText('资产分类');
    await expect(item.locator('time')).toHaveAttribute('datetime', /^\d{4}-/);
    const formatted = await item
      .locator('time')
      .evaluate(element =>
        new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(
          new Date((element as HTMLTimeElement).dateTime)
        )
      );
    await expect(item.locator('time')).toHaveText(formatted);
    await page.setViewportSize({ width: 375, height: 812 });
    await expect(item).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  });
});
