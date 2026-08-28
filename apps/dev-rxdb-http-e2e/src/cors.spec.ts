/**
 * AC#9：跨源可用性。
 *
 * @remarks
 * 前端 `localhost:8316`、后端 `127.0.0.1:8317`——主机名与端口都不同，浏览器眼里
 * 是两个源，所有非简单请求都会先发 `OPTIONS` 预检。
 *
 * 预检**不出现在 `fetch` 的可观测面上**：浏览器自己发、自己收，脚本既看不到请求也
 * 看不到响应。因此这条验收只能从服务端断言，用的是 `__control/log`。
 */

import { expect, test } from '@playwright/test';

import { API_BASE_URL, APP_BASE_URL } from './env';
import { expectRowCount, logEntriesFor, openDemo, readServerLog, resetDemo, SEED_ROW_COUNT } from './support';

test.beforeEach(async ({ request }) => {
  await resetDemo(request);
});

test('AC#9 浏览器为 POST :entity/metadata 与 PATCH :entity/:id 发出 OPTIONS 预检', async ({ page, request }) => {
  await openDemo(page);
  await expectRowCount(page, SEED_ROW_COUNT);

  // 改一行触发 PATCH。PATCH 不是简单方法，浏览器必然先预检。
  await page.locator('[data-row-id]').first().getByRole('button', { name: '改' }).click();
  await page.getByTestId('draft-title').fill('预检触发器');
  await page.getByTestId('save-edit').click();
  await expect(page.getByTestId('write-error')).toHaveCount(0);

  await expect
    .poll(async () => logEntriesFor(await readServerLog(request), 'OPTIONS', '/recipes/metadata').length, {
      timeout: 30_000
    })
    .toBeGreaterThan(0);

  const log = await readServerLog(request);
  const patchPreflights = log.filter(entry => entry.method === 'OPTIONS' && /\/recipes\/[^/]+$/.test(entry.path));
  expect(patchPreflights.length, 'PATCH 之前应当有一次 OPTIONS 预检').toBeGreaterThan(0);

  // 预检一律 204：没有 body 的响应不该带 200 的语义。
  for (const entry of log.filter(item => item.method === 'OPTIONS')) {
    expect(entry.status, `预检 ${entry.path} 的状态码`).toBe(204);
  }
});

test('AC#9 Access-Control-Allow-Headers 覆盖 content-type / authorization / if-none-match', async ({ request }) => {
  const response = await request.fetch(`${API_BASE_URL}/recipes/metadata`, {
    method: 'OPTIONS',
    headers: {
      origin: APP_BASE_URL,
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'content-type, authorization, if-none-match'
    }
  });

  expect(response.status()).toBe(204);
  const allowed = (response.headers()['access-control-allow-headers'] ?? '').toLowerCase();
  // 三个都不在 CORS 安全列表里：少任何一个，对应端点在预检阶段就被浏览器挡下。
  expect(allowed).toContain('content-type');
  expect(allowed).toContain('authorization');
  expect(allowed).toContain('if-none-match');
  expect(response.headers()['access-control-allow-origin']).toBe(APP_BASE_URL);
});

test('AC#9 六个端点在跨源下全部可用（metadata / by-ids / create / update / delete）', async ({
  page,
  request
}) => {
  await openDemo(page);

  await expectRowCount(page, SEED_ROW_COUNT);

  await page.getByTestId('draft-title').fill('跨源新建');
  await page.getByTestId('draft-price').fill('12.5');
  await page.getByTestId('draft-tag').fill('new');
  await page.getByTestId('create').click();
  await expect(page.getByTestId('write-error')).toHaveCount(0);
  await expectRowCount(page, SEED_ROW_COUNT + 1);

  const created = page.locator('[data-row-id]').filter({ hasText: '跨源新建' });
  await expect(created).toHaveCount(1);
  await created.getByRole('button', { name: '改' }).click();
  /*
   * 填之前先等旧值到位。`draft-title` 绑的是单向的 `[ngModel]`，点「改」之后 Angular
   * 才把这一行的现值写进 input，而 `fill()` 是「全选 + 插入」两步——Angular 那次写入
   * 若落在两步之间，插入就从**替换**变成**追加**，存进去的是 `跨源新建跨源改名`。
   * 断言用 `toHaveText` 而不是 `hasText`：后者是子串匹配，上面那个拼接产物照样能通过。
   */
  await expect(page.getByTestId('draft-title'), '表单要先装上这一行的现值').toHaveValue('跨源新建');
  await page.getByTestId('draft-title').fill('跨源改名');
  await expect(page.getByTestId('draft-title'), '填完就该是新标题，追加上去的算失败').toHaveValue('跨源改名');
  await page.getByTestId('save-edit').click();
  const renamed = page.locator('[data-row-id]').filter({ has: page.locator('td', { hasText: /^跨源改名$/ }) });
  await expect(renamed).toHaveCount(1);

  await renamed.getByRole('button', { name: '删' }).click();
  await expectRowCount(page, SEED_ROW_COUNT);
  await expect(page.getByTestId('write-error')).toHaveCount(0);

  const log = await readServerLog(request);
  expect(logEntriesFor(log, 'POST', '/recipes/metadata').length, 'fetchMetadata + isTableExisted').toBeGreaterThan(0);
  expect(logEntriesFor(log, 'POST', '/recipes/by-ids').length, 'findByIds').toBeGreaterThan(0);
  expect(logEntriesFor(log, 'POST', '/recipes').length, 'create').toBeGreaterThan(0);
  expect(logEntriesFor(log, 'POST', '/recipes/delete').length, 'delete').toBeGreaterThan(0);
  expect(log.filter(entry => entry.method === 'PATCH').length, 'update').toBeGreaterThan(0);
  // 协议请求一条都不许是 4xx / 5xx——跨源没配好时最典型的表现就是这里出现 0 或 4xx。
  const protocolFailures = log.filter(
    entry => !entry.path.includes('/__control/') && entry.method !== 'OPTIONS' && entry.status >= 400
  );
  expect(protocolFailures, '跨源下不应有失败的协议请求').toEqual([]);
});
