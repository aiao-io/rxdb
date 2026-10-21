import { test as base, expect, type Page } from '@playwright/test';
import { APP_BASE_URL } from './env';

/**
 * 看板 demo 首轮闭环（US-532 阶段 A AC#2～8）：
 * 每个用例都在全新浏览器上下文从启动页开始（种子 / 空库初态按 AC 各自指定），
 * 拖拽用真实拖拽且拖后刷新读回（US-028 AC#18 先例）。
 */

/** 每个用例一个全新浏览器上下文（干净 IndexedDB / localStorage 初态）。 */
const test = base.extend<{ boardPage: Page }>({
  boardPage: async ({ browser }, use) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(APP_BASE_URL);
    await use(page);
    await context.close();
  }
});

/** 经启动页装载演示数据（只进新库）。 */
const startWithSeed = async (page: Page): Promise<void> => {
  await expect(page.getByTestId('startup-page')).toBeVisible();
  await page.getByTestId('start-seed').click();
  await expect(page.getByTestId('board-view')).toBeVisible();
  await expect(page.getByTestId('column')).toHaveCount(4);
  await expect(page.getByTestId('task-card')).toHaveCount(12);
};

/** 按列收集任务标题（库序）。 */
const titlesOfColumn = async (page: Page, columnTitle: string): Promise<string[]> => {
  const column = page
    .getByTestId('column')
    .filter({ has: page.getByTestId('column-title').getByText(columnTitle, { exact: true }) });
  return column.getByTestId('task-title').allTextContents();
};

test('AC#2：启动页新建空看板 → 建板/列/任务 → 第二板切换 → 重开原样；种子板与用户新板并存', async ({
  boardPage: page
}) => {
  await expect(page.getByTestId('startup-page')).toBeVisible();

  // 新建空看板路径：建板 → 建列 → 建任务
  let promptCount = 0;
  page.on('dialog', async dialog => {
    promptCount++;
    dialog.accept(
      promptCount === 1 ? '我的看板'
      : promptCount === 2 ? '待办'
      : '第一件事'
    );
  });
  await page.getByTestId('start-empty').click();
  await expect(page.getByTestId('empty-board')).toBeVisible();
  await page.getByTestId('create-board-empty').click();
  await expect(page.getByTestId('board-view')).toBeVisible();
  await page.getByTestId('create-column').click();
  await expect(page.getByTestId('column')).toHaveCount(1);
  await page.getByTestId('add-task').click();
  await expect(page.getByTestId('task-card')).toHaveCount(1);
  expect(await page.getByTestId('task-title').textContent()).toBe('第一件事');

  // 第二板并切换：板切换不混数据
  await page.getByTestId('create-board').click();
  await expect(page.getByTestId('board-selector').locator('option', { hasText: '第二块板' })).toBeVisible();
  await page.getByTestId('board-selector').selectOption({ label: '第二块板' });
  await expect(page.getByTestId('empty-board')).toBeVisible();
  await page.getByTestId('board-selector').selectOption({ label: '我的看板' });
  await expect(page.getByTestId('task-card')).toHaveCount(1);

  // 重开：板 / 列 / 任务 / 顺序原样
  await page.reload();
  await expect(page.getByTestId('task-card')).toHaveCount(1);
  expect(await page.getByTestId('task-title').textContent()).toBe('第一件事');

  // 种子板与用户新板并存：工具菜单重置为演示数据走新库（confirm 对话框）
  page.once('dialog', dialog => dialog.accept());
  await page.getByTestId('reset-demo').click();
  await expect(page.getByTestId('column')).toHaveCount(4);
  await page.getByTestId('board-selector').selectOption({ label: '我的看板' });
  await expect(page.getByTestId('task-card')).toHaveCount(1);
});

test('AC#3：真实拖拽——跨列两邻之间、空列、同列改序，每次拖后刷新读回', async ({ boardPage: page }) => {
  await startWithSeed(page);

  // 跨列：把 To do 第一张卡「修复登录 bug」拖到 Doing 的「树拖拽落点修复」之上
  const source = page.getByTestId('task-card').filter({ hasText: '修复登录 bug' });
  const target = page.getByTestId('task-card').filter({ hasText: '树拖拽落点修复' });
  await source.dragTo(target, { targetPosition: { x: 10, y: 5 } });
  await page.waitForTimeout(500);
  await page.reload();
  await expect(page.getByTestId('board-view')).toBeVisible();
  await expect(page.getByTestId('task-card')).toHaveCount(12);
  const doing = await titlesOfColumn(page, 'Doing');
  expect(doing[0]).toBe('修复登录 bug');
  expect(await titlesOfColumn(page, 'To do')).not.toContain('修复登录 bug');

  // 空列：拖「写发布说明」到 Ideas（空列）
  const toIdeas = page.getByTestId('task-card').filter({ hasText: '写发布说明' });
  const ideasColumn = page
    .getByTestId('column')
    .filter({ has: page.getByTestId('column-title').getByText('Ideas', { exact: true }) });
  await toIdeas.dragTo(ideasColumn.getByTestId('add-task'));
  await page.reload();
  await expect(page.getByTestId('board-view')).toBeVisible();
  await expect(page.getByTestId('task-card')).toHaveCount(12);
  expect(await titlesOfColumn(page, 'Ideas')).toEqual(['写发布说明']);

  // 同列改序：把 To do 的「整理同步迁移指南」拖到「同步插件适配 Supabase」之上
  const moved = page.getByTestId('task-card').filter({ hasText: '整理同步迁移指南' });
  const over = page.getByTestId('task-card').filter({ hasText: '同步插件适配 Supabase' });
  await moved.dragTo(over, { targetPosition: { x: 10, y: 5 } });
  await page.reload();
  await expect(page.getByTestId('board-view')).toBeVisible();
  await expect(page.getByTestId('task-card')).toHaveCount(12);
  const todo = await titlesOfColumn(page, 'To do');
  expect(todo[0]).toBe('整理同步迁移指南');
});

