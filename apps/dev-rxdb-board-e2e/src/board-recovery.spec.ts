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
  await page.getByTestId('export-backup').click();
  const archive = await (await downloading).path();
  page.once('dialog', dialog => dialog.accept());
  await page.getByTestId('restore-file-menu').setInputFiles(archive!);
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
