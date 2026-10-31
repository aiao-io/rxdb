import type { Page } from '@playwright/test';
import { test as base, expect } from '@playwright/test';

/**
 * 看板宿主的备份恢复与跨页恢复门禁（US-539 AC#4 / #5，US-537）：外壳的启动页与工具栏两条恢复入口都恢复到新库名、
 * 整页重载读回后才切换；一页恢复中时另一页浏览可用、写入口禁用并标明「恢复中」、草稿保留，恢复结束后解除；
 * 切库成功后另一页随活动位置变更重载。首轮支持组合是 sqlite-wasm 主线程 `vfs: 'idb'`。
 *
 * 本文件与 dev-rxdb-react-e2e / dev-rxdb-vue-e2e 的副本内容一致，只允许一处差异：
 * Angular 端从 `./fixtures.js` 取 test / expect（US-909 失败归档守卫），React / Vue 从
 * `@playwright/test` 取。改一处改三处（`pnpm audit:e2e-spec-copies` 守同步）。
 */

/** 活动库名与恢复中标记的本地记录键、恢复锁名（核心包 BoardShellController 的跨页协议）。 */
const ACTIVE_DB_KEY = 'rxdb-board-active-db';
const RESTORING_MARKER_KEY = 'rxdb-board-restoring';
const RESTORE_LOCK = 'rxdb-board:restore';

/** 每个用例一个全新浏览器上下文；出现浏览器原生弹窗即记录，收尾断言为空。 */
const test = base.extend<{ boardPage: Page }>({
  boardPage: async ({ browser }, use) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const nativeDialogs: string[] = [];
    page.on('dialog', dialog => {
      nativeDialogs.push(`${dialog.type()} ${dialog.message()}`);
      void dialog.dismiss();
    });
    await page.goto('/board');
    await expect(page.getByTestId('startup-page')).toBeVisible();
    await use(page);
    await context.close();
    expect(nativeDialogs).toEqual([]);
  }
});

const startWithSeed = async (page: Page): Promise<void> => {
  await page.getByTestId('start-seed').click();
  await expect(page.getByTestId('board-view')).toBeVisible();
  await expect(page.getByTestId('task-card')).toHaveCount(12);
};

const activeDbOf = (page: Page): Promise<string | null> =>
  page.evaluate(key => localStorage.getItem(key), ACTIVE_DB_KEY);

const cardWith = (page: Page, title: string) => page.getByTestId('task-card').filter({ hasText: title });

/** 看板菜单导出备份（归档完整生成后才触发下载），返回归档路径。 */
const exportBackup = async (page: Page): Promise<string> => {
  const downloading = page.waitForEvent('download');
  await page.getByTestId('board-menu-trigger').click();
  await page.getByTestId('export-backup').click();
  const archive = await (await downloading).path();
  expect(archive).toBeTruthy();
  await expect(page.getByTestId('board-toast')).toContainText('备份已生成');
  return archive!;
};

/** 聚焦卡片按 F2 就地改标题。 */
const renameTask = async (page: Page, from: string, to: string): Promise<void> => {
  await cardWith(page, from).focus();
  await page.keyboard.press('F2');
  await page.getByTestId('task-title-editor').fill(to);
  await page.getByTestId('task-title-editor').press('Enter');
  await expect(cardWith(page, to)).toBeVisible();
};

const openDetail = async (page: Page, title: string) => {
  await cardWith(page, title).getByTestId('task-title').click();
  const detail = page.getByTestId('detail-panel');
  await expect(detail).toBeVisible();
  return detail;
};

/** 模拟本页正在恢复：持恢复锁并写恢复中标记，停在写入期，直到 {@link endRestore}。 */
const beginRestore = (page: Page): Promise<void> =>
  page.evaluate(
    ([lock, marker]) =>
      new Promise<void>(resolve => {
        void navigator.locks.request(
          lock,
          () =>
            new Promise<void>(release => {
              (window as unknown as { endBoardRestore: () => void }).endBoardRestore = release;
              localStorage.setItem(marker, '1');
              resolve();
            })
        );
      }),
    [RESTORE_LOCK, RESTORING_MARKER_KEY] as const
  );

