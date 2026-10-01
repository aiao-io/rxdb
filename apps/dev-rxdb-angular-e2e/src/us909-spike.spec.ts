// US-909 阶段 B spike：临时文件，spike 结束即删。
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resetE2eState } from './e2e-utils.js';

const ARCHIVE = 'test-output/us909-spike/archive.json';
type Spike = Record<string, (...args: unknown[]) => Promise<unknown>>;
const call = (page: Page, method: string, ...args: unknown[]) =>
  page.evaluate(
    ({ m, a }) => (window as unknown as { __us909Spike: Spike }).__us909Spike[m](...a),
    { m: method, a: args }
  ) as Promise<Record<string, unknown>>;

async function addTodo(page: Page, title: string) {
  await page.getByTestId('todo-title-input').fill(title);
  await page.getByTestId('todo-add').click();
  await expect(page.getByTestId('todo-row').filter({ hasText: title }).first()).toBeVisible({ timeout: 15000 });
}

test.describe.configure({ mode: 'serial' });

test('spike 1: second main-thread idb connection backs up without touching the db', async ({ page }) => {
  page.on('console', m => m.type() === 'error' && console.log('[page error]', m.text()));
  await resetE2eState(page);
  await page.goto('/todo');
  await expect(page.getByTestId('todo-title-input')).toBeVisible({ timeout: 15000 });
  await page.waitForFunction(() => Boolean((window as unknown as { __us909Spike?: unknown }).__us909Spike));
  for (const t of ['spike-a', 'spike-b', 'spike-c']) await addTodo(page, t);
  await expect.poll(async () => (await call(page, 'status'))['entryCount'], { timeout: 15000 }).toBeGreaterThan(0);

  const before = await call(page, 'probePrimary');
  const statusBefore = await call(page, 'status');
  const backup = await call(page, 'backup');
  const after = await call(page, 'probePrimary');
  console.log('backup', { ...backup, base64: `<${String(backup['base64']).length} chars>` });
  console.log('statusBefore', statusBefore);
  console.log('dataVersion', before['dataVersion'], after['dataVersion'], 'schemaVersion', before['schemaVersion'], after['schemaVersion']);
  expect(backup['ok'], String(backup['error'])).toBe(true);
  expect(Object.keys(before['rows'] as object).length).toBeGreaterThan(10);
  expect(before['dataVersion']).toBeDefined();
  expect(backup['secondaryRows']).toEqual(before['rows']);
  expect(backup['status']).toEqual(statusBefore);
  expect(after['schemaSql']).toBe(before['schemaSql']);
  expect(after['rows']).toEqual(before['rows']);
  expect(after['schemaVersion']).toBe(before['schemaVersion']);
  expect(after['dataVersion']).toBe(before['dataVersion']);

  // 主应用在第二实例销毁后仍可写
  await addTodo(page, 'spike-after-backup');

  // 主应用并发写入期间备份不挂死
  const concurrent = call(page, 'backup');
  for (const t of ['spike-d', 'spike-e']) await addTodo(page, t);
  const second = await concurrent;
  expect(second['ok'], String(second['error'])).toBe(true);

  const final = await call(page, 'backup');
  expect(final['ok'], String(final['error'])).toBe(true);
  const dbName = await page.evaluate(() => window.localStorage.getItem('__aiao_e2e_db_name__'));
  const rows = (await call(page, 'probePrimary'))['rows'];
  const status = await call(page, 'status');
  mkdirSync('test-output/us909-spike', { recursive: true });
  writeFileSync(ARCHIVE, JSON.stringify({ dbName, base64: final['base64'], rows, status }));
});

test('spike 2: restored db opens in the app through idb + shared worker', async ({ page }) => {
  page.on('console', m => m.type() === 'error' && console.log('[page error]', m.text()));
  const archive = JSON.parse(readFileSync(ARCHIVE, 'utf8')) as {
    dbName: string;
    base64: string;
    rows: Record<string, number>;
    status: Record<string, unknown>;
  };
  await resetE2eState(page);
  await page.goto('/todo');
  await expect(page.getByTestId('todo-title-input')).toBeVisible({ timeout: 15000 });
  await page.waitForFunction(() => Boolean((window as unknown as { __us909Spike?: unknown }).__us909Spike));
  const ownName = await page.evaluate(() => window.localStorage.getItem('__aiao_e2e_db_name__'));
  expect(ownName).not.toBe(archive.dbName);

  const restored = await call(page, 'restore', archive.base64, archive.dbName);
  console.log('restore', restored);
  expect(restored['ok'], String(restored['error'])).toBe(true);

  await page.evaluate(name => window.localStorage.setItem('__aiao_e2e_db_name__', name), archive.dbName);
  await page.reload();
  await expect(page.getByTestId('todo-title-input')).toBeVisible({ timeout: 15000 });
  for (const t of ['spike-a', 'spike-e', 'spike-after-backup']) {
    await expect(page.getByTestId('todo-row').filter({ hasText: t }).first()).toBeVisible({ timeout: 15000 });
  }
  await page.waitForFunction(() => Boolean((window as unknown as { __us909Spike?: unknown }).__us909Spike));
  const rows = (await call(page, 'probePrimary'))['rows'];
  const status = await call(page, 'status');
  console.log('status restored', status, 'archived', archive.status);
  expect(rows).toEqual(archive.rows);
  expect(status['entryCount']).toBe(archive.status['entryCount']);
  expect(status['headRevision']).toBe(archive.status['headRevision']);
  // 恢复出的库在应用里可继续写
  await addTodo(page, 'spike-after-restore');
});
