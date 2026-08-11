import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { callSearchApi, gotoSearchPage } from './search-test-api.js';

test.describe('Search Page A11y', () => {
  // P2-3：本 describe 只有一条用例，`mode: 'serial'` 在这里**不起任何作用**
  // （serial 约束的是同一 describe 内多条用例的执行顺序与失败传播）。
  // 留着它会让读者以为这里有跨用例的状态依赖，从而不敢拆分或并行化。

  test.beforeEach(async ({ page }) => {
    await gotoSearchPage(page, { waitForApi: true, waitForSeed: true });
    await callSearchApi(page, 'reset');
  });

  test('has no detectable axe violations in idle and success states', async ({ page }) => {
    const input = page.getByTestId('search-input');
    const state = page.getByTestId('search-state');
    const resultsRegion = page.getByTestId('search-results');
    const resultsCount = page.getByTestId('search-results-count');

    await expect(resultsRegion).toHaveAttribute('aria-live', 'polite');
    await expect(resultsCount).toHaveAttribute('role', 'status');

    const idleResults = await new AxeBuilder({ page }).include('[data-testid="search-page"]').analyze();
    expect(idleResults.violations).toEqual([]);

    await input.fill('fts5');
    await expect(state).toHaveText('success', { timeout: 15000 });

    const successResults = await new AxeBuilder({ page }).include('[data-testid="search-page"]').analyze();
    expect(successResults.violations).toEqual([]);
  });
});
