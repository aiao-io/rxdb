import type { SearchDemoTestApi } from '@aiao/rxdb-test';
import { expect, type Page } from '@playwright/test';

type SearchDemoMethod = keyof SearchDemoTestApi;
type SearchDemoResult<Method extends SearchDemoMethod> = Awaited<ReturnType<SearchDemoTestApi[Method]>>;
type SearchDemoWindow = Window & { __searchDemoTestApi?: SearchDemoTestApi };

export async function waitForSearchApi(page: Page): Promise<void> {
  await page.waitForFunction(() => Boolean((window as SearchDemoWindow).__searchDemoTestApi));
}

export async function callSearchApi<Method extends SearchDemoMethod>(
  page: Page,
  method: Method,
  ...args: Parameters<SearchDemoTestApi[Method]>
): Promise<SearchDemoResult<Method>> {
  return page.evaluate(
    ({ selectedMethod, selectedArgs }) => {
      const api = (window as SearchDemoWindow).__searchDemoTestApi!;
      return Reflect.apply(api[selectedMethod], api, selectedArgs) as unknown;
    },
    { selectedMethod: method, selectedArgs: args }
  ) as Promise<SearchDemoResult<Method>>;
}

export interface SearchPageReadyOptions {
  readonly waitForSeed?: boolean;
  readonly waitForApi?: boolean;
}

export async function gotoSearchPage(page: Page, options: SearchPageReadyOptions = {}): Promise<void> {
  await page.goto('/search', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('search-page')).toBeVisible({ timeout: 20000 });
  await expect(page.getByRole('searchbox', { name: 'Global search' })).toBeVisible({ timeout: 10000 });
  if (options.waitForSeed === true) {
    await expect(page.getByTestId('search-seed-count')).toContainText('文章', { timeout: 20000 });
  }
  if (options.waitForApi === true) {
    await waitForSearchApi(page);
  }
}