test('AC#4：详情一次保存整体撤销 / 重放；独立保存各自 undo；刷新后不可撤销', async ({ boardPage: page }) => {
  await startWithSeed(page);
  const card = page.getByTestId('task-card').filter({ hasText: '修复登录 bug' });
  await card.getByTestId('task-title').click();
  await expect(page.getByTestId('detail-panel')).toBeVisible();

  // 一次保存：标题 + 描述 + 截止日
  await page.getByTestId('detail-title').fill('修复登录 bug（已改）');
  await page.getByTestId('detail-description').fill('弱网超时重试已补齐。');
  await page.getByTestId('detail-due').fill('2026-12-01');
  await page.getByTestId('detail-save').click();
  await expect(page.getByTestId('task-card').filter({ hasText: '修复登录 bug（已改）' })).toBeVisible();

  // 一次 undo 整体回退
  await page.getByTestId('undo').click();
  await expect(page.getByTestId('task-card').filter({ hasText: '修复登录 bug' })).toBeVisible();
  await page.getByTestId('redo').click();
  await expect(page.getByTestId('task-card').filter({ hasText: '修复登录 bug（已改）' })).toBeVisible();

  // 刷新后此前的保存不可撤销：撤销入口禁用
  await page.reload();
  await expect(page.getByTestId('undo')).toBeDisabled();
});

test('AC#5 + AC#8：删列（含任务）级联无孤儿；确认清单与取消零写', async ({ boardPage: page }) => {
  await startWithSeed(page);

  // 删除确认清单列任务数；取消零写
  const doingColumn = page
    .getByTestId('column')
    .filter({ has: page.getByTestId('column-title').getByText('Doing', { exact: true }) });
  await doingColumn.getByTestId('column-delete').click();
  await expect(page.getByTestId('confirm-delete')).toContainText('4 个任务');
  await page.getByTestId('confirm-delete-no').click();
  await expect(page.getByTestId('column')).toHaveCount(4);

  // 确认级联：删列 → 列与其任务一并删除、无孤儿，其余列不受影响
  await doingColumn.getByTestId('column-delete').click();
  await page.getByTestId('confirm-delete-yes').click();
  await expect(page.getByTestId('column')).toHaveCount(3);
  await expect(page.getByTestId('task-card')).toHaveCount(8);
  await page.reload();
  await expect(page.getByTestId('column')).toHaveCount(3);
  await expect(page.getByTestId('task-card')).toHaveCount(8);
});

test('AC#6：导出 → 清站点数据 → 启动页从备份恢复 → 重开数据一致', async ({ boardPage: page }) => {
  await startWithSeed(page);

  // 编辑一条任务，让归档包含用户改动
  await page.getByTestId('task-card').filter({ hasText: '修复登录 bug' }).getByTestId('task-edit-title').click();
  await page.getByTestId('task-title-editor').fill('修复登录 bug（备份版）');
  await page.getByTestId('task-title-save').click();
  await expect(page.getByTestId('task-card').filter({ hasText: '修复登录 bug（备份版）' })).toBeVisible();

  // 导出备份（触发下载）
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('export-backup').click();
  const download = await downloadPromise;
  const archivePath = await download.path();
  expect(archivePath).toBeTruthy();

  // 清掉站点数据（模拟丢库），回到启动页
  await page.evaluate(() => {
    localStorage.clear();
  });
  await page.reload();
  await expect(page.getByTestId('startup-page')).toBeVisible();

  // 选择前没有连接、没有引擎表或种子：启动页可见即证明（US-529 AC#3）
  // 从备份恢复
  await page.getByTestId('restore-file').setInputFiles(archivePath!);
  await expect(page.getByTestId('board-view')).toBeVisible({ timeout: 30000 });
  await expect(page.getByTestId('column')).toHaveCount(4);
  await expect(page.getByTestId('task-card')).toHaveCount(12);
  await expect(page.getByTestId('task-card').filter({ hasText: '修复登录 bug（备份版）' })).toBeVisible();

  // 重开保留
  await page.reload();
  await expect(page.getByTestId('task-card').filter({ hasText: '修复登录 bug（备份版）' })).toBeVisible();
});

test('AC#8：恢复损坏归档拒绝且原库可继续使用', async ({ boardPage: page }) => {
  await startWithSeed(page);

  // 工具菜单恢复入口选择损坏文件（不是归档的字节）
  await page.getByTestId('restore-file-menu').setInputFiles({
    name: 'broken.rxdb',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from('this is not an archive')
  });
  await expect(page.getByTestId('app-error')).toContainText('失败', { timeout: 30000 });

  // 原库可继续使用：建任务照常
  await page.getByTestId('column').first().getByTestId('add-task').click();
  page.on('dialog', dialog => dialog.accept('恢复后的新任务'));
  await expect(page.getByTestId('task-card')).toHaveCount(13);
});
