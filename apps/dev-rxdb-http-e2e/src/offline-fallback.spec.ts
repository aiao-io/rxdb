/**
 * AC#13：离线降级，以及它的对照实验。
 *
 * @remarks
 * 「连不上」与「远端说不行」不是一回事，这一条要证明的就是客户端分得清：
 *
 * | 现象               | 后端做法          | 客户端        | 页面 |
 * | :----------------- | :---------------- | :------------ | :--- |
 * | 传输失败           | `socket.destroy()` | `NetworkOfflineError` → `offlineFallback` | 进离线态，**仍有数据** |
 * | 远端拒绝（`409`）  | 正常回一个 409     | 照常上抛      | 报错，**不降级** |
 *
 * 把后者也吞掉会让真实故障看起来像离线——那正是这条对照实验要挡住的假绿。
 */

import { expect, test } from '@playwright/test';

import { expectRowCount, openDemo, resetDemo, SEED_ROW_COUNT, setFault, setOffline } from './support';

test.beforeEach(async ({ request }) => {
  await resetDemo(request);
});

test('AC#13 后端不可达时降级到 wa-sqlite 行缓存，页面进离线态且仍能看到数据', async ({ page, request }) => {
  await openDemo(page);
  // 先把 250 行灌进本地行缓存——没有这一步，后面的降级无处可降。
  await expectRowCount(page, SEED_ROW_COUNT);

  await setOffline(request, true);
  await page.getByTestId('refetch').click();

  const banner = page.getByTestId('offline-banner');
  await expect(banner).toBeVisible({ timeout: 30_000 });
  await expect(banner).toContainText('wa-sqlite 本地行缓存');
  // 降级的意义在于「仍然看得见」，掉成空列表等于没降级。
  await expectRowCount(page, SEED_ROW_COUNT);
  await expect(page.getByTestId('empty')).toHaveCount(0);
  await expect(page.getByTestId('query-error')).toHaveCount(0);

  // 关掉开关就该恢复真取数，而不是一直靠缓存活着。
  await setOffline(request, false);
  await page.getByTestId('refetch').click();
  await expect(banner).toHaveCount(0, { timeout: 30_000 });
  await expectRowCount(page, SEED_ROW_COUNT);
});

test('AC#13 对照：后端回 409 时不降级，页面报错', async ({ page, request }) => {
  await openDemo(page);
  await expectRowCount(page, SEED_ROW_COUNT);

  await setFault(request, 409);
  await page.getByTestId('refetch').click();

  await expect(page.getByTestId('query-error')).toBeVisible({ timeout: 30_000 });
  // 409 是一个**成功送达**的响应。把它当离线处理才是 bug。
  await expect(page.getByTestId('offline-banner')).toHaveCount(0);

  await setFault(request, null);
  await page.getByTestId('refetch').click();
  await expect(page.getByTestId('query-error')).toHaveCount(0, { timeout: 30_000 });
  await expectRowCount(page, SEED_ROW_COUNT);
});
