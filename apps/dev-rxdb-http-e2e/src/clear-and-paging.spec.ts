/**
 * 演示台自己的两件功能：清空所有数据、用户翻页。
 *
 * @remarks
 * 这两条不对应 US-214 的任何一条 AC——它们是 demo 的操作台，不是协议的性质。
 * 但它们各自压着一个**只有在这套配置下才会现形**的东西，所以值得单独守：
 *
 * - **清空**：远端一行不剩、本地行缓存却是满的。此时 `HEAD :entity` 仍回 200
 *   （表还在，`__control/clear` 只删行），于是走的是孤儿清理那条路。
 *   删库重建（`__control/reset`）看不到这一幕，因为那会让表本身消失。
 * - **翻页**：`limit`/`offset` 只下推本地读。同步指纹里没有翻页参数，
 *   所以翻一页会把整个 `where` 重新同步一遍——页与页之间不该出现重复或遗漏的行。
 */

import { expect, test } from '@playwright/test';

import { API_BASE_URL } from './env';
import {
  clearBackendData,
  clearServerLog,
  DEFAULT_PAGE_SIZE,
  expectRowCount,
  expectRowIds,
  logEntriesFor,
  openDemo,
  readRowIds,
  readServerLog,
  resetDemo,
  SEED_ROW_COUNT,
  setPageSize,
  showAllRows
} from './support';

test.beforeEach(async ({ request }) => {
  await resetDemo(request);
});

test('清空所有数据后本地缓存被孤儿清理掏空，重置为种子能原样长回来', async ({ page, request }) => {
  await openDemo(page);
  await expectRowCount(page, SEED_ROW_COUNT);

  await page.getByTestId('clear-backend').click();

  await expectRowCount(page, 0);
  await expect(page.getByTestId('empty')).toHaveCount(1);
  await expect(page.locator('[data-row-id]')).toHaveCount(0);
  // 一行都没有时页码仍然成立：「第 1 / 0 页」不是个能显示的东西。
  await expect(page.getByTestId('page-info')).toContainText('第 1 / 1 页');

  /*
   * 关键的一条：清空之后远端仍**认得**这张表。
   *
   * 若 `__control/clear` 图省事去删库重建，`HEAD /recipes` 就会回 404，
   * 客户端走的是「实体在远端根本不存在」那条路——同样是空列表，但演示的东西完全变了。
   */
  const head = await request.head(`${API_BASE_URL}/recipes`);
  expect(head.status(), '清空只删行，表还留着——HEAD :entity 必须仍回 200').toBe(200);

  // 清空是幂等的：库里已经空了，再点一次删 0 行，不报错、页面也不抖。
  expect(await clearBackendData(request)).toBe(0);
  await expect(page.getByTestId('query-error')).toHaveCount(0);
  await expect(page.getByTestId('write-error')).toHaveCount(0);

  await page.getByTestId('reset-backend').click();
  await expectRowCount(page, SEED_ROW_COUNT);
  await expect(page.getByTestId('empty')).toHaveCount(0);
});

test('用户翻页：每页 50 行、页与页正好接上、到头即禁用、切「全部」能一页装下', async ({ page, request }) => {
  await openDemo(page);
  await expectRowCount(page, SEED_ROW_COUNT);

  // 首屏就是分页的：总数 250 仍是**整个筛选集合**的行数（它问的是本地 wa-sqlite，不是这一页），
  // 而铺出来的只有一页 50 行。
  await expect(page.getByTestId('page-info')).toContainText('第 1 / 5 页');
  await expect(page.getByTestId('page-info')).toContainText(`本页 ${DEFAULT_PAGE_SIZE} 行`);
  await expect(page.locator('[data-row-id]')).toHaveCount(DEFAULT_PAGE_SIZE);
  await expect(page.getByTestId('prev-page')).toBeDisabled();
  await expect(page.getByTestId('next-page')).toBeEnabled();

  /*
   * 先把整份结果集取下来当基准，下面每一页都拿它的切片**逐字**对。
   *
   * 比「第二页与第一页不相等」强得多：那种写法在翻页压根没生效时也可能因为
   * 断言跑在重查前面而读到上一页，看起来还挺像回事。切片对得上，才说明
   * `offset` 真的落到了本地读上，且页与页正好接上——既不重也不漏。
   */
  await showAllRows(page);
  const all = await readRowIds(page);
  expect(all).toHaveLength(SEED_ROW_COUNT);
  expect(new Set(all).size, '翻页不得让某些行被数两遍').toBe(SEED_ROW_COUNT);

  await setPageSize(page, DEFAULT_PAGE_SIZE);
  await expect(page.getByTestId('page-info')).toContainText('第 1 / 5 页');
  await expectRowIds(page, all.slice(0, DEFAULT_PAGE_SIZE));

  // 日志在翻页之前清一次：下面要断言的是「这一次翻页」发了什么，不是开页至今的全部流量。
  await clearServerLog(request);

  await page.getByTestId('next-page').click();
  await expect(page.getByTestId('page-info')).toContainText('第 2 / 5 页');
  await expect(page.getByTestId('prev-page')).toBeEnabled();
  await expectRowIds(page, all.slice(DEFAULT_PAGE_SIZE, DEFAULT_PAGE_SIZE * 2));

  /*
   * 翻页不改同步范围：指纹里没有 `limit`/`offset`，而实体配了 `syncStaleTime: 0`，
   * 于是这一页照样把整个 `where` 重新同步一遍——metadata 必然有；
   * 而行都还在本地缓存里且是新鲜的，一条 by-ids 都不该发。这正是分页的教学点。
   * metadata 只断存在性不断次数：次数取决于后端页长，那是另一件事。
   */
  const log = await readServerLog(request);
  expect(logEntriesFor(log, 'POST', '/recipes/metadata').length, '翻一页必须真的重新同步一次').toBeGreaterThan(0);
  expect(logEntriesFor(log, 'POST', '/recipes/by-ids'), '行都是新鲜的，不该再去拉一遍').toEqual([]);

  await page.getByTestId('prev-page').click();
  await expect(page.getByTestId('page-info')).toContainText('第 1 / 5 页');
  await expectRowIds(page, all.slice(0, DEFAULT_PAGE_SIZE));

  // 末页：250 / 50 整除，所以最后一页是满的，而「下一页」到头即禁用。
  for (let step = 0; step < 4; step += 1) await page.getByTestId('next-page').click();
  await expect(page.getByTestId('page-info')).toContainText('第 5 / 5 页');
  await expect(page.getByTestId('next-page')).toBeDisabled();
  await expectRowIds(page, all.slice(DEFAULT_PAGE_SIZE * 4));
});

test('新建一行之后自动跳到末页，新行就在眼前', async ({ page }) => {
  await openDemo(page);
  await expectRowCount(page, SEED_ROW_COUNT);
  await expect(page.getByTestId('page-info')).toContainText('第 1 / 5 页');

  await page.getByTestId('draft-title').fill('分页演示新行');
  await page.getByTestId('create').click();

  /*
   * 排序是 `updatedAt asc`，新行的 `updatedAt` 取服务端当前时刻——必然排在最末，
   * 也就必然落在最后一页。不跳页的话，用户看到的是「新建成功，但页面什么都没变」。
   */
  await expectRowCount(page, SEED_ROW_COUNT + 1);
  await expect(page.getByTestId('page-info')).toContainText('第 6 / 6 页');
  await expect(page.getByTestId('next-page')).toBeDisabled();
  await expect(page.locator('[data-row-id]')).toHaveCount(1);
  await expect(page.getByTestId('recipe-rows')).toContainText('分页演示新行');
});
