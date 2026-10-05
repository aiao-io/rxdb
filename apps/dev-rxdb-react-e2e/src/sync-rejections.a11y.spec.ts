import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { resetE2eState } from './e2e-utils.js';

/**
 * @fileoverview 待办页被拒面板的空态与 a11y（US-218 AC#16，T064）。
 *
 * @remarks
 * 本 demo 不连远端，推送永远不会被拒：e2e 只验空态可见、a11y 无违规；
 * 有数据的两态由面板组件 spec 经 hub 渲染共享夹具覆盖（spec US5「批准的偏离」）。
 * 与 `apps/dev-rxdb-vue-e2e/src/sync-rejections.a11y.spec.ts` 逐条对齐。
 *
 * 扫描范围锁在面板上：页面其余部分的违规与本故事无关，混进来只会让这份用例因为别处的回归而红。
 */

const PANEL = '[data-testid="sync-rejections-panel"]';

test.describe('Sync Rejections Panel A11y', () => {
  test('待办页的被拒面板显示空态，axe 扫描无违规', async ({ page }) => {
    await resetE2eState(page);
    await page.goto('/todo', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('todo-page')).toBeVisible({ timeout: 20000 });

    const panel = page.locator(PANEL);
    await expect(panel.getByRole('heading', { name: '被拒的推送' })).toBeVisible();
    await expect(panel).toContainText('最近没有被远端拒绝的推送');
    await expect(panel.getByRole('listitem')).toHaveCount(0);

    const results = await new AxeBuilder({ page }).include(PANEL).analyze();
    expect(results.violations).toEqual([]);
  });
});
