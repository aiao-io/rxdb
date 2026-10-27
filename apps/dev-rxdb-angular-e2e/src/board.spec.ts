import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { test as base, expect } from './fixtures.js';

/**
 * 看板页三端对齐验收（US-539，看板 v2 交互）：每个用例都在全新浏览器上下文进入 `/board`
 * （干净 IndexedDB / localStorage 初态），拖拽用真实拖拽且拖后刷新读回（US-028 AC#18 先例），
 * 种子来自「装载演示数据」入口（US-540 同一份确定性种子）。全程不出现浏览器原生弹窗。
 *
 * 本文件与 dev-rxdb-react-e2e / dev-rxdb-vue-e2e 的副本内容一致，只允许一处差异：
 * Angular 端从 `./fixtures.js` 取 test / expect（US-909 失败归档守卫），React / Vue 从
 * `@playwright/test` 取。三端 DOM 契约（类名 + data-testid）同构，改一处改三处。
 */

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
    await expect(page.getByTestId('board-view')).toBeVisible();
    await use(page);
    await context.close();
    expect(nativeDialogs).toEqual([]);
  }
});

/** 经宿主入口装载演示数据（只进空库），等种子渲染完成。 */
const startWithSeed = async (page: Page): Promise<void> => {
  await page.getByTestId('seed-demo').click();
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

const columnOf = (page: Page, title: string) =>
  page.getByTestId('column').filter({ has: page.getByTestId('column-title').getByText(title, { exact: true }) });

const openColumnMenu = async (page: Page, title: string): Promise<void> => {
  await columnOf(page, title).getByTestId('column-menu-trigger').click();
};

const openTaskMenu = async (page: Page, title: string): Promise<void> => {
  const card = page.getByTestId('task-card').filter({ hasText: title });
  await card.hover();
  await card.getByTestId('task-menu-trigger').click();
};

const openDetail = async (page: Page, title: string) => {
  await page.getByTestId('task-card').filter({ hasText: title }).getByTestId('task-title').click();
  const detail = page.getByTestId('detail-panel');
  await expect(detail).toBeVisible();
  return detail;
};

/** 关闭当前打开的对话框 / 侧栏（Esc 由内向外）。 */
const pressEscape = async (page: Page): Promise<void> => {
  await page.keyboard.press('Escape');
};

test.describe('看板页对齐（US-539，看板 v2）', () => {
  test('AC#1：装载演示数据——列头、任务、标签与截止日与种子一致，重开后原样', async ({ boardPage: page }) => {
    await expect(page.getByTestId('empty-board')).toBeVisible();
    await startWithSeed(page);

    await expect(page.getByTestId('column-title')).toHaveText(['To do', 'Doing', 'Done', 'Ideas']);
    await expect(page.getByTestId('column-count')).toHaveText(['5', '4', '3', '0']);
    const firstCard = page.getByTestId('task-card').filter({ hasText: '修复登录 bug' });
    await expect(firstCard.getByTestId('task-due')).toHaveText(/2026-11-05/);
    await expect(firstCard.getByTestId('card-label')).toHaveText('核心');

    // 板级标签收在「标签」对话框里
    await page.getByTestId('labels-open').click();
    await expect(page.getByTestId('label-chip')).toHaveText(['核心', '文档', '测试', '发布']);
    await pressEscape(page);
    await expect(page.getByTestId('label-manager')).toHaveCount(0);

    await page.reload();
    await expect(page.getByTestId('board-view')).toBeVisible();
    await expect(page.getByTestId('task-card')).toHaveCount(12);
    expect(await titlesOfColumn(page, 'To do')).toEqual([
      '修复登录 bug',
      '写发布说明',
      '同步插件适配 Supabase',
      '回归测试：工作树同步',
      '整理同步迁移指南'
    ]);
  });

  test('AC#2：真实拖拽——跨列两邻之间、空列、同列改序，每次拖后刷新读回', async ({ boardPage: page }) => {
    await startWithSeed(page);

    const source = page.getByTestId('task-card').filter({ hasText: '修复登录 bug' });
    const target = page.getByTestId('task-card').filter({ hasText: '树拖拽落点修复' });
    await source.dragTo(target, { targetPosition: { x: 10, y: 5 } });
    await expect(columnOf(page, 'Doing').getByTestId('task-title').first()).toHaveText('修复登录 bug');
    await page.reload();
    await expect(page.getByTestId('task-card')).toHaveCount(12);
    expect(await titlesOfColumn(page, 'Doing')).toEqual([
      '修复登录 bug',
      '树拖拽落点修复',
      '同步水位线调优',
      'DevTools 同步面板重构',
      '补齐三端对称'
    ]);
    expect(await titlesOfColumn(page, 'To do')).not.toContain('修复登录 bug');

    const toIdeas = page.getByTestId('task-card').filter({ hasText: '写发布说明' });
    await toIdeas.dragTo(columnOf(page, 'Ideas').getByTestId('add-task'), { sourcePosition: { x: 10, y: 5 } });
    await expect(columnOf(page, 'Ideas').getByTestId('task-title')).toHaveText('写发布说明');
    await page.reload();
    await expect(page.getByTestId('task-card')).toHaveCount(12);
    expect(await titlesOfColumn(page, 'Ideas')).toEqual(['写发布说明']);

    const moved = page.getByTestId('task-card').filter({ hasText: '整理同步迁移指南' });
    const over = page.getByTestId('task-card').filter({ hasText: '同步插件适配 Supabase' });
    await moved.dragTo(over, { targetPosition: { x: 10, y: 5 } });
    await expect(columnOf(page, 'To do').getByTestId('task-title').first()).toHaveText('整理同步迁移指南');
    await page.reload();
    await expect(page.getByTestId('task-card')).toHaveCount(12);
    expect(await titlesOfColumn(page, 'To do')).toEqual([
      '整理同步迁移指南',
      '同步插件适配 Supabase',
      '回归测试：工作树同步'
    ]);
  });

  test('AC#3：卡片就地改标题保存 / 取消；详情即改即存标题 / 描述 / 截止日 / 标签并重开读回', async ({
    boardPage: page
  }) => {
    await startWithSeed(page);
    const card = page.getByTestId('task-card').filter({ hasText: '写发布说明' });

    // 卡片菜单 → 编辑标题：取消零写；保存生效
    await openTaskMenu(page, '写发布说明');
    await page.getByTestId('task-edit-title').click();
    await page.getByTestId('task-title-editor').fill('写发布说明（取消）');
    await page.getByTestId('task-title-cancel').click();
    await expect(card.getByTestId('task-title')).toHaveText('写发布说明');
    await card.focus();
    await page.keyboard.press('F2');
    await page.getByTestId('task-title-editor').fill('写发布说明 v2');
    await page.getByTestId('task-title-save').click();
    await expect(page.getByTestId('task-card').filter({ hasText: '写发布说明 v2' })).toBeVisible();

    // 详情即改即存：标题回车、描述失焦、截止日选择、标签选择器关闭时提交
    const detail = await openDetail(page, '写发布说明 v2');
    await detail.getByTestId('detail-title').fill('写发布说明 v3');
    await detail.getByTestId('detail-title').press('Enter');
    await detail.getByTestId('detail-description').fill('三端对齐的详情描述');
    await detail.getByTestId('detail-description').press('Tab');
    await detail.getByTestId('detail-due').fill('2026-12-31');
    await detail.getByTestId('detail-labels').click();
    await page.getByTestId('picker-option').filter({ hasText: '测试' }).click();
    await pressEscape(page);
    const saved = page.getByTestId('task-card').filter({ hasText: '写发布说明 v3' });
    await expect(saved.getByTestId('task-due')).toHaveText(/2026-12-31/);
    await expect(saved.getByTestId('card-label')).toHaveText(['文档', '测试']);

    await page.reload();
    const reopened = await openDetail(page, '写发布说明 v3');
    await expect(reopened.getByTestId('detail-title')).toHaveValue('写发布说明 v3');
    await expect(reopened.getByTestId('detail-description')).toHaveValue('三端对齐的详情描述');
    await expect(reopened.getByTestId('detail-due')).toHaveValue('2026-12-31');
    await expect(reopened.getByTestId('detail-label')).toHaveText(['文档', '测试']);

    // 空标题被领域拒绝：提示并保留草稿，库中标题不变
    await reopened.getByTestId('detail-title').fill('   ');
    await reopened.getByTestId('detail-title').press('Enter');
    await expect(page.getByTestId('board-notice')).toBeVisible();
    await expect(reopened.getByTestId('detail-title')).toHaveValue('   ');
    await expect(page.getByTestId('task-card').filter({ hasText: '写发布说明 v3' })).toBeVisible();
    // 提示浮在侧栏之上：侧栏开着也能直接关掉；关提示不抢焦点，草稿不会因失焦被再次提交
    await page.getByTestId('board-notice-close').click();
    await expect(page.getByTestId('board-notice')).toHaveCount(0);
    await expect(reopened.getByTestId('detail-title')).toBeFocused();
  });

  test('AC#6：axe 无违规；键盘等价路径——列左移 / 右移、方向键导航、移到列与 Alt + 方向键', async ({
    boardPage: page
  }) => {
    await startWithSeed(page);
    const results = await new AxeBuilder({ page }).include('[data-testid="board-view"]').analyze();
    expect(results.violations).toEqual([]);

    // 列：首列「左移」禁用并写明原因；右移 / 左移改序；undo 还原
    await openColumnMenu(page, 'To do');
    await expect(page.getByTestId('column-move-back')).toBeDisabled();
    await expect(page.getByTestId('column-move-back')).toContainText('已是最左列');
    await pressEscape(page);
    await openColumnMenu(page, 'Doing');
    await page.getByTestId('column-move-forward').click();
    await expect(page.getByTestId('column-title')).toHaveText(['To do', 'Done', 'Doing', 'Ideas']);
    await page.getByTestId('undo').click();
    await expect(page.getByTestId('column-title')).toHaveText(['To do', 'Doing', 'Done', 'Ideas']);

    // 方向键在卡片间移动焦点
    await page.getByTestId('task-card').filter({ hasText: '修复登录 bug' }).focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByTestId('task-card').filter({ hasText: '写发布说明' })).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('task-card').filter({ hasText: '同步水位线调优' })).toBeFocused();

    // 卡片菜单「移到列…」：可搜索选择器，移到目标列末尾，焦点落在被移动卡片
    await openTaskMenu(page, '修复登录 bug');
    await page.getByTestId('task-move-to-column').click();
    await page.getByTestId('picker-filter').fill('Doi');
    await page.getByTestId('picker-filter').press('Enter');
    await expect.poll(async () => (await titlesOfColumn(page, 'Doing')).at(-1)).toBe('修复登录 bug');
    await expect(page.getByTestId('task-card').filter({ hasText: '修复登录 bug' })).toBeFocused();

    // Alt + ↑ 在列内上移；刷新后保留
    await page.keyboard.press('Alt+ArrowUp');
    await expect.poll(async () => (await titlesOfColumn(page, 'Doing')).at(-2)).toBe('修复登录 bug');
    await page.reload();
    await expect(page.getByTestId('task-card')).toHaveCount(12);
    expect((await titlesOfColumn(page, 'Doing')).at(-2)).toBe('修复登录 bug');
  });

  test('AC#7：空库闭环——建板 / 建列 / 建任务、第二块板切换、重开原样', async ({ boardPage: page }) => {
    await expect(page.getByTestId('empty-board')).toBeVisible();

    await page.getByTestId('create-board-empty').click();
    await page.getByTestId('board-composer-input').fill('我的看板');
    await page.getByTestId('board-composer-submit').click();
    await expect(page.getByTestId('rename-board')).toHaveText('我的看板');
    await expect(page.getByTestId('column')).toHaveCount(0);
    await page.getByTestId('create-column').click();
    await page.getByTestId('column-composer-input').fill('待办');
    await page.getByTestId('column-composer-submit').click();
    await expect(page.getByTestId('column')).toHaveCount(1);
    // 列底建任务：Esc 取消零写，Enter 提交且输入框保持打开
    await page.getByTestId('add-task').click();
    await page.getByTestId('add-task-input').fill('第一件事');
    await page.getByTestId('add-task-input').press('Escape');
    await expect(page.getByTestId('task-card')).toHaveCount(0);
    await page.getByTestId('add-task').click();
    await page.getByTestId('add-task-input').fill('第一件事');
    await page.getByTestId('add-task-input').press('Enter');
    await expect(page.getByTestId('task-card')).toHaveCount(1);
    await expect(page.getByTestId('add-task-input')).toBeFocused();

    // 第二块板：新建后直接切到新板；切回不混数据
    await page.getByTestId('create-board').click();
    await page.getByTestId('board-composer-input').fill('第二块板');
    await page.getByTestId('board-composer-input').press('Enter');
    await expect(page.getByTestId('rename-board')).toHaveText('第二块板');
    await expect(page.getByTestId('column')).toHaveCount(0);
    await page.getByTestId('board-selector').selectOption({ label: '我的看板' });
    await expect(page.getByTestId('task-card')).toHaveCount(1);

    await page.reload();
    await expect(page.getByTestId('task-card')).toHaveCount(1);
    await expect(page.getByTestId('task-title')).toHaveText('第一件事');
  });

  test('AC#8：删除确认——取消零写；确认后级联数量正确且另一板不变；重开不复活', async ({ boardPage: page }) => {
    await startWithSeed(page);
    await page.getByTestId('create-board').click();
    await page.getByTestId('board-composer-input').fill('备份板');
    await page.getByTestId('board-composer-submit').click();
    await expect(page.getByTestId('rename-board')).toHaveText('备份板');
    await page.getByTestId('board-selector').selectOption({ label: 'rxdb 1.0 发布计划' });
    await expect(page.getByTestId('task-card')).toHaveCount(12);

    // 删任务：详情侧栏删除入口，取消零写，确认后卡片消失且详情关闭
    const detail = await openDetail(page, '写发布说明');
    await detail.getByTestId('detail-delete').click();
    await expect(page.getByTestId('confirm-delete')).toContainText('写发布说明');
    await page.getByTestId('confirm-delete-no').click();
    await expect(page.getByTestId('task-card')).toHaveCount(12);
    await detail.getByTestId('detail-delete').click();
    await page.getByTestId('confirm-delete-yes').click();
    await expect(page.getByTestId('task-card')).toHaveCount(11);
    await expect(detail).toHaveCount(0);

    // 删列：列菜单，确认清单含列内任务数
    await openColumnMenu(page, 'Doing');
    await page.getByTestId('column-delete').click();
    await expect(page.getByTestId('confirm-delete')).toContainText('4 个任务');
    await page.getByTestId('confirm-delete-no').click();
    await expect(page.getByTestId('column')).toHaveCount(4);
    await openColumnMenu(page, 'Doing');
    await page.getByTestId('column-delete').click();
    await page.getByTestId('confirm-delete-yes').click();
    await expect(page.getByTestId('column')).toHaveCount(3);
    await expect(page.getByTestId('task-card')).toHaveCount(7);

    // 删板：看板菜单；确认后自动选择剩余板，另两块板不受影响，重开不复活
    await page.getByTestId('board-menu-trigger').click();
    await page.getByTestId('delete-board').click();
    await expect(page.getByTestId('confirm-delete')).toContainText('3 列');
    await page.getByTestId('confirm-delete-yes').click();
    await expect(page.getByTestId('board-selector').locator('option')).toHaveCount(2);
    await expect(page.getByTestId('board-selector').locator('option:checked')).toHaveText('引擎研究草稿');
    await expect(page.getByTestId('task-card')).toHaveCount(8);
    await page.getByTestId('board-selector').selectOption({ label: '备份板' });
    await expect(page.getByTestId('column')).toHaveCount(0);
    await page.getByTestId('board-selector').selectOption({ label: '引擎研究草稿' });
    await page.reload();
    await expect(page.getByTestId('task-card')).toHaveCount(8);
  });

  test('AC#10：标签管理——新建（预设色）/ 同板重名拒绝 / 改名改色 / 删除确认，引用卡片同步，他板不受影响、刷新后保留', async ({
    boardPage: page
  }) => {
    await startWithSeed(page);
    await page.getByTestId('labels-open').click();
    await page.getByTestId('create-label').click();
    await page.getByTestId('label-name-input').fill('性能');
    await page.getByTestId('label-color-option').nth(7).click();
    await page.getByTestId('label-editor-save').click();
    await expect(page.getByTestId('label-chip')).toHaveText(['核心', '文档', '测试', '发布', '性能']);

    // 同板重名：领域拒绝并保留草稿；提示浮在遮罩之上，对话框开着也能直接关掉
    await page.getByTestId('create-label').click();
    await page.getByTestId('label-name-input').fill('性能');
    await page.getByTestId('label-editor-save').click();
    await expect(page.getByTestId('board-notice')).toContainText('同板已存在同名标签');
    await expect(page.getByTestId('label-name-input')).toHaveValue('性能');
    await page.getByTestId('board-notice-close').click();
    await expect(page.getByTestId('board-notice')).toHaveCount(0);
    await page.getByTestId('label-editor-cancel').click();
    await expect(page.getByTestId('label-chip')).toHaveCount(5);

    // 改名改色：引用卡片同步
    await page.getByTestId('label-row').filter({ hasText: '核心' }).getByTestId('label-edit').click();
    await page.getByTestId('label-name-input').fill('Core');
    await page.getByTestId('label-color-input').fill('#0969da');
    await page.getByTestId('label-editor-save').click();
    await pressEscape(page);
    const card = page.getByTestId('task-card').filter({ hasText: '修复登录 bug' });
    await expect(card.getByTestId('card-label')).toHaveText('Core');
    // 改名与改色是两个事务：用会自动重试的断言等颜色落定
    await expect(card.getByTestId('card-label')).toHaveCSS('background-color', 'rgb(9, 105, 218)');

    // 删除：先取消零写，再确认，引用全部清除
    await page.getByTestId('labels-open').click();
    await page.getByTestId('label-row').filter({ hasText: 'Core' }).getByTestId('label-delete').click();
    await page.getByTestId('confirm-delete-no').click();
    await expect(page.getByTestId('label-chip')).toHaveCount(5);
    await page.getByTestId('label-row').filter({ hasText: 'Core' }).getByTestId('label-delete').click();
    await page.getByTestId('confirm-delete-yes').click();
    await expect(page.getByTestId('label-chip')).toHaveCount(4);
    await pressEscape(page);
    await expect(card.getByTestId('card-label')).toHaveCount(0);

    // 他板不受影响：隔离板可建同名标签；切回本板刷新，标签与引用保持删除后的状态
    await page.getByTestId('board-selector').selectOption({ label: '引擎研究草稿' });
    await page.getByTestId('labels-open').click();
    await page.getByTestId('create-label').click();
    await page.getByTestId('label-name-input').fill('文档');
    await page.getByTestId('label-editor-save').click();
    await expect(page.getByTestId('label-chip')).toHaveText(['文档']);
    await pressEscape(page);
    await page.getByTestId('board-selector').selectOption({ label: 'rxdb 1.0 发布计划' });
    await expect(page.getByTestId('task-card')).toHaveCount(12);
    await page.reload();
    await expect(page.getByTestId('task-card')).toHaveCount(12);
    await page.getByTestId('labels-open').click();
    await expect(page.getByTestId('label-chip')).toHaveText(['文档', '测试', '发布', '性能']);
    await pressEscape(page);
    await expect(card.getByTestId('card-label')).toHaveCount(0);

    // 给任务移除标签：选择器里取消勾选，关闭时提交；刷新后保留
    const docCard = page.getByTestId('task-card').filter({ hasText: '写发布说明' });
    const detail = await openDetail(page, '写发布说明');
    await detail.getByTestId('detail-labels').click();
    await page.getByTestId('picker-option').filter({ hasText: '文档' }).click();
    await pressEscape(page);
    await expect(docCard.getByTestId('card-label')).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId('task-card')).toHaveCount(12);
    await expect(docCard.getByTestId('card-label')).toHaveCount(0);
  });

  test('AC#11：每次改动一个事务——逐次撤销 / 重做；新编辑清空 redo；重开后不可撤销', async ({ boardPage: page }) => {
    await startWithSeed(page);
    // 种子的写入也异步进撤销栈：先 reload 清空会话历史
    await page.reload();
    await expect(page.getByTestId('task-card')).toHaveCount(12);
    const card = page.getByTestId('task-card').filter({ hasText: '修复登录 bug' });

    const detail = await openDetail(page, '修复登录 bug');
    await detail.getByTestId('detail-title').fill('修复登录 bug 改');
    await detail.getByTestId('detail-title').press('Enter');
    await expect(card.getByTestId('task-title')).toHaveText('修复登录 bug 改');
    await detail.getByTestId('detail-labels').click();
    await page.getByTestId('picker-option').filter({ hasText: '文档' }).click();
    await pressEscape(page);
    await expect(card.getByTestId('card-label')).toHaveText(['核心', '文档']);
    await detail.getByTestId('detail-due').fill('2026-12-01');
    await expect(card.getByTestId('task-due')).toHaveText('2026-12-01');
    await detail.getByTestId('detail-close').click();

    for (let step = 0; step < 3; step++) await page.getByTestId('undo').click();
    await expect(card.getByTestId('task-title')).toHaveText('修复登录 bug');
    await expect(card.getByTestId('task-due')).toHaveText(/2026-11-05/);
    await expect(card.getByTestId('card-label')).toHaveText(['核心']);
    await expect(page.getByTestId('redo')).toBeEnabled();

    for (let step = 0; step < 3; step++) await page.getByTestId('redo').click();
    await expect(card.getByTestId('task-title')).toHaveText('修复登录 bug 改');
    await expect(card.getByTestId('task-due')).toHaveText('2026-12-01');
    await expect(page.getByTestId('redo')).toBeDisabled();

    // 新编辑清空 redo
    await page.getByTestId('undo').click();
    await expect(page.getByTestId('redo')).toBeEnabled();
    const again = await openDetail(page, '修复登录 bug 改');
    await again.getByTestId('detail-title').fill('修复登录 bug 终');
    await again.getByTestId('detail-title').press('Enter');
    await expect(page.getByTestId('task-card').filter({ hasText: '修复登录 bug 终' })).toBeVisible();
    await again.getByTestId('detail-close').click();
    await expect(page.getByTestId('redo')).toBeDisabled();

    await page.reload();
    await expect(page.getByTestId('board-view')).toBeVisible();
    await expect(page.getByTestId('undo')).toBeDisabled();
    await expect(page.getByTestId('redo')).toBeDisabled();
  });

  test('AC#14：本列排序——按截止日排序、已排好提示无变化、一次 undo 还原整列', async ({ boardPage: page }) => {
    await startWithSeed(page);
    await page.reload();
    await expect(page.getByTestId('task-card')).toHaveCount(12);

    await openColumnMenu(page, 'To do');
    await page.getByTestId('column-sort-due').click();
    const sorted = ['修复登录 bug', '同步插件适配 Supabase', '回归测试：工作树同步', '整理同步迁移指南', '写发布说明'];
    await expect(columnOf(page, 'To do').getByTestId('task-title')).toHaveText(sorted);
    await expect(page.getByTestId('board-toast')).toContainText('已按截止日排序');

    await openColumnMenu(page, 'To do');
    await page.getByTestId('column-sort-due').click();
    await expect(page.getByTestId('board-toast')).toContainText('无变化');
    await expect(columnOf(page, 'To do').getByTestId('task-title')).toHaveText(sorted);
    await page.getByTestId('undo').click();
    await expect(columnOf(page, 'To do').getByTestId('task-title')).toHaveText(
      ['修复登录 bug', '写发布说明', '同步插件适配 Supabase', '回归测试：工作树同步', '整理同步迁移指南'],
      { timeout: 15000 }
    );
  });

  test('AC#15：板内搜索——命中片段与所在列、点结果定位高亮（US-539 阶段 B）', async ({ boardPage: page }) => {
    await startWithSeed(page);

    await page.getByTestId('search-open').click();
    const input = page.getByTestId('board-search-input');
    await input.fill('登录');
    const result = page.getByTestId('board-search-result').filter({ hasText: '修复登录 bug' });
    await expect(result).toHaveCount(1);
    await expect(result.getByText('To do')).toBeVisible();

    // 点结果：关闭对话框，目标卡片滚动可见、获得焦点并短暂高亮
    await result.click();
    await expect(page.getByTestId('board-search')).toHaveCount(0);
    const card = page.getByTestId('task-card').filter({ hasText: '修复登录 bug' });
    await expect(card).toHaveClass(/search-hit/);
    await expect(card).toBeInViewport();
    await expect(card).toBeFocused();

    // ⌘K 重新打开：清空退出搜索态
    await page.keyboard.press('ControlOrMeta+k');
    await expect(page.getByTestId('board-search-input')).toHaveValue('登录');
    await page.getByTestId('board-search-input').fill('');
    await expect(page.getByTestId('board-search-results')).toHaveCount(0);
    await expect(card).not.toHaveClass(/search-hit/, { timeout: 5000 });
  });

  test('AC#16：多板同词隔离与分页——异板高排位不挤空当前板，切板只显所选板（US-539 阶段 B）', async ({
    boardPage: page
  }) => {
    await startWithSeed(page);

    await page.getByTestId('search-open').click();
    await page.getByTestId('board-search-input').fill('同步');
    await expect(page.getByTestId('board-search-result')).toHaveCount(5);
    const expectedMain = new Set([
      '同步插件适配 Supabase',
      '整理同步迁移指南',
      '回归测试：工作树同步',
      '同步水位线调优',
      'DevTools 同步面板重构',
      '全量同步测试门禁接通'
    ]);
    const titlesOf = async (): Promise<string[]> =>
      (await page.getByTestId('board-search-result').locator('.rxb-search-result-title').allTextContents()).map(text =>
        text.trim()
      );
    const firstPage = await titlesOf();
    expect(new Set(firstPage).size).toBe(5);
    for (const title of firstPage) {
      expect(expectedMain.has(title), `首屏结果标题：${JSON.stringify(firstPage)}`).toBe(true);
    }
    await page.getByTestId('board-search-more').click();
    await expect(page.getByTestId('board-search-result')).toHaveCount(6);
    expect(new Set(await titlesOf())).toEqual(expectedMain);

    // 切到隔离板：查询保留，结果只来自隔离板
    await pressEscape(page);
    await page.getByTestId('board-selector').selectOption({ label: '引擎研究草稿' });
    await page.getByTestId('search-open').click();
    await expect(page.getByTestId('board-search-result')).toHaveCount(5);
    await page.getByTestId('board-search-more').click();
    await expect(page.getByTestId('board-search-result')).toHaveCount(8);
    const titles = await page.getByTestId('board-search-result').allTextContents();
    expect(titles.every(text => text.includes('同步'))).toBe(true);
  });

  test('筛选条（看板 v2 阶段 2）：令牌补全、计数重算、点击卡片标签即筛选、否定与清除', async ({ boardPage: page }) => {
    await startWithSeed(page);
    const filter = page.getByTestId('board-filter-input');

    // `/` 聚焦筛选；补全先给字段再给取值
    // 点列区空白处（不可聚焦）：焦点回到 body，全局快捷键生效
    await page.getByTestId('columns').click({ position: { x: 4, y: 4 } });
    await page.keyboard.press('/');
    await expect(filter).toBeFocused();
    await page.keyboard.type('la');
    await expect(page.getByTestId('board-filter-suggestion')).toHaveText([/label:/]);
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('board-filter-suggestion').first()).toContainText('核心');
    await page.keyboard.press('Enter');
    await expect(filter).toHaveValue('label:核心 ');
    await expect(page.getByTestId('board-filter-count')).toHaveText('4 项');
    await expect(page.getByTestId('column-count')).toHaveText(['2', '2', '0', '0']);
    await expect(columnOf(page, 'Done').getByTestId('column-empty')).toHaveText('没有匹配筛选的任务');

    // 否定与关键词组合
    await filter.fill('-label:核心 同步');
    await expect(page.getByTestId('task-card')).toHaveCount(4);
    await page.getByTestId('board-filter-clear').click();
    await expect(page.getByTestId('task-card')).toHaveCount(12);

    // 点击卡片上的标签即筛选，再点取消
    const docLabel = page.getByTestId('task-card').filter({ hasText: '写发布说明' }).getByTestId('card-label');
    await docLabel.click();
    await expect(filter).toHaveValue('label:文档');
    await expect(page.getByTestId('task-card')).toHaveCount(2);
    await docLabel.click();
    await expect(filter).toHaveValue('');
    await expect(page.getByTestId('task-card')).toHaveCount(12);

    // 筛选状态下拖拽：邻居按完整序列取，落点正确
    await filter.fill('has:due');
    const source = page.getByTestId('task-card').filter({ hasText: '整理同步迁移指南' });
    const target = page.getByTestId('task-card').filter({ hasText: '同步插件适配 Supabase' });
    await source.dragTo(target, { targetPosition: { x: 10, y: 5 } });
    await page.getByTestId('board-filter-clear').click();
    await expect
      .poll(async () => (await titlesOfColumn(page, 'To do')).slice(0, 4))
      .toEqual(['修复登录 bug', '写发布说明', '整理同步迁移指南', '同步插件适配 Supabase']);

    // 筛选状态下键盘移动（AC#22）：Alt + ↓ 越过被筛掉的「写发布说明」，落到下一张可见卡片之后
    await filter.fill('has:due');
    await page.getByTestId('task-card').filter({ hasText: '修复登录 bug' }).focus();
    await page.keyboard.press('Alt+ArrowDown');
    await expect
      .poll(async () => (await titlesOfColumn(page, 'To do')).slice(0, 2))
      .toEqual(['整理同步迁移指南', '修复登录 bug']);
    await page.getByTestId('board-filter-clear').click();
    await page.reload();
    await expect(page.getByTestId('task-card')).toHaveCount(12);
    expect(await titlesOfColumn(page, 'To do')).toEqual([
      '写发布说明',
      '整理同步迁移指南',
      '修复登录 bug',
      '同步插件适配 Supabase',
      '回归测试：工作树同步'
    ]);
  });

  test('AC#23 / AC#24：Esc 由内向外、快捷键与提示条撤销；弹层 / 对话框 / 侧栏打开时 axe 无违规', async ({
    boardPage: page
  }) => {
    await startWithSeed(page);
    // 种子写入异步进撤销栈：先 reload 清空会话历史，撤销只针对本用例的改动
    await page.reload();
    await expect(page.getByTestId('task-card')).toHaveCount(12);
    const expectNoAxeViolations = async (): Promise<void> => {
      // 侧栏 / 弹层带入场动画：等有限动画播完再扫，半透明的中间帧会被误判为对比度不足
      await page.evaluate(() =>
        Promise.all(
          document
            .getAnimations()
            .filter(animation => animation.effect?.getTiming().iterations !== Infinity)
            .map(animation => animation.finished.catch(() => undefined))
        )
      );
      const results = await new AxeBuilder({ page }).include('[data-testid="board-view"]').analyze();
      expect(results.violations).toEqual([]);
    };
    /** 点列区空白处（不可聚焦）：焦点回到 body，全局快捷键生效。 */
    const blurToBoard = async (): Promise<void> => {
      await page.getByTestId('columns').click({ position: { x: 4, y: 4 } });
    };
    const card = page.getByTestId('task-card').filter({ hasText: '修复登录 bug' });

    // 卡片菜单（弹层）：axe；Esc 关闭并把焦点还给触发器
    await openTaskMenu(page, '修复登录 bug');
    await expect(page.getByTestId('popover')).toBeVisible();
    await expectNoAxeViolations();
    await pressEscape(page);
    await expect(page.getByTestId('popover')).toHaveCount(0);
    await expect(card.getByTestId('task-menu-trigger')).toBeFocused();

    // 详情侧栏 + 标签选择器：axe；Esc 先关选择器、再关侧栏
    const detail = await openDetail(page, '修复登录 bug');
    await expectNoAxeViolations();
    await detail.getByTestId('detail-labels').click();
    await expect(page.getByTestId('picker-filter')).toBeFocused();
    await expectNoAxeViolations();
    await pressEscape(page);
    await expect(page.getByTestId('popover')).toHaveCount(0);
    await expect(detail).toBeVisible();
    await pressEscape(page);
    await expect(page.getByTestId('detail-panel')).toHaveCount(0);

    // `?` 打开快捷键面板（对话框）：axe；Esc 关闭
    await blurToBoard();
    await page.keyboard.press('?');
    await expect(page.getByTestId('shortcuts-dialog')).toBeVisible();
    await expectNoAxeViolations();
    await pressEscape(page);
    await expect(page.getByTestId('shortcuts-dialog')).toHaveCount(0);

    // 移动后提示条带「撤销」；⇧⌘Z 重做、⌘Z 撤销
    await card.focus();
    await page.keyboard.press('Alt+ArrowRight');
    await expect.poll(async () => (await titlesOfColumn(page, 'Doing'))[0]).toBe('修复登录 bug');
    await expect(page.getByTestId('board-toast')).toContainText('已移动到「Doing」');
    await page.getByTestId('board-toast-undo').click();
    await expect.poll(async () => (await titlesOfColumn(page, 'To do'))[0]).toBe('修复登录 bug');
    await blurToBoard();
    await page.keyboard.press('ControlOrMeta+Shift+z');
    await expect.poll(async () => (await titlesOfColumn(page, 'Doing'))[0]).toBe('修复登录 bug');
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(async () => (await titlesOfColumn(page, 'To do'))[0]).toBe('修复登录 bug');
  });

  test('AC#2b：拖拽落点反馈——卡片间插入线、目标列高亮、源卡片半透明、结束清除', async ({ boardPage: page }) => {
    // 落点反馈由 dragstart + dragover 驱动；真实拖放端到端由 AC#2 的 dragTo 覆盖。
    await startWithSeed(page);

    const source = page.getByTestId('task-card').filter({ hasText: '修复登录 bug' });
    const target = page.getByTestId('task-card').filter({ hasText: '树拖拽落点修复' });
    const targetBox = (await target.boundingBox())!;

    await source.dispatchEvent('dragstart');
    await expect(source).toHaveClass(/dragging/);

    await target.dispatchEvent('dragover', { clientX: targetBox.x + 10, clientY: targetBox.y + 5 });
    await expect(target).toHaveClass(/drop-before/);
    // 样式必须真实生效（插入线是伪元素）：类断言之外用 computed style 兜底
    expect(await target.evaluate(el => getComputedStyle(el, '::before').content)).not.toBe('none');
    await expect(columnOf(page, 'Doing')).toHaveClass(/drop-target/);

    await target.dispatchEvent('dragover', {
      clientX: targetBox.x + 10,
      clientY: targetBox.y + targetBox.height - 5
    });
    await expect(target).toHaveClass(/drop-after/);
    await expect(target).not.toHaveClass(/drop-before/);

    const ideas = columnOf(page, 'Ideas');
    const ideasBox = (await ideas.boundingBox())!;
    await ideas.dispatchEvent('dragover', {
      clientX: ideasBox.x + ideasBox.width / 2,
      clientY: ideasBox.y + ideasBox.height / 2
    });
    await expect(ideas).toHaveClass(/drop-end/);
    expect(await ideas.evaluate(el => getComputedStyle(el).boxShadow)).toContain('inset');

    await source.dispatchEvent('dragend');
    await expect(source).not.toHaveClass(/dragging/);
    await expect(ideas).not.toHaveClass(/drop-end/);
    await expect(page.getByTestId('task-card')).toHaveCount(12);
  });
});
