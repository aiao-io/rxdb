import { test as base, expect, type Page } from '@playwright/test';
import { APP_BASE_URL } from './env';

/**
 * 看板 demo 闭环（US-540 阶段 A AC#2～8，看板 v2 交互）：
 * 每个用例都在全新浏览器上下文从启动页开始（种子 / 空库初态按 AC 各自指定），
 * 拖拽用真实拖拽且拖后刷新读回（US-028 AC#18 先例）。全程不出现浏览器原生弹窗。
 */

/** 每个用例一个全新浏览器上下文（干净 IndexedDB / localStorage 初态）。 */
const test = base.extend<{ boardPage: Page }>({
  boardPage: async ({ browser }, use) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    // 看板 v2 不再使用 prompt / confirm：出现即记录并关闭，收尾断言为空
    const nativeDialogs: string[] = [];
    page.on('dialog', dialog => {
      nativeDialogs.push(`${dialog.type()} ${dialog.message()}`);
      void dialog.dismiss();
    });
    await page.goto(APP_BASE_URL);
    await use(page);
    await context.close();
    expect(nativeDialogs).toEqual([]);
  }
});

/** 模拟丢库：清掉站点数据（localStorage + IndexedDB）。 */
const clearSiteData = async (page: Page): Promise<void> => {
  await page.evaluate(async () => {
    localStorage.clear();
    for (const db of await indexedDB.databases()) {
      indexedDB.deleteDatabase(db.name ?? '');
    }
  });
};

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
  return (await column.getByTestId('task-title').allTextContents()).map(text => text.trim());
};

const columnHeader = (page: Page, title: string) =>
  page.getByTestId('column-header').filter({ has: page.getByTestId('column-title').getByText(title, { exact: true }) });

/** 打开任务卡片菜单（悬停 / 聚焦才显示的 `…`）。 */
const openTaskMenu = async (page: Page, title: string): Promise<void> => {
  const card = page.getByTestId('task-card').filter({ hasText: title });
  await card.hover();
  await card.getByTestId('task-menu-trigger').click();
};

/** 从看板菜单导出备份（触发下载），返回归档路径。 */
const exportBackup = async (page: Page): Promise<string> => {
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('board-menu-trigger').click();
  await page.getByTestId('export-backup').click();
  const archivePath = await (await downloadPromise).path();
  expect(archivePath).toBeTruthy();
  return archivePath!;
};

test('AC#2：启动页新建空看板 → 建板/列/任务 → 第二板切换 → 重开原样；种子板与用户新板并存', async ({
  boardPage: page
}) => {
  await expect(page.getByTestId('startup-page')).toBeVisible();

  // 新建空看板路径：建板（对话框）→ 建列（列尾就地输入）→ 列底建任务 → 第二块板
  await page.getByTestId('start-empty').click();
  await expect(page.getByTestId('empty-board')).toBeVisible();
  await page.getByTestId('create-board-empty').click();
  await page.getByTestId('board-composer-input').fill('我的看板');
  await page.getByTestId('board-composer-input').press('Enter');
  await expect(page.getByTestId('rename-board')).toHaveText('我的看板');
  await page.getByTestId('create-column').click();
  await page.getByTestId('column-composer-input').fill('待办');
  await page.getByTestId('column-composer-input').press('Enter');
  await expect(page.getByTestId('column')).toHaveCount(1);
  await page.getByTestId('add-task').click();
  await page.getByTestId('add-task-input').fill('第一件事');
  await page.getByTestId('add-task-input').press('Enter');
  await expect(page.getByTestId('task-card')).toHaveCount(1);
  await expect(page.getByTestId('task-title')).toHaveText('第一件事');

  // 第二板：新建后直接切到新板；切回原板不混数据
  await page.getByTestId('create-board').click();
  await page.getByTestId('board-composer-input').fill('第二块板');
  await page.getByTestId('board-composer-submit').click();
  await expect(page.getByTestId('rename-board')).toHaveText('第二块板');
  await expect(page.getByTestId('column')).toHaveCount(0);
  await page.getByTestId('board-selector').selectOption({ label: '我的看板' });
  await expect(page.getByTestId('task-card')).toHaveCount(1);

  // 重开：板 / 列 / 任务 / 顺序原样
  await page.reload();
  await expect(page.getByTestId('task-card')).toHaveCount(1);
  await expect(page.getByTestId('task-title')).toHaveText('第一件事');

  // 种子板与用户新板并存：外壳重置为演示数据走新库（应用内确认）
  await page.getByTestId('reset-demo').click();
  await page.getByTestId('host-confirm-yes').click();
  await expect(page.getByTestId('column')).toHaveCount(4, { timeout: 30000 });
  await expect(page.getByTestId('task-card')).toHaveCount(12);
});

