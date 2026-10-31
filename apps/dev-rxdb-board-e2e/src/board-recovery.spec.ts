import { expect, test } from '@playwright/test';
import { APP_BASE_URL } from './env';

test('切到第二块板后刷新仍保留所选看板', async ({ page }) => {
  await page.goto(APP_BASE_URL);
  await page.getByTestId('start-seed').click();
  await expect(page.getByTestId('task-card')).toHaveCount(12);
  await page.getByTestId('board-selector').selectOption({ label: '引擎研究草稿' });
  await expect(page.getByTestId('task-card')).toHaveCount(8);
  await page.reload();
  await expect(page.getByTestId('task-card')).toHaveCount(8);
});

test('恢复中断留下标记时重新打开原活动库', async ({ page }) => {
  await page.goto(APP_BASE_URL);
  await page.getByTestId('start-seed').click();
  await expect(page.getByTestId('task-card')).toHaveCount(12);
  const active = await page.evaluate(() => localStorage.getItem('rxdb-board-active-db'));
  await page.evaluate(() => localStorage.setItem('rxdb-board-restoring', '1'));
  await page.reload();
  expect(await page.evaluate(() => localStorage.getItem('rxdb-board-active-db'))).toBe(active);
  await expect(page.getByTestId('task-card')).toHaveCount(12);
});

test('没有看板行的合法空库归档也能恢复', async ({ page }) => {
  await page.goto(APP_BASE_URL);
  await page.getByTestId('start-empty').click();
  await expect(page.getByTestId('empty-board')).toBeVisible();
  const oldActive = await page.evaluate(() => localStorage.getItem('rxdb-board-active-db'));
  const downloading = page.waitForEvent('download');
  await page.getByTestId('board-menu-trigger').click();
  await page.getByTestId('export-backup').click();
  const archive = await (await downloading).path();
  await page.getByTestId('restore-file-menu').setInputFiles(archive!);
  await page.getByTestId('host-confirm-yes').click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('rxdb-board-active-db'))).not.toBe(oldActive);
  await expect(page.getByTestId('app-error')).toHaveCount(0);
  await expect(page.getByTestId('empty-board')).toBeVisible();
});

test('另一页面仍在恢复时不清理其标记，结束后打开原活动库', async ({ page, context }) => {
  await page.goto(APP_BASE_URL);
  await page.getByTestId('start-seed').click();
  await expect(page.getByTestId('task-card')).toHaveCount(12);
  await page.evaluate(
    () =>
      new Promise<void>(resolve => {
        void navigator.locks.request(
          'rxdb-board:restore',
          () =>
            new Promise<void>(release => {
              (window as unknown as { releaseBoardRestore: () => void }).releaseBoardRestore = release;
              localStorage.setItem('rxdb-board-restoring', '1');
              resolve();
            })
        );
      })
  );
  const other = await context.newPage();
  try {
    await other.goto(APP_BASE_URL);
    await expect(other.getByTestId('restoring-page')).toBeVisible();
    expect(await other.evaluate(() => localStorage.getItem('rxdb-board-restoring'))).toBe('1');
    await page.evaluate(() => {
      localStorage.removeItem('rxdb-board-restoring');
      (window as unknown as { releaseBoardRestore: () => void }).releaseBoardRestore();
    });
    await expect(other.getByTestId('task-card')).toHaveCount(12);
  } finally {
    await other.close();
  }
});

test('待切换库已经丢失时报告失败并继续打开原库', async ({ page }) => {
  await page.goto(APP_BASE_URL);
  await page.getByTestId('start-seed').click();
  await expect(page.getByTestId('task-card')).toHaveCount(12);
  const active = await page.evaluate(() => localStorage.getItem('rxdb-board-active-db'));
  await page.evaluate(() => localStorage.setItem('rxdb-board-pending-switch', 'rxdb-board-missing'));
  await page.reload();
  await expect(page.getByTestId('task-card')).toHaveCount(12);
  await expect(page.getByTestId('app-error')).toContainText('恢复读回失败');
  expect(await page.evaluate(() => localStorage.getItem('rxdb-board-active-db'))).toBe(active);
});

for (const pending of [false, true]) {
  test(`恢复${pending ? '读回' : '中断'}清理失败仍可使用原库，保留目标供重试`, async ({ page }) => {
    await page.goto(APP_BASE_URL);
    await page.getByTestId('start-seed').click();
    await expect(page.getByTestId('task-card')).toHaveCount(12);
    await page.evaluate(shouldSwitch => {
      localStorage.setItem('rxdb-board-restoring', '1');
      localStorage.setItem('rxdb-board-restore-target', 'rxdb-board-failed-target');
      if (shouldSwitch) localStorage.setItem('rxdb-board-pending-switch', 'rxdb-board-failed-target');
    }, pending);
    await page.addInitScript(() => {
      Object.defineProperty(indexedDB, 'databases', {
        value: () => Promise.reject(new Error('模拟清理读取失败'))
      });
    });
    await page.reload();
    await expect(page.getByTestId('task-card')).toHaveCount(12);
    await expect(page.getByTestId('app-error')).toContainText('清理失败');
    expect(await page.evaluate(() => localStorage.getItem('rxdb-board-restore-target'))).toBe(
      'rxdb-board-failed-target'
    );
    expect(await page.evaluate(() => localStorage.getItem('rxdb-board-restoring'))).toBeNull();
    await page.getByTestId('add-task').first().click();
    await page.getByTestId('add-task-input').fill('清理失败后的新任务');
    await page.getByTestId('add-task-input').press('Enter');
    await expect(page.getByTestId('task-card')).toHaveCount(13);
  });
}

