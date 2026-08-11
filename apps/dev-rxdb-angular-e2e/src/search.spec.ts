import { expect, test, type Locator, type Page } from '@playwright/test';
import { callSearchApi, gotoSearchPage } from './search-test-api.js';

/**
 * 按 Tab（或 Shift+Tab）直到目标获得焦点。
 *
 * @remarks
 * P2-5：原实现命中即**静默 return**，只有循环耗尽才走 `expect(target).toBeFocused()`。
 * 而全部三个调用点传的 `maxSteps` 都是 **1** —— 也就是说它退化成了
 * "按一次 Tab，命中就当没事、没命中才断言"，**成功路径上一条断言都没有**。
 *
 * 焦点顺序正是这条用例要验证的东西，所以改成**无论如何都断言** ——
 * 命中即返回会让"恰好按一次就中"和"按了 1 次没中但只有 1 步"变得无法区分。
 */
async function pressTabUntilFocused(page: Page, target: Locator, maxSteps: number, reverse = false) {
  for (let step = 0; step < maxSteps; step += 1) {
    await page.keyboard.press(reverse ? 'Shift+Tab' : 'Tab');
    if (await target.evaluate(element => element === document.activeElement)) {
      break;
    }
  }

  await expect(target).toBeFocused();
}

test.describe('Search Page', () => {
  // P2-3：本 describe 只有一条用例，`mode: 'serial'` 在这里**不起任何作用**
  // （serial 约束的是同一 describe 内多条用例的执行顺序与失败传播）。
  // 留着它会让读者以为这里有跨用例的状态依赖，从而不敢拆分或并行化。

  test.beforeEach(async ({ page }) => {
    await gotoSearchPage(page, { waitForApi: true });
    await callSearchApi(page, 'reset');
  });

  test('supports a11y announcements and keyboard search flow', async ({ page }) => {
    const query = `search-keyboard-${Date.now().toString(36)}`;

    await callSearchApi(page, 'createArticle', {
      title: `${query} title`,
      body: `${query} body`,
      tags: [query],
      category: 'tech',
      authorId: 'playwright',
      viewCount: 1
    });

    const input = page.getByTestId('search-input');
    const clearButton = page.getByTestId('search-clear');
    const resultsCount = page.getByTestId('search-results-count');
    const state = page.getByTestId('search-state');

    await expect(resultsCount).toContainText('输入关键词开始搜索');
    await expect(input).toHaveAttribute('aria-busy', 'false');

    await input.focus();
    await input.fill(query);
    await expect(state).toHaveText('success', { timeout: 15000 });
    await expect(input).toHaveAttribute('aria-busy', 'false');
    await expect(resultsCount).toContainText('条结果');
    await expect(page.getByTestId('search-result').first()).toBeVisible();

    await input.press('Escape');
    await expect(input).toHaveValue('');
    await expect(state).toHaveText('idle');
    await expect(resultsCount).toContainText('输入关键词开始搜索');

    await input.focus();
    await input.fill(query);
    await expect(state).toHaveText('success', { timeout: 15000 });

    const simulateError = page.getByTestId('search-simulate-error');
    await pressTabUntilFocused(page, clearButton, 1);
    await pressTabUntilFocused(page, simulateError, 1);
    await pressTabUntilFocused(page, clearButton, 1, true);
    await page.keyboard.press('Enter');
    await expect(input).toHaveValue('');
    await expect(state).toHaveText('idle');

    await input.fill(query);
    await expect(state).toHaveText('success', { timeout: 15000 });

    await simulateError.focus();
    await page.keyboard.press('Enter');
    await expect(state).toHaveText('error');
    await expect(resultsCount).toContainText('搜索失败');

    const retry = page.getByTestId('search-retry');
    await retry.focus();
    await page.keyboard.press('Enter');
    await expect(state).toHaveText('success', { timeout: 15000 });
    await expect(resultsCount).toContainText('条结果');
  });
});
