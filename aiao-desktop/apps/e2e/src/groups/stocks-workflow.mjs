import { expect as playwrightExpect } from 'playwright/test';

import { traced } from '../harness/host-calls.mjs';

const expect = playwrightExpect.configure({ timeout: 15_000 });

export const stocksWorkflow = {
  name: 'stocks-workflow',
  description: 'Stocks 本地搜索、空结果、选中详情与演示数据声明',
  keys: [
    'stocksWorkflow.initialWatchlist',
    'stocksWorkflow.searchesBySymbol',
    'stocksWorkflow.searchesByCompany',
    'stocksWorkflow.emptySearch',
    'stocksWorkflow.clearsSearch',
    'stocksWorkflow.detailFollowsSelection',
    'stocksWorkflow.declaresDemoData'
  ],
  async run(session) {
    const { helpers } = session;
    const result = traced('stocks-workflow');

    await session.openDesktop();
    await helpers.closeAll();
    await helpers.launch('Stocks');

    const window = helpers.win('stocks');
    await expect(window).toBeVisible();
    await expect(window).not.toHaveClass(/opening/);

    const search = window.getByRole('textbox', { name: 'Search stocks', exact: true });
    const rows = () => window.locator('.si');
    const title = window.locator('[data-stt]');
    const body = window.locator('[data-stbody]');

    await expect(rows()).toHaveCount(6);
    result.initialWatchlist = true;

    await search.fill('NVDA');
    await expect(rows()).toHaveCount(1);
    await expect(rows().first()).toContainText('NVDA');
    result.searchesBySymbol = true;

    await search.fill('Amazon');
    await expect(rows()).toHaveCount(1);
    await expect(rows().first()).toContainText('AMZN');
    result.searchesByCompany = true;

    await search.fill('does-not-exist');
    await expect(rows()).toHaveCount(0);
    await expect(window.locator('[data-stock-empty]')).toHaveText('No matching stocks');
    result.emptySearch = true;

    await search.fill('');
    await expect(rows()).toHaveCount(6);
    result.clearsSearch = true;

    await rows().filter({ hasText: 'AMZN' }).click();
    await expect(title).toHaveText('AMZN');
    await expect(body).toContainText('Amazon.com');
    result.detailFollowsSelection = true;

    await expect(window.locator('[data-demo]')).toHaveText('Demo data · No live market feed');
    await expect(body).toContainText('Open (demo)');
    result.declaresDemoData = true;

    await helpers.closeAll();
    return { stocksWorkflow: result };
  }
};