test('AC#2 附：连续两次重置为演示数据都成功（库名回绕防回归）；取消零写', async ({ boardPage: page }) => {
  await startWithSeed(page);

  await page.getByTestId('reset-demo').click();
  await page.getByTestId('host-confirm-no').click();
  await expect(page.getByTestId('host-confirm')).toHaveCount(0);

  // 第一次重置：restore-0 已被种子占用，新库避让到下一个空位
  await page.getByTestId('reset-demo').click();
  await page.getByTestId('host-confirm-yes').click();
  await expect(page.getByTestId('column')).toHaveCount(4, { timeout: 30000 });
  await expect(page.getByTestId('task-card')).toHaveCount(12);

  // 第二次重置：避让现存 IndexedDB 库后应再次成功
  await page.getByTestId('reset-demo').click();
  await page.getByTestId('host-confirm-yes').click();
  await expect(page.getByTestId('column')).toHaveCount(4, { timeout: 30000 });
  await expect(page.getByTestId('task-card')).toHaveCount(12);
});

test('AC#3：真实拖拽——跨列两邻之间、空列、同列改序，每次拖后刷新读回', async ({ boardPage: page }) => {
  await startWithSeed(page);

  // 跨列：把 To do 第一张卡「修复登录 bug」拖到 Doing 的「树拖拽落点修复」之上
  const source = page.getByTestId('task-card').filter({ hasText: '修复登录 bug' });
  const target = page.getByTestId('task-card').filter({ hasText: '树拖拽落点修复' });
  await source.dragTo(target, { targetPosition: { x: 10, y: 5 } });
  // 先断言落点再 reload：固定 sleep 在慢盘下可能读到未提交的旧序（假红）
  await expect.poll(async () => (await titlesOfColumn(page, 'Doing'))[0]).toBe('修复登录 bug');
  await page.reload();
  await expect(page.getByTestId('board-view')).toBeVisible();
  await expect(page.getByTestId('task-card')).toHaveCount(12);
  expect((await titlesOfColumn(page, 'Doing'))[0]).toBe('修复登录 bug');
  expect(await titlesOfColumn(page, 'To do')).not.toContain('修复登录 bug');

  // 空列：拖「写发布说明」到 Ideas（空列）
  const toIdeas = page.getByTestId('task-card').filter({ hasText: '写发布说明' });
  const ideasColumn = page
    .getByTestId('column')
    .filter({ has: page.getByTestId('column-title').getByText('Ideas', { exact: true }) });
  await toIdeas.dragTo(ideasColumn.getByTestId('add-task'));
  await expect.poll(async () => titlesOfColumn(page, 'Ideas')).toEqual(['写发布说明']);
  await page.reload();
  await expect(page.getByTestId('board-view')).toBeVisible();
  await expect(page.getByTestId('task-card')).toHaveCount(12);
  expect(await titlesOfColumn(page, 'Ideas')).toEqual(['写发布说明']);

  // 同列改序：把 To do 的「整理同步迁移指南」拖到「同步插件适配 Supabase」之上
  const moved = page.getByTestId('task-card').filter({ hasText: '整理同步迁移指南' });
  const over = page.getByTestId('task-card').filter({ hasText: '同步插件适配 Supabase' });
  await moved.dragTo(over, { targetPosition: { x: 10, y: 5 } });
  await expect.poll(async () => (await titlesOfColumn(page, 'To do'))[0]).toBe('整理同步迁移指南');
  await page.reload();
  await expect(page.getByTestId('board-view')).toBeVisible();
  await expect(page.getByTestId('task-card')).toHaveCount(12);
  expect((await titlesOfColumn(page, 'To do'))[0]).toBe('整理同步迁移指南');
});

