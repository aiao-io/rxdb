/**
 * AC#10 / AC#11：跨源下的条件请求。
 *
 * @remarks
 * 这两条是**一对反例**，跑在同一个后端上，只差一个响应头：
 *
 * | `Access-Control-Expose-Headers: ETag` | 客户端读到的 `ETag` | 第二次请求 | 结果 |
 * | :------------------------------------ | :------------------ | :--------- | :--- |
 * | 不发（AC#10）                          | `null`              | 不带 `If-None-Match` | 永远 `200` |
 * | 发（AC#11，demo 默认）                 | 真值                | 带 `If-None-Match`   | `304` |
 *
 * demo 默认开着暴露头，所以 AC#10 需要显式关掉才能复现。
 */

import { expect, test, type Page, type Request } from '@playwright/test';

import { API_BASE_URL } from './env';
import {
  expectRowCount,
  logEntriesFor,
  openDemo,
  readServerLog,
  resetDemo,
  SEED_ROW_COUNT,
  setExposeEtag
} from './support';

/** 收集浏览器发出的每一次 `fetchMetadata` 请求头。 */
const recordMetadataHeaders = (page: Page): Array<Record<string, string>> => {
  const captured: Array<Record<string, string>> = [];
  const isMetadata = (request: Request): boolean =>
    request.method() === 'POST' && request.url() === `${API_BASE_URL}/recipes/metadata`;
  page.on('request', request => {
    if (isMetadata(request)) captured.push(request.headers());
  });
  return captured;
};

test.beforeEach(async ({ request }) => {
  await resetDemo(request);
});

/*
 * 名字里的「已知症状」是刻意的：这不是待修的 bug。
 *
 * `HttpTransport.#cacheAndReturn` 读 `response.headers.get('etag')`，跨源响应没有
 * 暴露该头时读出 `null`，于是它 `cache.delete(key)` 把这条缓存丢掉——下一次请求
 * 自然无从带上 `If-None-Match`。整条链路上没有任何一处判断出错：客户端拿到的
 * 就是「这个响应没有 ETag」，而它对没有 ETag 的响应本就不做条件请求。
 *
 * 修法在**后端**（补一个响应头），不在 `packages/rxdb-adapter-http/`。
 *
 * 本用例守的是**未配置诊断回调时的默认行为**（US-215 AC#3）：适配器一声不吭。
 * US-215 加的 `onEtagUnreadable` 是**可选**的，装上之后才有信号——那一半由下一条
 * 用例守。两条合起来才是完整的判据：默认沉默 ≠ 永远沉默，而配了就一定听得见。
 */
test('AC#10 已知症状（非待修 bug）：未暴露 ETag 且未配诊断回调时，条件请求全程不命中，且不报错、无日志', async ({
  page,
  request
}) => {
  await setExposeEtag(request, false);

  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', error => pageErrors.push(error.message));

  const metadataHeaders = recordMetadataHeaders(page);

  await openDemo(page);
  await expectRowCount(page, SEED_ROW_COUNT);
  const firstCount = metadataHeaders.length;
  expect(firstCount, '首次加载至少发一次 fetchMetadata').toBeGreaterThan(0);

  await page.getByTestId('refetch').click();
  await expect.poll(() => metadataHeaders.length, { timeout: 30_000 }).toBeGreaterThan(firstCount);
  await expectRowCount(page, SEED_ROW_COUNT);

  // 症状一：没有任何一次请求带上 If-None-Match——包括重复的那次。
  for (const headers of metadataHeaders) {
    expect(headers['if-none-match'], 'ETag 读不到时不该出现条件请求头').toBeUndefined();
  }

  // 症状二：服务端全程 200，一次 304 都没有。
  const metadataLog = logEntriesFor(await readServerLog(request), 'POST', '/recipes/metadata');
  expect(metadataLog.length).toBeGreaterThan(1);
  expect(metadataLog.every(entry => entry.status === 200)).toBe(true);
  expect(metadataLog.some(entry => entry.notModified)).toBe(false);

  // 症状三：静默。不报错、不进错误横幅、控制台一行都没有。
  await expect(page.getByTestId('query-error')).toHaveCount(0);
  await expect(page.getByTestId('offline-banner')).toHaveCount(0);
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);

  // 症状四：面板上明说这是默认行为，而不是「什么都没发生」。
  await expect(page.getByTestId('etag-diagnostic-off')).toHaveCount(1);
});

