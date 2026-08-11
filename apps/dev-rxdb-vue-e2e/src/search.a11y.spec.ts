import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { gotoSearchPage } from './search-test-api.js';

test.describe('Search Page A11y', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    await gotoSearchPage(page, { waitForSeed: true });
    // 冷启动（每个 Playwright 上下文都是空库）时 onMounted 会 seed()，seeding 期间「重新写入」
    // 按钮处于 disabled（daisyUI 禁用态文字 = base-content/20% → 白底上合成为 #d1d1d1，对比度
    // 仅 1.52，触发 axe color-contrast）。等种子写入落定（计数出现）再扫描，避免扫到过渡态。
  });

  test('has no detectable axe violations in idle and success states', async ({ page }) => {
    const input = page.getByRole('searchbox', { name: 'Global search' });
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
