import { expect, Page, test } from '@playwright/test';
import { callSearchApi, gotoSearchPage } from './search-test-api.js';

async function warmSearch(page: Page, query: string) {
  const input = page.getByTestId('search-input');
  const state = page.getByTestId('search-state');

  await input.press('Escape');
  await expect(state).toHaveText('idle');
  await input.fill(query);
  await expect(state).toHaveText('success', { timeout: 15000 });
  await expect(page.getByTestId('search-result').first()).toBeVisible({ timeout: 15000 });
}

test.describe('Search Refresh', () => {
  // P2-3：本 describe 只有一条用例，`mode: 'serial'` 在这里**不起任何作用**
  // （serial 约束的是同一 describe 内多条用例的执行顺序与失败传播）。
  // 留着它会让读者以为这里有跨用例的状态依赖，从而不敢拆分或并行化。

  test.beforeEach(async ({ page }) => {
    await gotoSearchPage(page, { waitForApi: true, waitForSeed: true });
    await callSearchApi(page, 'reset');
  });

  // Functional gate only. First-render timing budget lives in benchmarks/* —
  // hardcoding p90 < 1000ms here is a known flaky source under parallel nxBail runs.
  test('reacts to insert/update/delete and keeps query', async ({ page }) => {
    const input = page.getByTestId('search-input');
    const state = page.getByTestId('search-state');
    const resultsCount = page.getByTestId('search-results-count');

    // Warm FTS path so subsequent reactive refresh assertions are not cold-start noise.
    await warmSearch(page, 'fts5');

    const query = `refresh-angular-${Date.now().toString(36)}`;
    await input.fill(query);
    await expect(state).toHaveText('empty', { timeout: 15000 });
    await expect(resultsCount).toContainText('无结果');

    const created = await callSearchApi(page, 'createArticle', {
      title: `${query} title`,
      body: `${query} body`,
      tags: [query],
      category: 'tech',
      authorId: 'playwright',
      viewCount: 1
    });

    const createdResult = page.locator(`[data-testid="search-result"][data-id="${created.id}"]`);
    await expect(createdResult).toBeVisible({ timeout: 15000 });
    await expect(state).toHaveText('success');
    await expect(resultsCount).toContainText('条结果');
    await expect(input).toHaveValue(query);

    await callSearchApi(page, 'updateArticle', created.id, {
      title: `${query} updated title`,
      body: `${query} updated body`,
      tags: [query, 'updated']
    });
    await expect(createdResult).toContainText('updated title', { timeout: 15000 });
    await expect(input).toHaveValue(query);

    await callSearchApi(page, 'removeArticle', created.id);
    await expect(createdResult).toHaveCount(0, { timeout: 15000 });
    await expect(state).toHaveText('empty', { timeout: 15000 });
    await expect(resultsCount).toContainText('无结果');
    await expect(input).toHaveValue(query);

    await input.fill('fts5');
    await expect(state).toHaveText('success', { timeout: 15000 });
    await page.getByTestId('search-simulate-error').focus();
    await page.keyboard.press('Enter');
    await expect(state).toHaveText('error');
    await expect(resultsCount).toContainText('搜索失败');

    await page.getByTestId('search-retry').focus();
    await page.keyboard.press('Enter');
    await expect(state).toHaveText('success', { timeout: 15000 });
    await expect(resultsCount).toContainText('条结果');
  });
});