test('连续重置释放旧库连接，新旧看板数据仍可读写', async ({ page }) => {
  await page.goto(APP_BASE_URL);
  await page.getByTestId('start-seed').click();
  await expect(page.getByTestId('task-card')).toHaveCount(12);
  const original = await page.evaluate(() => localStorage.getItem('rxdb-board-active-db'));
  await page.getByTestId('add-task').first().click();
  await page.getByTestId('add-task-input').fill('重置前保留的任务');
  await page.getByTestId('add-task-input').press('Enter');
  await expect(page.getByTestId('task-card')).toHaveCount(13);
  for (let attempt = 0; attempt < 2; attempt++) {
    const oldDb = await page.evaluate(() => localStorage.getItem('rxdb-board-active-db'));
    await page.getByTestId('reset-demo').click();
    await page.getByTestId('host-confirm-yes').click();
    await expect(page.getByTestId('task-card')).toHaveCount(12);
    await expect.poll(() => page.evaluate(() => localStorage.getItem('rxdb-board-active-db'))).not.toBe(oldDb);
    await expect
      .poll(() =>
        page.evaluate(async name => {
          const { held, pending } = await navigator.locks.query();
          return [...held, ...pending].filter(lock => lock.name?.includes(name!)).map(lock => lock.name);
        }, oldDb)
      )
      .toEqual([]);
  }
  await page.getByTestId('add-task').first().click();
  await page.getByTestId('add-task-input').fill('重置后可写');
  await page.getByTestId('add-task-input').press('Enter');
  await expect(page.getByTestId('task-card')).toHaveCount(13);
  await page.evaluate(name => localStorage.setItem('rxdb-board-active-db', name!), original);
  await page.reload();
  await expect(page.getByTestId('task-card')).toHaveCount(13);
  await expect(page.getByTestId('task-title').filter({ hasText: '重置前保留的任务' })).toBeVisible();
});

test('重置写入活动位置失败时释放新连接，保留原板及其写能力', async ({ page }) => {
  await page.goto(APP_BASE_URL);
  await page.getByTestId('start-seed').click();
  await expect(page.getByTestId('task-card')).toHaveCount(12);
  const active = await page.evaluate(() => localStorage.getItem('rxdb-board-active-db'));
  await page.evaluate(() => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'rxdb-board-active-db') throw new Error('模拟活动位置写入失败');
      setItem.call(this, key, value);
    };
  });
  await page.getByTestId('reset-demo').click();
  await page.getByTestId('host-confirm-yes').click();
  await expect(page.getByTestId('app-error')).toContainText('模拟活动位置写入失败');
  expect(await page.evaluate(() => localStorage.getItem('rxdb-board-active-db'))).toBe(active);
  await expect
    .poll(() =>
      page.evaluate(async name => {
        const { held, pending } = await navigator.locks.query();
        return [...held, ...pending]
          .filter(lock => lock.name?.includes('rxdb-board-restore-') && !lock.name.includes(name!))
          .map(lock => lock.name);
      }, active)
    )
    .toEqual([]);
  await page.getByTestId('add-task').first().click();
  await page.getByTestId('add-task-input').fill('失败后仍可写');
  await page.getByTestId('add-task-input').press('Enter');
  await expect(page.getByTestId('task-card')).toHaveCount(13);
});

test('恢复切库成功后其他页面同步切换，后续写入刷新仍保留', async ({ page, context }) => {
  await page.goto(APP_BASE_URL);
  await page.getByTestId('start-seed').click();
  await expect(page.getByTestId('task-card')).toHaveCount(12);
  const download = page.waitForEvent('download');
  await page.getByTestId('board-menu-trigger').click();
  await page.getByTestId('export-backup').click();
  const archive = await (await download).path();
  const oldActive = await page.evaluate(() => localStorage.getItem('rxdb-board-active-db'));
  await page.getByTestId('add-task').first().click();
  await page.getByTestId('add-task-input').fill('备份之后的旧库任务');
  await page.getByTestId('add-task-input').press('Enter');
  await expect(page.getByTestId('task-card')).toHaveCount(13);
  const other = await context.newPage();
  try {
    await other.goto(APP_BASE_URL);
    await expect(other.getByTestId('task-card')).toHaveCount(13);
    await page.getByTestId('restore-file-menu').setInputFiles(archive!);
    await page.getByTestId('host-confirm-yes').click();
    await expect(page.getByTestId('task-card')).toHaveCount(12);
    await expect.poll(() => page.evaluate(() => localStorage.getItem('rxdb-board-active-db'))).not.toBe(oldActive);
    await expect(other.getByTestId('task-card')).toHaveCount(12);
    await expect(other.getByTestId('restoring-badge')).toHaveCount(0);
    await other.getByTestId('add-task').first().click();
    await other.getByTestId('add-task-input').fill('切库后在第二页新建的任务');
    await other.getByTestId('add-task-input').press('Enter');
    await expect(other.getByTestId('task-title').filter({ hasText: '切库后在第二页新建的任务' })).toHaveCount(1);
    await other.reload();
    await expect(other.getByTestId('task-card')).toHaveCount(13);
    await expect(other.getByTestId('task-title').filter({ hasText: '切库后在第二页新建的任务' })).toHaveCount(1);
  } finally {
    await other.close();
  }
});
