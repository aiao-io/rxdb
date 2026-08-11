import { expect, test } from '@playwright/test';
import { gotoSearchPage } from './search-test-api.js';

test.describe('Search Page', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    await gotoSearchPage(page);
  });

  test('supports a11y announcements and keyboard search flow', async ({ page }) => {
    const input = page.getByRole('searchbox', { name: 'Global search' });
    const clearButton = page.getByTestId('search-clear');
    const resultsCount = page.getByTestId('search-results-count');
    const state = page.getByTestId('search-state');

    await expect(resultsCount).toContainText('Enter a query');
    await expect(input).toHaveAttribute('aria-busy', 'false');

    await input.focus();
    await input.fill('fts5');
    await expect(state).toHaveText('success', { timeout: 15000 });
    await expect(input).toHaveAttribute('aria-busy', 'false');
    await expect(resultsCount).toContainText('results');
    await expect(page.getByTestId('search-result')).not.toHaveCount(0);

    await input.press('Escape');
    await expect(input).toHaveValue('');
    await expect(state).toHaveText('idle');
    await expect(resultsCount).toContainText('Enter a query');

    await input.focus();
    await input.fill('fts5');
    await expect(state).toHaveText('success', { timeout: 15000 });

    const simulateError = page.getByTestId('search-simulate-error');
    await clearButton.focus();
    await page.keyboard.press('Enter');
    await expect(input).toHaveValue('');
    await expect(state).toHaveText('idle');

    await input.fill('fts5');
    await expect(state).toHaveText('success', { timeout: 15000 });

    await simulateError.focus();
    await page.keyboard.press('Enter');
    await expect(state).toHaveText('error');
    await expect(resultsCount).toContainText('Search failed');

    const retry = page.getByTestId('search-retry');
    await retry.focus();
    await page.keyboard.press('Enter');
    await expect(state).toHaveText('success', { timeout: 15000 });
    await expect(resultsCount).toContainText('results');
  });
});
