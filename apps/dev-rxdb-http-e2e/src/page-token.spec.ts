/**
 * AC#15：形态 B（`nextPageToken`）翻页。
 *
 * @remarks
 * `?pageMode=token` 这个查询串**没法**写进 `createRestHandlers()` 的模板——
 * `UNSAFE_IN_SEGMENT` 在构造期就把 `?` 挡掉了。所以前端切形态走的是后端的
 * `__control/page-mode`（服务端默认值），curl 与 e2e 则两条路都能用。
 *
 * 「250 行读回来还是 250 个互不相同的 id」是结果侧的整体断言：少一个就是漏页，
 * 多一个就是重复，而 token 翻页出错时恰恰是这两种表现。
 *
 * 但它**只**证明结果对，证明不了路径对——同一句断言在 offset 形态下照样绿。
 * 所以还得看网线：请求体里必须真的出现带 `pageToken` 的后续页，否则这 250 行
 * 是从别的路子读回来的，而这条用例的名字里写着 token。
 */

import { expect, test } from '@playwright/test';

import { expectRowCount, openDemo, readRowIds, resetDemo, SEED_ROW_COUNT, setPageMode, showAllRows } from './support';

test.beforeEach(async ({ request }) => {
  await resetDemo(request);
});

test('AC#15 token 翻页把 250 行完整读回，没有重复也没有遗漏', async ({ page, request }) => {
  await setPageMode(request, 'token');

  // 网线上的证据。「250 个互不相同的 id」这条整体断言在 offset 形态下**同样成立**——
  // 单看它，这条用例换成 `pageMode: 'offset'` 也是绿的，也就是说它证明不了客户端
  // 真的走了 token 链。所以这里把 `fetchMetadata` 的请求体收下来，
  // 断言其中确实有带着 `pageToken` 回来的那几页。
  const metadataBodies: Record<string, unknown>[] = [];
  page.on('request', sent => {
    if (sent.method() !== 'POST' || !sent.url().includes('/recipes/metadata')) return;
    const body = sent.postData();
    if (body !== null) metadataBodies.push(JSON.parse(body) as Record<string, unknown>);
  });

  await openDemo(page);
  await expect(page.getByTestId('page-mode')).toHaveText('token');
  await expectRowCount(page, SEED_ROW_COUNT);

  // 250 行 / `PAGE_SIZE`（demo-config.ts 的 50）= 5 页：首页不带 token，后 4 页各带一个。
  // 断言「至少一个」而不是精确的 4：重跑会让整趟翻页再来一遍，页数是累加的。
  expect(metadataBodies.length, 'fetchMetadata 一次都没打出去').toBeGreaterThan(0);
  expect(metadataBodies[0]['pageToken'], '首页不该带 pageToken').toBeUndefined();
  const tokenPages = metadataBodies.filter(body => typeof body['pageToken'] === 'string');
  expect(tokenPages.length, '客户端没有跟着 nextPageToken 往下翻——这 250 行是别的路子读回来的').toBeGreaterThan(0);
  // 形态 B 下 `offset` 仍在请求体里（`rest.ts` 一律带上），但必须**永远停在 0**：
  // token 已经是游标了，再把 offset 一起推进就是两套游标叠加，每页都会多跳一整页。
  expect(tokenPages.every(body => body['offset'] === 0)).toBe(true);

  // 列表默认每页 50 行。这里断言的是**整份**结果集，得先把页长切到「全部」——
  // 注意这与后端的翻页形态无关：token 翻的是 `fetchMetadata` 的页，
  // 页长切的是本地读出来铺几行，两者各翻各的。
  await showAllRows(page);

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