test('AC#4：详情即改即存——每次改动一个事务，逐次撤销 / 重放；刷新后不可撤销', async ({ boardPage: page }) => {
  await startWithSeed(page);
  // 种子的写入也异步进撤销栈：先 reload 清空会话历史，避免 undo 弹到种子条目
  await page.reload();
  await expect(page.getByTestId('board-view')).toBeVisible();
  const detail = page.getByTestId('detail-panel');
  await page.getByTestId('task-card').filter({ hasText: '修复登录 bug' }).getByTestId('task-title').click();
  await expect(detail).toBeVisible();

  // 两次独立改动：标题（回车提交）与截止日（选择即提交）
  await detail.getByTestId('detail-title').fill('修复登录 bug（已改）');
  await detail.getByTestId('detail-title').press('Enter');
  await expect(page.getByTestId('task-card').filter({ hasText: '修复登录 bug（已改）' })).toBeVisible();
  await detail.getByTestId('detail-due').fill('2026-12-01');
  const card = page.getByTestId('task-card').filter({ hasText: '修复登录 bug（已改）' });
  await expect(card.getByTestId('task-due')).toHaveText(/2026-12-01/);

  // 侧栏内撤销只撤回最近一次改动（截止日），标题保留；侧栏随之读回
  await detail.getByTestId('detail-undo').click();
  await expect(card.getByTestId('task-due')).toHaveText(/2026-11-05/);
  await expect(detail.getByTestId('detail-due')).toHaveValue('2026-11-05');
  await expect(detail.getByTestId('detail-title')).toHaveValue('修复登录 bug（已改）');

  // 关闭侧栏后用页头撤销 / 重做标题
  await detail.getByTestId('detail-close').click();
  await page.getByTestId('undo').click();
  await expect(page.getByTestId('task-card').filter({ hasText: '修复登录 bug（已改）' })).toHaveCount(0);
  await page.getByTestId('redo').click();
  await expect(page.getByTestId('task-card').filter({ hasText: '修复登录 bug（已改）' })).toBeVisible();

  // 刷新后此前的改动不可撤销：撤销入口禁用
  await page.reload();
  await expect(page.getByTestId('undo')).toBeDisabled();
});

test('AC#5 + AC#8：删列（含任务）级联无孤儿；确认清单与取消零写', async ({ boardPage: page }) => {
  await startWithSeed(page);

  // 删除确认清单列任务数；取消零写
  await columnHeader(page, 'Doing').getByTestId('column-menu-trigger').click();
  await page.getByTestId('column-delete').click();
  await expect(page.getByTestId('confirm-delete')).toContainText('4 个任务');
  await page.getByTestId('confirm-delete-no').click();
  await expect(page.getByTestId('column')).toHaveCount(4);

  // 确认级联：删列 → 列与其任务一并删除、无孤儿，其余列不受影响
  await columnHeader(page, 'Doing').getByTestId('column-menu-trigger').click();
  await page.getByTestId('column-delete').click();
  await page.getByTestId('confirm-delete-yes').click();
  await expect(page.getByTestId('column')).toHaveCount(3);
  await expect(page.getByTestId('task-card')).toHaveCount(8);
  await expect(page.getByTestId('board-toast')).toContainText('已删除列「Doing」');
  await page.reload();
  await expect(page.getByTestId('column')).toHaveCount(3);
  await expect(page.getByTestId('task-card')).toHaveCount(8);
});

test('AC#6：导出 → 清站点数据 → 启动页从备份恢复 → 重开数据一致', async ({ boardPage: page }) => {
  await startWithSeed(page);

  // 编辑一条任务，让归档包含用户改动（卡片菜单 → 编辑标题）
  await openTaskMenu(page, '修复登录 bug');
  await page.getByTestId('task-edit-title').click();
  await page.getByTestId('task-title-editor').fill('修复登录 bug（备份版）');
  await page.getByTestId('task-title-save').click();
  await expect(page.getByTestId('task-card').filter({ hasText: '修复登录 bug（备份版）' })).toBeVisible();

  const archivePath = await exportBackup(page);

  // 清掉站点数据（模拟丢库），回到启动页
  await clearSiteData(page);
  await page.reload();
  await expect(page.getByTestId('startup-page')).toBeVisible();

  // 选择前没有连接、没有引擎表或种子：启动页可见即证明（US-537 AC#3）
  await page.getByTestId('restore-file').setInputFiles(archivePath);
  await expect(page.getByTestId('board-view')).toBeVisible({ timeout: 30000 });
  await expect(page.getByTestId('column')).toHaveCount(4);
  await expect(page.getByTestId('task-card')).toHaveCount(12);
  await expect(page.getByTestId('task-card').filter({ hasText: '修复登录 bug（备份版）' })).toBeVisible();

  // 重开保留
  await page.reload();
  await expect(page.getByTestId('task-card').filter({ hasText: '修复登录 bug（备份版）' })).toBeVisible();
});

