import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createAsset,
  createCategory,
  expectActionIcon,
  expectFilteredCount,
  expectListEmpty,
  expectListHasRows,
  resetE2eState
} from './e2e-utils.js';

/**
 * US-527 备份恢复闭环：备份产出可下载归档；独立环境（全新 browser context =
 * 另一浏览器 profile）恢复后继续查询与编辑；损坏归档与已有数据的恢复失败
 * 给出可读原因、数据保留不变。工作台存储选主线程 IDBBatchAtomicVFS，
 * 正是 US-217 备份矩阵里浏览器可备份的组合。
 */

async function backupToFile(page: Page, dir: string): Promise<string> {
  await page.goto('/backup');
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('backup-start').click();
  const download = await downloadPromise;
  const file = join(dir, download.suggestedFilename());
  await download.saveAs(file);
  await expect(page.getByTestId('backup-result')).toContainText('备份成功');
  return file;
}

async function freshContextPage(browser: Browser): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await resetE2eState(page);
  return { context, page };
}

test.describe('工作台备份与恢复', () => {
  let dir: string;

  test.beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'rxdb-admin-backup-'));
  });

  test.afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test('AC#1 备份成功并下载归档', async ({ page }) => {
    await resetE2eState(page);
    await page.goto('/entities/assets/AssetCategory');
    await createCategory(page, '办公设备');
    await backupToFile(page, dir);
  });

  test('AC#3 独立环境恢复归档后可继续查询、编辑，刷新重开数据仍在', async ({ page, browser }) => {
    await resetE2eState(page);
    await page.goto('/entities/assets/AssetCategory');
    await createCategory(page, '办公设备');
    await page.goto('/entities/assets/Asset');
    await createAsset(page, '笔记本', '办公设备');
    const archive = await backupToFile(page, dir);

    const { context, page: fresh } = await freshContextPage(browser);
    try {
      await fresh.goto('/backup');
      await fresh.getByTestId('restore-input').setInputFiles(archive);
      await expect(fresh.getByTestId('restore-result')).toContainText('恢复成功');
      await fresh.getByRole('link', { name: /去实体列表继续编辑/ }).click();
      await fresh.waitForURL('**/entities/assets/Asset');
      await expectListHasRows(fresh);
      // 恢复后继续编辑：改名保存，刷新重开仍在
      const edit = await expectActionIcon(fresh, 'edit-action', 1);
      await fresh.mouse.click(edit.x, edit.y);
      await expect(fresh.getByRole('tab', { name: '基本信息' })).toBeVisible();
      await fresh.getByRole('group', { name: '名称' }).getByRole('textbox').fill('工作站');
      await fresh.getByRole('button', { name: '保存', exact: true }).click();
      await expect(fresh.getByRole('tab', { name: '基本信息' })).toHaveCount(0);
      await fresh.reload();
      await expectListHasRows(fresh);
    } finally {
      await context.close();
    }
  });

  test('AC#4 损坏归档恢复失败给出可读原因，数据保留不变', async ({ page, browser }) => {
    await resetE2eState(page);
    const corrupt = join(dir, 'corrupt.rxdb-backup');
    await writeFile(corrupt, '这不是一个备份归档', 'utf8');

    const { context, page: fresh } = await freshContextPage(browser);
    try {
      await fresh.goto('/backup');
      await fresh.getByTestId('restore-input').setInputFiles(corrupt);
      await expect(fresh.getByTestId('restore-result')).toContainText('归档文件损坏');
      // 失败后工作台仍可用：实体列表照常打开（空库保持空态）
      await fresh.goto('/entities/assets/AssetCategory');
      await expect(fresh.getByText('暂无数据')).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test('AC#4 已有数据时恢复被拒并保持数据不变', async ({ page }) => {
    await resetE2eState(page);
    await page.goto('/entities/assets/AssetCategory');
    await createCategory(page, '办公设备');
    const archive = await backupToFile(page, dir);

    // 同一工作台已有数据，恢复应被拒绝（target_busy），原数据不变
    await page.getByTestId('restore-input').setInputFiles(archive);
    await expect(page.getByTestId('restore-result')).toContainText('恢复只支持空工作台');
    await page.goto('/entities/assets/AssetCategory');
    await expectListHasRows(page);
  });
});
