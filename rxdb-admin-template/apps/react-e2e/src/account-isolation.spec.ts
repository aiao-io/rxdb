import { expect, test, type Page } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCategory, resetE2eState } from './e2e-utils.js';

/**
 * ADMIN-US-222：本机工作台库按账号隔离。每个账号打开自己的库（库名由账号身份派生、库记下身份），
 * 换了账号就是另一个库；登录之前设备共用的旧库不再打开。
 *
 * 默认账号的登录状态来自 setup 项目；另一个账号经登录页用另一个邮箱登录——模拟认证服务按邮箱签发账号，验证码都是 000000。
 * e2e 里每个浏览器上下文的工作台基础名存在 sessionStorage 的 {@link DB_BASE_KEY}，同一上下文的另一个标签页要显式带上它，
 * 才相当于生产里同一个库名。
 */
const DB_BASE_KEY = '__aiao_e2e_db_name__';
const DEFAULT_EMAIL = 'e2e@admin-template.test';
const OTHER_EMAIL = 'e2e-other@admin-template.test';

async function signOut(page: Page): Promise<void> {
  await page.getByTestId('account-menu').locator('summary').click();
  await page.getByRole('button', { name: '退出账号', exact: true }).click();
  await expect(page).toHaveURL(/\/login\?redirect=/);
}

/** 在登录页登录；登录成功后页面整页载入原地址，按新账号的身份打开它自己的库。 */
async function signIn(page: Page, email: string): Promise<void> {
  await page.getByLabel('邮箱', { exact: true }).fill(email);
  await page.getByRole('button', { name: '发送验证码', exact: true }).click();
  await page.getByLabel('验证码', { exact: true }).fill('000000');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page.getByTestId('account-menu')).toBeVisible();
}

/** Dashboard 上当前账号工作台库的记录总数。 */
async function expectTotal(page: Page, count: number): Promise<void> {
  await page.goto('/dashboard');
  await expect(page.getByTestId('dashboard-connection-status')).toHaveText('数据库已连接');
  if (count === 0) await expect(page.getByTestId('dashboard-empty')).toBeVisible();
  await expect(page.getByTestId('dashboard-total')).toContainText(`记录总数：${count}`);
}

/** 本页所在浏览器上下文里的 IndexedDB 库名。 */
async function indexedDatabaseNames(page: Page): Promise<string[]> {
  return page.evaluate(async () => (await indexedDB.databases()).map(database => database.name ?? ''));
}

test.describe('本机工作台库按账号隔离（ADMIN-US-222）', () => {
  test.beforeEach(async ({ page }) => {
    await resetE2eState(page);
  });

  test('AC#1/#2/#6 换了账号看不到上一个账号的数据，换回来数据都在；库名按身份派生，不再打开设备共用的旧库', async ({
    page
  }) => {
    await page.goto('/entities/assets/AssetCategory');
    await createCategory(page, '甲的分类');
    await expectTotal(page, 1);

    await signOut(page);
    await signIn(page, OTHER_EMAIL);
    await expectTotal(page, 0);

    await signOut(page);
    await signIn(page, DEFAULT_EMAIL);
    await expectTotal(page, 1);

    // 两个账号各一个库：都以本上下文的基础名开头、各带一段身份摘要；没有以基础名本身命名的库（那是旧的设备共用口径）
    const base = await page.evaluate(key => sessionStorage.getItem(key), DB_BASE_KEY);
    expect(base).toBeTruthy();
    const names = await indexedDatabaseNames(page);
    const own = new Set(names.filter(name => name.startsWith(`${base}-`)).map(name => name.split('@')[0]));
    expect(own.size).toBe(2);
    expect(names.some(name => name.startsWith(`${base}@`))).toBe(false);
  });

  test('AC#4 另一个标签页退出并换了账号：本页不会把写入落进新账号的库，打开的也是新账号自己的库', async ({
    page,
    context
  }) => {
    await page.goto('/entities/assets/AssetCategory');
    await createCategory(page, '甲的分类');
    const base = await page.evaluate(key => sessionStorage.getItem(key), DB_BASE_KEY);
    const second = await context.newPage();
    await second.addInitScript(([key, value]) => window.sessionStorage.setItem(key, value), [
      DB_BASE_KEY,
      base ?? ''
    ] as const);
    await expectTotal(second, 1);

    // 一个标签页退出：另一个随之回到登录页（D-10）
    await signOut(page);
    await expect(second).toHaveURL(/\/login\?redirect=/);

    await signIn(page, OTHER_EMAIL);
    await expectTotal(page, 0);
    // 另一个标签页再打开工作台：用的是新账号自己的库，看不到原账号的数据
    await expectTotal(second, 0);

    await signOut(page);
    await signIn(page, DEFAULT_EMAIL);
    await expectTotal(page, 1);
  });

  test('AC#7 备份按账号：在另一个账号下恢复写进它自己的库，不覆盖原账号的库', async ({ page }) => {
    const dir = await mkdtemp(join(tmpdir(), 'rxdb-admin-account-backup-'));
    try {
      await page.goto('/entities/assets/AssetCategory');
      await createCategory(page, '甲的分类');
      await page.goto('/backup');
      const downloadPromise = page.waitForEvent('download');
      await page.getByTestId('backup-start').click();
      const download = await downloadPromise;
      const archive = join(dir, download.suggestedFilename());
      await download.saveAs(archive);
      await expect(page.getByTestId('backup-result')).toContainText('备份成功');

      await signOut(page);
      await signIn(page, OTHER_EMAIL);
      await page.goto('/backup');
      await page.getByTestId('restore-input').setInputFiles(archive);
      await expect(page.getByTestId('restore-result')).toContainText('恢复成功');
      await page.goto('/entities/assets/AssetCategory');
      await createCategory(page, '乙的分类');
      await expectTotal(page, 2);

      await signOut(page);
      await signIn(page, DEFAULT_EMAIL);
      await expectTotal(page, 1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
