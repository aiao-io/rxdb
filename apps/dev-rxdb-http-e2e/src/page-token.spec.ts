/**
 * AC#15：形态 B（`nextPageToken`）翻页。
 *
 * @remarks
 * `?pageMode=token` 这个查询串**没法**写进 `createRestHandlers()` 的模板——
 * `UNSAFE_IN_SEGMENT` 在构造期就把 `?` 挡掉了。所以前端切形态走的是后端的
 * `__control/page-mode`（服务端默认值），curl 与 e2e 则两条路都能用。
 *
 * 「250 行读回来还是 250 个互不相同的 id」是这条验收唯一有意义的整体断言：
 * 少一个就是漏页，多一个就是重复，而 token 翻页出错时恰恰是这两种表现。
 */

import { expect, test } from '@playwright/test';

import { expectRowCount, openDemo, readRowIds, resetDemo, SEED_ROW_COUNT, setPageMode } from './support';

test.beforeEach(async ({ request }) => {
  await resetDemo(request);
});

test('AC#15 token 翻页把 250 行完整读回，没有重复也没有遗漏', async ({ page, request }) => {
  await setPageMode(request, 'token');

  await openDemo(page);
  await expect(page.getByTestId('page-mode')).toHaveText('token');
  await expectRowCount(page, SEED_ROW_COUNT);

  const ids = await readRowIds(page);
  expect(ids).toHaveLength(SEED_ROW_COUNT);
  expect(new Set(ids).size, 'token 翻页不得产生重复行').toBe(SEED_ROW_COUNT);
  expect(ids.every(id => id !== '')).toBe(true);

  // 排序必须仍然是 (updatedAt, id) 升序——翻页形态换了，顺序不能跟着变。
  const timestamps = await page
    .locator('[data-row-id] td:nth-child(5)')
    .evaluateAll(cells => cells.map(cell => cell.textContent?.trim() ?? ''));
  expect(timestamps).toEqual([...timestamps].sort());

  await expect(page.getByTestId('query-error')).toHaveCount(0);
  await expect(page.getByTestId('offline-banner')).toHaveCount(0);
});
