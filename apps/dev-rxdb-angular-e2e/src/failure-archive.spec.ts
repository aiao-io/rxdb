import type { Page, TestInfo } from '@playwright/test';
import { resetE2eState } from './e2e-utils.js';
import { archiveFailure, type DemoDbSnapshot, expect, type FailureArchiveSummary, test } from './fixtures.js';

/**
 * @fileoverview e2e 失败现场归档（US-909 阶段 B）的行为用例：AC#4 / AC#5 / AC#8 / AC#9。
 *
 * @remarks
 * 这里**直接调用** `archiveFailure()`——用例本身是通过的，auto fixture 不会再归档一次；附件全部挂在本用例上，
 * 所以「全量 e2e 零归档附件」（AC#6）的统计要排除这份 spec。
 *
 * 导入后的往返（归档能被 `restore()` 读回）在 `failure-archive-import.spec.ts`。
 */

const E2E_DB_NAME_STORAGE_KEY = '__aiao_e2e_db_name__';
// Todo 页写的是 US-028 的可排序 `Task`（表 `tasks`），不是共享 `Todo`
const TODO_PAGE_TABLE = 'public$tasks';
// 归档开头：8 字节魔数，再是 manifest 帧（1 字节类型 + 4 字节大端长度 + JSON）。只读 manifest，完整校验由导入时的
// `restore()` 负责
const ARCHIVE_MAGIC_LENGTH = 8;
const FRAME_MANIFEST = 0x01;

const addTodo = async (page: Page, title: string): Promise<void> => {
  await page.getByTestId('todo-title-input').fill(title);
  await page.getByTestId('todo-add').click();
  await expect(page.getByTestId('todo-row').filter({ hasText: title })).toBeVisible({ timeout: 15000 });
};

const openTodo = async (page: Page): Promise<void> => {
  await resetE2eState(page);
  await page.goto('/todo', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('todo-title-input')).toBeVisible({ timeout: 20000 });
};

const snapshot = (page: Page): Promise<DemoDbSnapshot> =>
  page.evaluate(async () => {
    const api = window.__rxdbFailureArchive;
    if (!api) throw new Error('window.__rxdbFailureArchive is not installed');
    return api.snapshot();
  });

const attachmentsNamed = (testInfo: TestInfo, name: string) =>
  testInfo.attachments.filter(attachment => attachment.name === name);

// 测试体里不能有分支（playwright/no-conditional-in-test），取附件正文放进 helper
const bodyOf = (attachment: TestInfo['attachments'][number] | undefined): Buffer => {
  if (!attachment?.body) throw new Error('archive attachment has no body');
  return attachment.body;
};

const readManifestAuthDomain = (archive: Buffer): string => {
  expect(archive[ARCHIVE_MAGIC_LENGTH]).toBe(FRAME_MANIFEST);
  const length = archive.readUInt32BE(ARCHIVE_MAGIC_LENGTH + 1);
  const start = ARCHIVE_MAGIC_LENGTH + 5;
  const manifest = JSON.parse(archive.subarray(start, start + length).toString('utf8')) as {
    encryption: { authDomain: string } | null;
  };
  if (!manifest.encryption) throw new Error('archive manifest has no encryption');
  return manifest.encryption.authDomain;
};

const expectNotArchived = (summary: FailureArchiveSummary, stage: string, code: string): void => {
  expect(summary).toMatchObject({ outcome: 'not_archived', reason: { stage, code } });
  expect(summary.archive).toBeUndefined();
};