/**
 * US-215 AC#8：同一个症状，配上诊断回调之后就有信号。
 *
 * @remarks
 * 与上一条用例**只差一个 `?diagnostics=1`**：后端设置、查询动作、症状全都一样，
 * 唯一的变量是 demo 有没有把 `onEtagUnreadable` 传给适配器。这正是这个故事要证的东西——
 * 静默不是「客户端看不出来」，而是「客户端知道，只是此前没有嘴」。
 *
 * 顺带钉死 `Response.type`：浏览器里跨源响应是 `'cors'`。适配器把它原样透出而不作判定，
 * 因为 Node（undici）下手工构造的 `Response` 恒为 `'default'`——单元测试证的是后者，
 * 真实浏览器里的取值只有 e2e 能证。
 */
test('AC#8（US-215）配上诊断回调后，同一个静默症状变成一条指名道姓的可观测信号', async ({ page, request }) => {
  await setExposeEtag(request, false);

  await openDemo(page, 'diagnostics=1');
  await expectRowCount(page, SEED_ROW_COUNT);

  const rows = page.getByTestId('etag-diagnostic-rows').locator('li[data-operation]');
  await expect(rows).not.toHaveCount(0, { timeout: 30_000 });

  const first = rows.first();
  await expect(first).toContainText('Recipe');
  // 文案两种成因都点到、且不选边：客户端分不清「远端没发」与「跨源没暴露」。
  await expect(first).toContainText('Access-Control-Expose-Headers');
  await expect(first).toContainText('两种可能');
  // 浏览器里的跨源响应就是 'cors'。
  await expect(first).toContainText('Response.type=cors');

  // 去重：翻 5 页 + 分块 findByIds 都读不到 ETag，但同一指纹只报一次，
  // 面板上不会堆出几十条同义警告。
  const count = await rows.count();
  await page.getByTestId('refetch').click();
  await expectRowCount(page, SEED_ROW_COUNT);
  expect(await rows.count(), '同一个查询重复触发时不该再报一次').toBe(count);
});

test('AC#11 暴露 ETag 后第二次查询回 304，客户端沿用上一份结果而非空集', async ({ page, request }) => {
  const metadataHeaders = recordMetadataHeaders(page);

  await openDemo(page);
  await expectRowCount(page, SEED_ROW_COUNT);
  const firstCount = metadataHeaders.length;

  await page.getByTestId('refetch').click();
  await expect.poll(() => metadataHeaders.length, { timeout: 30_000 }).toBeGreaterThan(firstCount);

  await expect
    .poll(
      async () =>
        logEntriesFor(await readServerLog(request), 'POST', '/recipes/metadata').filter(e => e.notModified).length,
      {
        timeout: 30_000
      }
    )
    .toBeGreaterThan(0);

  // 第二轮的请求带上了 If-None-Match。
  expect(metadataHeaders.slice(firstCount).some(headers => headers['if-none-match'] !== undefined)).toBe(true);

  // 304 没有 body。客户端必须拿出上一次的结果，而不是把空 body 当成「查到 0 行」。
  await expectRowCount(page, SEED_ROW_COUNT);
  await expect(page.getByTestId('empty')).toHaveCount(0);

  // 流量面板如实记下这一次 304。
  await expect(page.getByTestId('traffic-rows').locator('tr[data-status="304"]')).not.toHaveCount(0);

  // 内容一变，ETag 必变——因为它就是响应体的哈希。于是同样的条件请求重新回 200。
  const beforeCreate = logEntriesFor(await readServerLog(request), 'POST', '/recipes/metadata').length;
  const created = await request.post(`${API_BASE_URL}/recipes`, {
    data: { title: 'etag-invalidator', status: 'published', price: 1, tag: 'new' }
  });
  expect(created.status()).toBe(201);

  await page.getByTestId('refetch').click();
  await expectRowCount(page, SEED_ROW_COUNT + 1);

  /*
   * 断言的是「这一轮里**有**一次 200」，不是「最后一次是 200」。
   *
   * 变化只落在最后一页上：新行的 `updatedAt` 是服务端当前时刻，排序又是 `updatedAt asc`，
   * 所以前 5 页逐字节没动、老老实实回 304，只有承载新行的那一页 ETag 变了、回 200。
   *
   * 而这一轮结束之后还会紧跟一轮**全 304** 的复核：本地行缓存被这一轮的写入改动了，
   * 实体配的 `syncStaleTime: 0` 又要求每次读都回远端校验，于是重新查一遍——查完发现
   * 什么都没变，不再写本地，也就不再触发下一轮，自己收敛。日志的最后一条因此必然是
   * 304，而这是对的：从上一轮结束到现在，内容确实没有再变过。
   */
  const round = logEntriesFor(await readServerLog(request), 'POST', '/recipes/metadata').slice(beforeCreate);
  expect(round.length, '重新查询必须真的发出请求').toBeGreaterThan(0);
  expect(
    round.some(entry => entry.status === 200 && !entry.notModified),
    '内容变了，承载这次变化的那一页就不该再回 304'
  ).toBe(true);
});
