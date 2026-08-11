import { expect, Page, test } from '@playwright/test';
import { callSearchApi, gotoSearchPage } from './search-test-api.js';

async function readUiResults(page: Page) {
  return page.getByTestId('search-result').evaluateAll(elements =>
    elements.slice(0, 10).map(element => {
      const htmlElement = element as HTMLElement;
      // 兜底会把"DOM 契约变了"伪装成一条 `{ collection: '', id: '', rank: 0 }` 的正常数据，
      // parity 比对照样跑完。缺任何一个 data-* 都是测试前提被破坏，直接失败。
      const { collection, id, rank } = htmlElement.dataset;
      if (collection === undefined || id === undefined || rank === undefined) {
        throw new Error(`search-result 缺少 data-* 属性：${htmlElement.outerHTML.slice(0, 200)}`);
      }
      return { collection, id, rank: Number(Number.parseFloat(rank).toFixed(4)) };
    })
  );
}

test.describe('Search Parity', () => {
  // P2-3：本 describe 只有一条用例，`mode: 'serial'` 在这里**不起任何作用**
  // （serial 约束的是同一 describe 内多条用例的执行顺序与失败传播）。
  // 留着它会让读者以为这里有跨用例的状态依赖，从而不敢拆分或并行化。

  test.beforeEach(async ({ page }) => {
    await gotoSearchPage(page, { waitForApi: true, waitForSeed: true });
    await callSearchApi(page, 'reset');
  });

  test('keeps UI state semantics and first-page ordering aligned with runtime search', async ({ page }) => {
    const input = page.getByTestId('search-input');
    const state = page.getByTestId('search-state');
    const resultsCount = page.getByTestId('search-results-count');
    const resultsRegion = page.getByTestId('search-results');

    await expect(resultsRegion).toHaveAttribute('aria-live', 'polite');
    await expect(resultsCount).toHaveAttribute('role', 'status');
    await expect(resultsCount).toContainText('输入关键词开始搜索');
    await expect(state).toHaveText('idle');
    await expect(input).toHaveAttribute('aria-busy', 'false');

    await input.fill('fts5');
    await expect(state).toHaveText('success', { timeout: 15000 });
    await expect(resultsCount).toContainText('条结果');

    const expected = await callSearchApi(page, 'runSearch', 'fts5', 20);
    const actual = await readUiResults(page);

    expect(expected.state).toBe('success');
    await expect(page.getByTestId('search-result')).toHaveCount(expected.results.length);
    expect(actual).toEqual(expected.results.slice(0, actual.length));

    await input.press('Escape');
    await expect(input).toHaveValue('');
    await expect(state).toHaveText('idle');
    await expect(resultsCount).toContainText('输入关键词开始搜索');

    await input.fill('fts5');
    await expect(state).toHaveText('success', { timeout: 15000 });

    const simulateError = page.getByTestId('search-simulate-error');
    await simulateError.focus();
    await page.keyboard.press('Enter');
    await expect(state).toHaveText('error');
    await expect(resultsCount).toContainText('搜索失败');

    const retry = page.getByTestId('search-retry');
    await retry.focus();
    await page.keyboard.press('Enter');
    await expect(state).toHaveText('success', { timeout: 15000 });
    await expect(resultsCount).toContainText('条结果');

    await input.fill('definitely-not-in-corpus');
    await expect(state).toHaveText('empty', { timeout: 15000 });
    await expect(resultsCount).toContainText('无结果');
  });
});