test.describe('e2e 失败现场归档', () => {
  test('导出不改库，附件与摘要相符，库名可还原（AC#4 / AC#9）', async ({ page }, testInfo) => {
    await openTodo(page);
    await addTodo(page, '归档 A');
    await addTodo(page, '归档 B');

    const before = await snapshot(page);
    const summary = await archiveFailure(page, testInfo);
    const after = await snapshot(page);

    expect(after).toEqual(before);
    expect(before.tables[TODO_PAGE_TABLE]).toBe(2);
    expect(summary).toMatchObject({
      format: 'aiao-rxdb-e2e-failure-summary',
      version: 1,
      testStatus: 'passed',
      page: 'original',
      outcome: 'archived',
      tables: before.tables,
      workingTree: before.workingTree
    });
    expect(summary.reason).toBeUndefined();

    const [archive] = attachmentsNamed(testInfo, 'rxdb-failure-archive');
    const [summaryAttachment] = attachmentsNamed(testInfo, 'rxdb-failure-summary');
    expect(archive?.contentType).toBe('application/octet-stream');
    expect(summaryAttachment?.contentType).toBe('application/json');
    expect(JSON.parse(String(summaryAttachment?.body))).toEqual(summary);
    const body = bodyOf(archive);
    expect(body.byteLength).toBe(summary.archive?.bytes);

    const dbName = await page.evaluate(key => window.localStorage.getItem(key), E2E_DB_NAME_STORAGE_KEY);
    expect(summary.dbName).toBe(dbName);
    const authDomain = readManifestAuthDomain(body);
    expect(authDomain.slice(0, authDomain.lastIndexOf('@'))).toBe(dbName);
  });

  test('主页面已关闭时重开页面导出同一个库（AC#5）', async ({ page }, testInfo) => {
    await openTodo(page);
    await addTodo(page, '关闭前');
    const dbName = await page.evaluate(key => window.localStorage.getItem(key), E2E_DB_NAME_STORAGE_KEY);
    await page.close();

    const summary = await archiveFailure(page, testInfo);

    expect(summary).toMatchObject({ page: 'reopened', outcome: 'archived', dbName });
    expect(summary.tables?.[TODO_PAGE_TABLE]).toBe(1);
  });

  // chrome://crash 只在 Chromium 上可用；本 e2e 只配了 chromium 项目，加别的浏览器时这条要按项目过滤
  test('主页面崩溃时重开页面导出同一个库（AC#5）', async ({ page }, testInfo) => {
    await openTodo(page);
    await addTodo(page, '崩溃前');
    const dbName = await page.evaluate(key => window.localStorage.getItem(key), E2E_DB_NAME_STORAGE_KEY);
    const crashed = new Promise<void>(resolve => page.once('crash', () => resolve()));
    await page.goto('chrome://crash').catch(() => undefined);
    await crashed;

    const summary = await archiveFailure(page, testInfo, { crashed: true });

    expect(summary).toMatchObject({ page: 'reopened', outcome: 'archived', dbName });
    expect(summary.tables?.[TODO_PAGE_TABLE]).toBe(1);
  });

  test('上下文已关闭时不导出，只记原因（AC#5）', async ({ browser }, testInfo) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await context.close();

    const summary = await archiveFailure(page, testInfo);

    expect(summary).toMatchObject({ page: 'unavailable', dbName: null });
    expectNotArchived(summary, 'page', 'context_unavailable');
    expect(attachmentsNamed(testInfo, 'rxdb-failure-archive')).toHaveLength(0);
    expect(attachmentsNamed(testInfo, 'rxdb-failure-summary')).toHaveLength(1);
  });

  test('各级预算超限只记原因，第二实例随后释放（AC#8）', async ({ page }, testInfo) => {
    await openTodo(page);
    await addTodo(page, '预算前');

    expectNotArchived(await archiveFailure(page, testInfo, { nodeGuardMs: 1 }), 'transfer', 'timeout');
    expectNotArchived(await archiveFailure(page, testInfo, { deadlineMs: 1 }), 'connect', 'timeout');
    expectNotArchived(await archiveFailure(page, testInfo, { maxBytes: 1 }), 'backup', 'io_error');
    expect(attachmentsNamed(testInfo, 'rxdb-failure-archive')).toHaveLength(0);
    expect(attachmentsNamed(testInfo, 'rxdb-failure-summary')).toHaveLength(3);

    // `snapshot()` 排在之前每次归档的第二实例销毁之后；主实例此后仍能写入
    await addTodo(page, '预算后');
    expect((await snapshot(page)).tables[TODO_PAGE_TABLE]).toBe(2);
  });
});