test('AC#6 附：工具菜单恢复成功路径——已连接库恢复、重载读回、原库保留', async ({ boardPage: page }) => {
  await startWithSeed(page);

  // 编辑一条任务（聚焦卡片按 F2 就地改标题）
  await page.getByTestId('task-card').filter({ hasText: '修复登录 bug' }).focus();
  await page.keyboard.press('F2');
  await page.getByTestId('task-title-editor').fill('修复登录 bug（菜单恢复版）');
  await page.getByTestId('task-title-editor').press('Enter');
  await expect(page.getByTestId('task-card').filter({ hasText: '修复登录 bug（菜单恢复版）' })).toBeVisible();

  const archivePath = await exportBackup(page);

  // 已连接状态下经外壳恢复：应用内确认 → 恢复到新库名 → 整页重载 → 读回成功才切换
  await page.getByTestId('restore-file-menu').setInputFiles(archivePath);
  await page.getByTestId('host-confirm-yes').click();
  await expect(page.getByTestId('board-view')).toBeVisible({ timeout: 30000 });
  await expect(page.getByTestId('task-card')).toHaveCount(12);
  await expect(page.getByTestId('task-card').filter({ hasText: '修复登录 bug（菜单恢复版）' })).toBeVisible();

  // 重开保留
  await page.reload();
  await expect(page.getByTestId('task-card').filter({ hasText: '修复登录 bug（菜单恢复版）' })).toBeVisible();
});

test('AC#8：恢复损坏归档拒绝且原库可继续使用', async ({ boardPage: page }) => {
  await startWithSeed(page);

  // 外壳恢复入口选择损坏文件（不是归档的字节）；已有看板先确认
  await page.getByTestId('restore-file-menu').setInputFiles({
    name: 'broken.rxdb',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from('this is not an archive')
  });
  await page.getByTestId('host-confirm-yes').click();
  await expect(page.getByTestId('app-error')).toBeVisible({ timeout: 30000 });

  // 原库可继续使用：列底建任务照常
  await page.getByTestId('column').first().getByTestId('add-task').click();
  await page.getByTestId('add-task-input').fill('恢复后的新任务');
  await page.getByTestId('add-task-input').press('Enter');
  await expect(page.getByTestId('task-card')).toHaveCount(13);
});

test('看板 v2：筛选条、点击标签即筛选、键盘移动与撤销提示', async ({ boardPage: page }) => {
  await startWithSeed(page);

  // 筛选条：输入令牌即筛，计数与列计数随结果重算
  await page.getByTestId('board-filter-input').fill('label:核心 has:due');
  await expect(page.getByTestId('board-filter-count')).toHaveText('4 项');
  await expect(page.getByTestId('column-count')).toHaveText(['2', '2', '0', '0']);
  await page.getByTestId('board-filter-clear').click();
  await expect(page.getByTestId('task-card')).toHaveCount(12);

  // 点击卡片上的标签即筛选，再点取消
  await page.getByTestId('task-card').filter({ hasText: '写发布说明' }).getByTestId('card-label').click();
  await expect(page.getByTestId('board-filter-input')).toHaveValue('label:文档');
  await expect(page.getByTestId('task-card')).toHaveCount(2);
  await page.getByTestId('task-card').filter({ hasText: '写发布说明' }).getByTestId('card-label').click();
  await expect(page.getByTestId('task-card')).toHaveCount(12);

  // 键盘：聚焦卡片，Alt+→ 移到相邻列，焦点跟随；提示条撤销还原
  await page.getByTestId('task-card').filter({ hasText: '修复登录 bug' }).focus();
  await page.keyboard.press('Alt+ArrowRight');
  await expect.poll(async () => (await titlesOfColumn(page, 'Doing'))[0]).toBe('修复登录 bug');
  await expect(page.getByTestId('task-card').filter({ hasText: '修复登录 bug' })).toBeFocused();
  await expect(page.getByTestId('board-toast')).toContainText('已移动到「Doing」');
  await page.getByTestId('board-toast-undo').click();
  await expect.poll(async () => (await titlesOfColumn(page, 'To do'))[0]).toBe('修复登录 bug');
});
