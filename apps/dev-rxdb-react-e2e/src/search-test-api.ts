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

/** {@link gotoSearchPage} 的额外就绪条件。 */
export interface SearchPageReadyOptions {
  /**
   * 等待种子数据真正落库。
   *
   * 判据是 `search-seed-count` 从"加载中…"变成"文章 N" —— **这是页面上唯一真实的种子信号**。
   */
  readonly waitForSeed?: boolean;
  /** 等待 `window.__searchDemoApi` 挂载（需要 {@link callSearchApi} 的用例）。 */
  readonly waitForApi?: boolean;
}

/**
 * 打开 /search 并等到指定的就绪程度。
 *
 * @remarks
 * P1-7：这段就绪逻辑原先在四个 spec 里各写一份，**且条件互不相同**：
 *
 * | 文件 | 就绪条件 |
 * | --- | --- |
 * | `search.spec.ts` | 只等 page + searchbox |
 * | `search-parity` / `search-refresh` | 再加 `header p` 含 `articles` + 等 API |
 * | `search.a11y` | 再加 `search-seed-count` 含 `文章` |
 *
 * **顺带查出一件比重复更严重的事**：那句 `header p` 含 `articles` 等的是
 * `"Seeded articles and comments from the current RxDB only."` ——
 * **一句写死在初始渲染里的静态文案**。它看着像"等种子数据就位"，实际**什么都没等**。
 * 真正的种子信号是 `search-seed-count`（从"加载中…"变成"文章 N"）。
 *
 * 所以这里不是简单地把三份合成一份，而是把差异变成**显式声明的参数**：
 * 谁需要种子、谁需要测试 API，写在调用点上，而不是靠各自抄漏。
 */
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
