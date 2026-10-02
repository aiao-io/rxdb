import type { Browser, Page, TestInfo } from '@playwright/test';
import { archiveFailure, type DemoDbSnapshot, expect, type FailureArchiveSummary, test } from './fixtures.js';
import { commit, openHistory, openPanel, waitForAutoEnabled, writeTodo } from './working-tree-utils.js';

/**
 * @fileoverview e2e 失败现场归档的导入（US-909 阶段 B，AC#7）：归档在另一个浏览器上下文经 `/failure-archive`
 * 导入后，打开的是同名的库，业务表与工作树（HEAD、未提交改动）与摘要一致，且能在其上继续丢弃、恢复历史版本。
 *
 * @remarks
 * 导入要换一个**新的**浏览器上下文：归档恢复到原库名，原上下文里那个库就是源库本身，不是空目标。
 */

const IMPORT_TIMEOUT = 60_000;

const snapshot = (page: Page): Promise<DemoDbSnapshot> =>
  page.evaluate(async () => {
    const api = window.__rxdbFailureArchive;
    if (!api) throw new Error('window.__rxdbFailureArchive is not installed');
    return api.snapshot();
  });

const archiveBody = (testInfo: TestInfo): Buffer => {
  const [archive] = testInfo.attachments.filter(attachment => attachment.name === 'rxdb-failure-archive');
  if (!archive?.body) throw new Error('archive attachment has no body');
  return archive.body;
};

// 测试体里不能有分支（playwright/no-conditional-in-test），摘要字段的收窄放进 helper
const requireDbName = (summary: FailureArchiveSummary): string => {
  if (summary.dbName === null) throw new Error('summary has no dbName');
  return summary.dbName;
};

const headCommitIdOf = (summary: FailureArchiveSummary): string | null => {
  if (!summary.workingTree?.enabled) throw new Error('summary has no enabled working tree');
  return summary.workingTree.headCommitId;
};

const newImportPage = async (browser: Browser, testInfo: TestInfo): Promise<Page> => {
  const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
  return context.newPage();
};

/** 打开导入页并选中归档，等 manifest 读完。 */
const chooseArchive = async (page: Page, archive: Buffer): Promise<void> => {
  await page.goto('/failure-archive', { waitUntil: 'domcontentloaded' });
  const view = page.getByTestId('failure-archive-page');
  await expect(view).toHaveAttribute('data-phase', 'idle', { timeout: 20000 });
  await page.getByLabel('选择归档文件').setInputFiles({
    name: 'rxdb-failure-archive.bin',
    mimeType: 'application/octet-stream',
    buffer: archive
  });
  await expect(view).toHaveAttribute('data-phase', 'parsed', { timeout: 10000 });
};

/** 在工作树页丢弃全部未提交改动（入口在更改列表的右键菜单里，带确认框）。 */
const discardAll = async (page: Page): Promise<void> => {
  await page.getByTestId('wt-refresh-status').click();
  await expect(page.getByTestId('wt-diff-phase')).toHaveText('success', { timeout: 30000 });
  await page.getByTestId('wt-diff-item').first().click({ button: 'right' });
  page.once('dialog', dialog => void dialog.accept());
  await page.getByTestId('wt-discard').click();
  await expect(page.getByTestId('wt-status-clean')).toHaveText('干净', { timeout: 30000 });
};

/** 源库：两次提交，再留一条未提交改动；归档并取回摘要。 */
const archiveSource = async (page: Page, testInfo: TestInfo): Promise<FailureArchiveSummary> => {
  await openPanel(page);
  await waitForAutoEnabled(page);
  await writeTodo(page, '导入 A');
  await commit(page, 'c1: 导入 A');
  await writeTodo(page, '导入 B');
  await commit(page, 'c2: 导入 B');
  await writeTodo(page, '导入 C');
  const summary = await archiveFailure(page, testInfo);
  expect(summary.outcome).toBe('archived');
  expect(summary.workingTree).toMatchObject({ enabled: true, clean: false, entryCount: 1 });
  return summary;
};

test.describe('e2e 失败现场归档的导入', () => {
  test('导入后打开同名库，内容与工作树一致，可继续恢复；重复导入报目标非空（AC#7）', async ({
    page,
    browser
  }, testInfo) => {
    test.setTimeout(240_000);
    const summary = await archiveSource(page, testInfo);
    const archive = archiveBody(testInfo);
    const dbName = requireDbName(summary);

    // ── 1. 新上下文导入：显示的库名就是源库名 ──────────────
    const importer = await newImportPage(browser, testInfo);
    await chooseArchive(importer, archive);
    await expect(importer.getByTestId('failure-archive-db-name')).toHaveText(dbName);
    await importer.getByRole('button', { name: '导入并打开' }).click();
    await expect(importer.getByTestId('imported-db-name')).toHaveText(dbName, { timeout: IMPORT_TIMEOUT });

    // ── 2. 打开的库与摘要一致 ──────────────
    const imported = await snapshot(importer);
    expect(imported.tables).toEqual(summary.tables);
    expect(imported.workingTree).toEqual(summary.workingTree);

    // ── 3. 在导入的库上继续：丢弃未提交改动，恢复 c1 ──────────────
    await importer.goto('/working-tree', { waitUntil: 'domcontentloaded' });
    await expect(importer.getByTestId('working-tree-page')).toBeVisible({ timeout: 20000 });
    await expect(importer.getByTestId('wt-status-clean')).toHaveText('有未提交改动', { timeout: 30000 });
    await discardAll(importer);
    await openHistory(importer);
    await importer.getByTestId('wt-commit-item').filter({ hasText: 'c1: 导入 A' }).click({ button: 'right' });
    await importer.getByTestId('wt-restore').click();
    await expect(importer.getByTestId('wt-status-restore')).toHaveText('恢复中', { timeout: 10000 });
    await expect(importer.getByTestId('wt-status-clean')).toHaveText('有未提交改动', { timeout: 30000 });

    // ── 4. 回到默认库，再导入同一归档：目标非空，可直接打开 ──────────────
    await importer.getByRole('button', { name: '回到默认库' }).click();
    await expect(importer.getByTestId('imported-db-banner')).toHaveCount(0, { timeout: 20000 });
    // 关掉唯一的页面让 SharedWorker 随之结束：它还连着导入的库时，恢复拿不到独占锁，报的是 `target_busy`
    const context = importer.context();
    await importer.close();
    const again = await context.newPage();
    await chooseArchive(again, archive);
    await again.getByRole('button', { name: '导入并打开' }).click();
    const view = again.getByTestId('failure-archive-page');
    await expect(view).toHaveAttribute('data-phase', 'error', { timeout: IMPORT_TIMEOUT });
    await expect(again.getByRole('alert')).toContainText('target_not_empty');
    await again.getByRole('button', { name: '打开该库' }).click();
    await expect(again.getByTestId('imported-db-name')).toHaveText(dbName, { timeout: 20000 });
    // 打开的是上一步留下恢复会话的那个库，不是又一份新导入
    expect((await snapshot(again)).workingTree).toMatchObject({
      enabled: true,
      headCommitId: headCommitIdOf(summary),
      clean: false
    });
    await context.close();
  });
});
