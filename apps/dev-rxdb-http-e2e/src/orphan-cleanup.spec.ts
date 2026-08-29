/**
 * AC#14：远端删掉的行必须从本地行缓存里消失。
 *
 * @remarks
 * `SyncType.QueryCache` 下远端才是权威，本地 wa-sqlite 只是行缓存。
 * `fetchMetadata` 回来的 id 集合就是当前的真相——凡是缓存里有、这份集合里没有的，
 * 都是孤儿，由核心的 `deleteByIds` 清掉。
 *
 * 只断言「UI 上看不见了」是不够的：那也可能只是这一次查询的结果里没有它，
 * 缓存里那行仍在，下次离线降级时又会冒出来。所以这条用例在清理之后**掐断网络再刷新**，
 * 逼着页面只能从缓存读——那一行还在不在，此时才没有第二种解释。
 */

import { expect, test } from '@playwright/test';

import { API_BASE_URL } from './env';
import { expectRowCount, openDemo, readRowIds, resetDemo, SEED_ROW_COUNT, setOffline, showAllRows } from './support';

test.beforeEach(async ({ request }) => {
  await resetDemo(request);
});

test('AC#14 后端直接删掉的行，再查询后从本地缓存与页面上一并消失', async ({ page, request }) => {
  await openDemo(page);
  await expectRowCount(page, SEED_ROW_COUNT);

  // 列表默认每页 50 行；下面要断言的是整份 id 集合，先切「全部」。
  await showAllRows(page);

  const ids = await readRowIds(page);
  expect(ids).toHaveLength(SEED_ROW_COUNT);
  // 取第一行当靶子不只是图省事：排序是 `(updatedAt, id)` 升序，它必然落在第一页。
  // 于是最后那次 reload（页长跟着回到默认的 50）也照样能证明它没有从缓存里复活。
  const victim = ids[0];

  // 绕过前端，直接在后端删——模拟「别人改了数据」。
  const deleted = await request.post(`${API_BASE_URL}/recipes/delete`, { data: { ids: [victim] } });
  expect(deleted.status()).toBe(200);
  expect(await deleted.json()).toEqual({ deleted: 1 });

  await page.getByTestId('refetch').click();
  await expectRowCount(page, SEED_ROW_COUNT - 1);
  await expect(page.locator(`[data-row-id="${victim}"]`)).toHaveCount(0);

  // 掐网重来：这一次页面只能读缓存。那一行若还在缓存里，此刻必然重新出现。
  await setOffline(request, true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('offline-banner')).toBeVisible({ timeout: 30_000 });
  await expectRowCount(page, SEED_ROW_COUNT - 1);
  await expect(page.locator(`[data-row-id="${victim}"]`)).toHaveCount(0);
});
