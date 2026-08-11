import { expect, test, type Page } from '@playwright/test';
import { callSearchApi, gotoSearchPage } from './search-test-api.js';

async function readUiResults(page: Page) {
  return page.getByTestId('search-result').evaluateAll(elements =>
    elements.slice(0, 10).map(element => {
      const htmlElement = element as HTMLElement;
      return {
        collection: htmlElement.dataset['collection'] ?? '',
        id: htmlElement.dataset['id'] ?? '',
        rank: Number(Number.parseFloat(htmlElement.dataset['rank'] ?? '0').toFixed(4))
      };
    })
  );
}

test.describe('Search Parity', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    await gotoSearchPage(page, { waitForApi: true, waitForSeed: true });
    await callSearchApi(page, 'reset');
  });

  test('keeps UI state semantics and first-page ordering aligned with runtime search', async ({ page }) => {
    const input = page.getByRole('searchbox', { name: 'Global search' });
    const state = page.getByTestId('search-state');
    const resultsCount = page.getByTestId('search-results-count');
    const resultsRegion = page.getByTestId('search-results');

    await expect(resultsRegion).toHaveAttribute('aria-live', 'polite');
    await expect(resultsCount).toHaveAttribute('role', 'status');
    await expect(resultsCount).toContainText('Enter a query');
    await expect(state).toHaveText('idle');
    await expect(input).toHaveAttribute('aria-busy', 'false');

    await input.fill('fts5');
    await expect(state).toHaveText('success', { timeout: 15000 });
    await expect(resultsCount).toContainText('results');

    const expected = await callSearchApi(page, 'runSearch', 'fts5', 20);
    const actual = await readUiResults(page);

    expect(expected.state).toBe('success');
    await expect(page.getByTestId('search-result')).toHaveCount(expected.results.length);
    expect(actual).toEqual(expected.results.slice(0, actual.length));

    await input.press('Escape');
    await expect(input).toHaveValue('');
    await expect(state).toHaveText('idle');
    await expect(resultsCount).toContainText('Enter a query');

    await input.fill('fts5');
    await expect(state).toHaveText('success', { timeout: 15000 });

    await page.getByTestId('search-simulate-error').focus();
    await page.keyboard.press('Enter');
    await expect(state).toHaveText('error');
    await expect(resultsCount).toContainText('Search failed');

    await page.getByTestId('search-retry').focus();
    await page.keyboard.press('Enter');
    await expect(state).toHaveText('success', { timeout: 15000 });
    await expect(resultsCount).toContainText('results');

    await input.fill('definitely-not-in-corpus');
    await expect(state).toHaveText('empty', { timeout: 15000 });
    await expect(resultsCount).toContainText('0 results');
  });
});