/** 恢复结束（失败或取消后的清理）：清标记、放锁。 */
const endRestore = (page: Page): Promise<void> =>
  page.evaluate(marker => {
    localStorage.removeItem(marker);
    (window as unknown as { endBoardRestore: () => void }).endBoardRestore();
  }, RESTORING_MARKER_KEY);

test.describe('看板备份恢复（US-539 AC#4 / #5）', () => {
  test('AC#4：工具菜单与启动页两条入口都恢复到新库名、整页重载读回后切换；原库保留，重开不丢', async ({
    boardPage: page
  }) => {
    await startWithSeed(page);
    await renameTask(page, '修复登录 bug', '修复登录 bug（备份版）');
    const archive = await exportBackup(page);
    // 归档之后的改动不在备份里，但留在原库
    await renameTask(page, '写发布说明', '写发布说明（备份后）');
    const original = await activeDbOf(page);

    // 工具菜单：已有看板先确认；恢复到新库名、重载读回成功才切换（先等活动位置换掉，切换前的旧板同样是 12 张卡）
    await page.getByTestId('restore-file-menu').setInputFiles(archive);
    await expect(page.getByTestId('host-confirm')).toBeVisible();
    await page.getByTestId('host-confirm-yes').click();
    await expect.poll(() => activeDbOf(page), { timeout: 30000 }).not.toBe(original);
    await expect(page.getByTestId('task-title').getByText('写发布说明', { exact: true })).toBeVisible();
    await expect(cardWith(page, '修复登录 bug（备份版）')).toBeVisible();
    await expect(page.getByTestId('task-card')).toHaveCount(12);

    // 原库原样保留：活动位置指回去重开，备份之后的改动还在
    await page.evaluate(([key, name]) => localStorage.setItem(key, name), [ACTIVE_DB_KEY, original!] as const);
    await page.reload();
    await expect(cardWith(page, '写发布说明（备份后）')).toBeVisible();

    // 启动页：清掉站点数据（模拟丢库），在连接与装载演示数据之前恢复
    await page.evaluate(async () => {
      localStorage.clear();
      for (const db of await indexedDB.databases()) indexedDB.deleteDatabase(db.name ?? '');
    });
    await page.reload();
    await expect(page.getByTestId('startup-page')).toBeVisible();
    await page.getByTestId('restore-file').setInputFiles(archive);
    await expect(cardWith(page, '修复登录 bug（备份版）')).toBeVisible({ timeout: 30000 });
    await expect(page.getByTestId('task-card')).toHaveCount(12);
    await page.reload();
    await expect(cardWith(page, '修复登录 bug（备份版）')).toBeVisible();
  });

  test('AC#4：损坏归档明确拒绝，不切换，原库可继续读写', async ({ boardPage: page }) => {
    await startWithSeed(page);
    const original = await activeDbOf(page);
    await page.getByTestId('restore-file-menu').setInputFiles({
      name: 'broken.rxdb',
      mimeType: 'application/octet-stream',
      buffer: Buffer.from('this is not an archive')
    });
    await page.getByTestId('host-confirm-yes').click();
    await expect(page.getByTestId('app-error')).toBeVisible({ timeout: 30000 });
    expect(await activeDbOf(page)).toBe(original);
    await page.getByTestId('add-task').first().click();
    await page.getByTestId('add-task-input').fill('恢复失败后的新任务');
    await page.getByTestId('add-task-input').press('Enter');
    await expect(page.getByTestId('task-card')).toHaveCount(13);
  });

  test('AC#5：一页恢复中——另一页浏览可用、写入口禁用并标明恢复中、草稿保留、再次恢复被拒；结束后解除', async ({
    boardPage: page
  }) => {
    await startWithSeed(page);
    const archive = await exportBackup(page);
    const other = await page.context().newPage();
    try {
      await other.goto('/board');
      await expect(other.getByTestId('task-card')).toHaveCount(12);
      const detail = await openDetail(other, '修复登录 bug');
      await detail.getByTestId('detail-title').fill('修复登录 bug（恢复中草稿）');

      await beginRestore(page);
      await expect(other.getByTestId('restoring-badge')).toBeVisible();
      await expect(other.getByTestId('restoring-note')).toBeVisible();
      for (const testId of ['undo', 'redo', 'create-board', 'create-column', 'detail-due', 'detail-delete']) {
        await expect(other.getByTestId(testId)).toBeDisabled();
      }
      await expect(other.getByTestId('add-task').first()).toBeDisabled();
      await expect(other.getByTestId('task-card').first()).toHaveAttribute('draggable', 'false');
      // 编辑中进入恢复：输入框锁住但草稿原样保留
      await expect(detail.getByTestId('detail-title')).toBeDisabled();
      await expect(detail.getByTestId('detail-title')).toHaveValue('修复登录 bug（恢复中草稿）');

      // 再次恢复被拒：另一页面正占着恢复
      await other.getByTestId('restore-file-menu').setInputFiles(archive);
      await other.getByTestId('host-confirm-yes').click();
      await expect(other.getByTestId('app-error')).toContainText('另一页面正在准备或恢复看板');

      // 恢复结束：解除门禁，保留下来的草稿可以提交
      await endRestore(page);
      await expect(other.getByTestId('restoring-badge')).toHaveCount(0);
      await expect(detail.getByTestId('detail-title')).toBeEnabled();
      await detail.getByTestId('detail-title').press('Enter');
      await expect(cardWith(other, '修复登录 bug（恢复中草稿）')).toBeVisible();
      await detail.getByTestId('detail-close').click();

      // 浏览可用：恢复中照样切板查看、打开详情阅读
      await beginRestore(page);
      await expect(other.getByTestId('restoring-badge')).toBeVisible();
      await other.getByTestId('board-selector').selectOption({ label: '引擎研究草稿' });
      await expect(other.getByTestId('task-card')).toHaveCount(8);
      const reading = await openDetail(other, '同步协议草案');
      await expect(reading.getByTestId('detail-title')).toBeDisabled();
      await reading.getByTestId('detail-close').click();
      await other.getByTestId('board-selector').selectOption({ label: 'rxdb 1.0 发布计划' });
      await expect(other.getByTestId('task-card')).toHaveCount(12);
      await endRestore(page);
      await expect(other.getByTestId('add-task').first()).toBeEnabled();
    } finally {
      await other.close();
    }
  });

  test('AC#5：恢复切库成功后另一页随活动位置变更重载到新库，之后的写入刷新仍保留', async ({ boardPage: page }) => {
    await startWithSeed(page);
    const archive = await exportBackup(page);
    const original = await activeDbOf(page);
    await page.getByTestId('add-task').first().click();
    await page.getByTestId('add-task-input').fill('备份之后的旧库任务');
    await page.getByTestId('add-task-input').press('Enter');
    await expect(page.getByTestId('task-card')).toHaveCount(13);
    const other = await page.context().newPage();
    try {
      await other.goto('/board');
      await expect(other.getByTestId('task-card')).toHaveCount(13);
      await page.getByTestId('restore-file-menu').setInputFiles(archive);
      await page.getByTestId('host-confirm-yes').click();
      await expect(page.getByTestId('task-card')).toHaveCount(12, { timeout: 30000 });
      await expect.poll(() => activeDbOf(page)).not.toBe(original);
      await expect(other.getByTestId('task-card')).toHaveCount(12, { timeout: 30000 });
      await expect(other.getByTestId('restoring-badge')).toHaveCount(0);
      await other.getByTestId('add-task').first().click();
      await other.getByTestId('add-task-input').fill('切库后在第二页新建的任务');
      await other.getByTestId('add-task-input').press('Enter');
      await expect(cardWith(other, '切库后在第二页新建的任务')).toHaveCount(1);
      await other.reload();
      await expect(other.getByTestId('task-card')).toHaveCount(13);
      await expect(cardWith(other, '切库后在第二页新建的任务')).toHaveCount(1);
    } finally {
      await other.close();
    }
  });
});
