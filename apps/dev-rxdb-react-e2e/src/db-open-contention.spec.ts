import { expect, test, type BrowserContext, type Page } from '@playwright/test';

/**
 * @fileoverview US-221：库文件的同步访问句柄被另一个上下文占着时，应用照常打开，或给出看得见的错误。
 *
 * @remarks
 * 整页刷新时「上一个页面还占着句柄」的现场不靠真实刷新的时序：同一浏览器上下文的另一个标签页起一个 Worker，
 * 只对本页面的库文件开同步访问句柄、不拿 OPFS VFS 的 Web Lock。本页面的库名经 sessionStorage 定成已知值
 * （e2e 的库名就存在那里，见 `getE2eDbName`），占用方才找得到文件。三端里只有 React / Vue 的 e2e 走 OPFS：
 * Angular 的 e2e 端口强制 IDB（失败现场归档要读同一个库）。
 */

/** `getE2eDbName` 存 e2e 库名的 sessionStorage 键。 */
const E2E_DB_NAME_STORAGE_KEY = '__aiao_e2e_db_name__';

/**
 * 库名对应的 OPFS 库文件：RxDB 给库名追加 `@<RXDB_DB_NAME_SUFFIX>`（`packages/rxdb/src/version.ts`，非公开导出），
 * sqlite-wasm 适配器再加 `.sqlite`。
 */
const opfsFileOf = (dbName: string): string => `${dbName}@0_1.sqlite`;

/** 让本页面用指定的库名。 */
const useDbName = (page: Page, dbName: string) =>
  page.addInitScript(({ key, name }) => window.sessionStorage.setItem(key, name), {
    key: E2E_DB_NAME_STORAGE_KEY,
    name: dbName
  });

/** 在同一浏览器上下文的另一个标签页里占住 `fileName` 的同步访问句柄；返回释放函数。 */
const holdAccessHandle = async (context: BrowserContext, fileName: string): Promise<() => Promise<void>> => {
  const holder = await context.newPage();
  await holder.goto('/robots.txt');
  await holder.evaluate(async name => {
    const source = `let held;
      self.onmessage = async event => {
        if (event.data.type === 'hold') {
          const root = await navigator.storage.getDirectory();
          const file = await root.getFileHandle(event.data.fileName, { create: true });
          held = await file.createSyncAccessHandle();
        } else {
          held?.close();
          held = undefined;
        }
        self.postMessage(event.data.type);
      };`;
    const worker = new Worker(URL.createObjectURL(new Blob([source], { type: 'text/javascript' })));
    (window as unknown as { __holder: Worker }).__holder = worker;
    await new Promise<void>(resolve => {
      worker.onmessage = () => resolve();
      worker.postMessage({ type: 'hold', fileName: name });
    });
  }, fileName);
  return async () => {
    await holder.evaluate(
      () =>
        new Promise<void>(resolve => {
          const worker = (window as unknown as { __holder: Worker }).__holder;
          worker.onmessage = () => resolve();
          worker.postMessage({ type: 'release' });
        })
    );
    await holder.close();
  };
};

test.describe('库文件被另一个上下文占着（US-221）', () => {
  test.describe.configure({ mode: 'serial' });

  test('占着的一方随后放开：应用照常打开，能写能读', async ({ page, context }) => {
    const dbName = `us221_released_${Date.now()}`;
    await useDbName(page, dbName);
    const release = await holdAccessHandle(context, opfsFileOf(dbName));

    // 等应用第一次打开撞上占用（VFS 把这个错误打到控制台）再放开：确定重试路径真的走到了
    const contention = page.waitForEvent('console', message => message.text().includes('NoModificationAllowedError'));
    await page.goto('/todo', { waitUntil: 'domcontentloaded' });
    await contention;
    await release();

    await page.getByTestId('todo-title-input').fill('opened-after-release');
    await page.getByTestId('todo-add').click();
    await expect(page.getByTestId('todo-row').filter({ hasText: 'opened-after-release' })).toBeVisible({
      timeout: 15000
    });
    await expect(page.getByTestId('app-db-error')).toHaveCount(0);
  });

  test('一直占着：应用壳显示数据库打不开，受守卫的页面不渲染', async ({ page, context }) => {
    const dbName = `us221_held_${Date.now()}`;
    await useDbName(page, dbName);
    const release = await holdAccessHandle(context, opfsFileOf(dbName));

    await page.goto('/working-tree', { waitUntil: 'domcontentloaded' });
    const alert = page.getByTestId('app-db-error');
    await expect(alert).toBeVisible({ timeout: 30000 });
    await expect(alert).toContainText('held by another context');
    await expect(page.getByRole('button', { name: '重新加载' })).toBeVisible();
    await expect(page.getByTestId('working-tree-page')).toHaveCount(0);

    await release();
  });
});
