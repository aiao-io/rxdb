import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { openPreferences, preferencesStorageKey, resetE2eState, settleAnimations } from './e2e-utils.js';

/**
 * 后台外壳 a11y 走查（axe）：弹层（偏好抽屉各页签、命令面板、锁屏）与主题 / 布局 / 移动端变体。
 * 页面内容的走查见 workbench.a11y.spec.ts；这里只管外壳自己的 DOM，发现的违规就地修组件。
 */

/** 在首次文档加载前写入偏好，直接以指定偏好启动（不经抽屉）。 */
async function seedPreferences(page: Page, values: Record<string, unknown>): Promise<void> {
  await page.addInitScript(([key, value]) => window.localStorage.setItem(key, value), [
    preferencesStorageKey(),
    JSON.stringify({ version: 1, values })
  ] as const);
}

/** 扫描 `selector` 范围内的 axe 违规；先等外壳出现、动画结束，避免入场动画途中的假对比度违规。 */
async function scan(page: Page, selector: string): Promise<unknown[]> {
  await expect(page.getByTestId('admin-shell')).toBeVisible();
  await settleAnimations(page);
  const results = await new AxeBuilder({ page }).include(selector).analyze();
  return results.violations;
}

test.describe('后台外壳 a11y 走查', () => {
  test.beforeEach(async ({ page }) => {
    await resetE2eState(page);
  });

  test('偏好抽屉：五个页签 axe 零违规', async ({ page }) => {
    await page.goto('/search');
    const drawer = await openPreferences(page);
    for (const tab of ['appearance', 'layout', 'shortcuts', 'general', 'extension']) {
      await drawer.getByTestId(`pref-tab-${tab}`).click();
      expect(await scan(page, '[data-testid="admin-preferences"]'), `偏好抽屉 / ${tab}`).toEqual([]);
    }
  });

  test('命令面板：打开并有结果时 axe 零违规', async ({ page }) => {
    await page.goto('/search');
    await page.keyboard.press('ControlOrMeta+K');
    await expect(page.getByTestId('admin-palette-option').first()).toBeVisible();
    expect(await scan(page, '[data-testid="admin-palette"]'), '命令面板').toEqual([]);
  });

  test('锁屏：设置密码界面与解锁界面 axe 零违规', async ({ page }) => {
    await page.goto('/search');
    await page.getByTestId('admin-widget-lock').click();
    await expect(page.getByTestId('admin-lock')).toBeVisible();
    expect(await scan(page, '[data-testid="admin-lock"]'), '锁屏 / 设置密码').toEqual([]);

    await page.getByTestId('admin-lock-input').fill('s3cret-pass');
    await page.getByTestId('admin-lock-submit').click();
    await page.getByTestId('admin-widget-lock').click();
    await expect(page.getByTestId('admin-lock-forgot')).toBeVisible();
    expect(await scan(page, '[data-testid="admin-lock"]'), '锁屏 / 解锁').toEqual([]);
  });

  for (const theme of ['light', 'dark', 'dracula', 'corporate']) {
    test(`主题 ${theme}：外壳 axe 零违规`, async ({ page }) => {
      await seedPreferences(page, { theme: { name: theme } });
      await page.goto('/search');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      expect(await scan(page, '#layout-main'), `主题 ${theme}`).toEqual([]);
    });
  }

  for (const layout of ['sidebar-nav', 'header-sidebar-nav', 'header-nav', 'full-content']) {
    test(`布局 ${layout}：外壳 axe 零违规`, async ({ page }) => {
      await seedPreferences(page, { app: { layout } });
      await page.goto('/entities/assets/AssetCategory');
      await expect(page.getByTestId('entity-shell')).toBeVisible();
      expect(await scan(page, '#layout-main'), `布局 ${layout}`).toEqual([]);
    });
  }

  test('侧栏折叠为图标轨：axe 零违规', async ({ page }) => {
    await seedPreferences(page, { sidebar: { collapsed: true } });
    await page.goto('/search');
    await expect(page.getByTestId('admin-sidebar')).toHaveAttribute('data-collapsed', 'true');
    expect(await scan(page, '#layout-main'), '图标轨').toEqual([]);
  });

  test('开启水印、页脚、多页签：axe 零违规', async ({ page }) => {
    await seedPreferences(page, { app: { watermark: true, watermarkContent: '内部资料' }, footer: { enable: true } });
    await page.goto('/search');
    await page.getByTestId('backup-nav-link').click();
    await expect(page.getByTestId('admin-tab')).toHaveCount(2);
    expect(await scan(page, '#layout-main'), '水印 / 页脚 / 页签').toEqual([]);
  });

  test('移动端：抽屉关闭与打开两种状态 axe 零违规', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/search');
    expect(await scan(page, '#layout-main'), '移动端 / 抽屉关闭').toEqual([]);
    await page.getByTestId('admin-menu-toggle').click();
    await expect(page.getByTestId('admin-menu-toggle')).toHaveAttribute('aria-expanded', 'true');
    expect(await scan(page, '#layout-main'), '移动端 / 抽屉打开').toEqual([]);
  });
});
