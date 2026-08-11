import { expect, test } from '@playwright/test';
import { gotoSearchPage } from './search-test-api.js';

/**
 * 切换搜索范围时的 query 连续性。
 *
 * @remarks
 * `APP-dev-rxdb-react-p0-2` / `APP-dev-rxdb-vue-fresh-03`：四个 search e2e spec 里
 * **没有一处 scope 断言** —— 三个 demo 页面各自手写的「重建 handle 但保留当前 query」
 * 是页面最难的一段逻辑，却完全没有回归保护。把它迁到
 * `@aiao/rxdb-plugin-search-angular` 之前先补上，否则迁移的回归证据是空的。
 *
 * Angular demo 此前没有独立立项（它没有 `package.json`，所以「声明依赖却零 import」
 * 的 lint 信号在这一端根本不会亮），但页面缺陷与另两端逐字相同，按三框架对称一并处理。
 *
 * 断言两件事，缺一不可：
 * - 输入框仍是用户打的词（UI 层没被清空）；
 * - state 没有回到 `idle`（新 handle 是**以该词播种**的，不是空查询）。
 *
 * 只断输入框会漏掉「UI 留着词、handle 却按空查询重建」这种更隐蔽的形态。
 */
test.describe('Search Scope', () => {
  test('switching scope keeps the typed query and re-runs it in the new scope', async ({ page }) => {
    await gotoSearchPage(page, { waitForSeed: true });

    const input = page.getByRole('searchbox', { name: 'Global search' });
    const state = page.getByTestId('search-state');
    const scopeSummary = page.getByTestId('search-scope-summary');

    await input.fill('fts5');
    await expect(state).not.toHaveText('idle', { timeout: 15000 });

    await page.getByTestId('search-scope-mode-custom').click();
    await expect(page.getByTestId('search-scope-todos')).toBeVisible();
    await expect(page.getByTestId('search-reseed')).toBeVisible();
    await page.getByTestId('search-scope-comment').uncheck();
    await expect(scopeSummary).not.toContainText('评论');

    await expect(input).toHaveValue('fts5');
    await expect(state).not.toHaveText('idle', { timeout: 15000 });
  });
});
