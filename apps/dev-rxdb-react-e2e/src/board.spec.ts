import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { test as base, expect } from '@playwright/test';

/**
 * 看板页三端对齐验收（US-539 阶段 A 的 e2e 半边，AC#1～3 / #6～8 / #11 / #14）：
 * 每个用例都在全新浏览器上下文进入 `/board`（干净 IndexedDB / localStorage 初态），
 * 拖拽用真实拖拽且拖后刷新读回（US-028 AC#18 先例），种子来自「装载演示数据」入口
 * （US-540 同一份确定性种子）。
 *
 * 三端复用相同验收场景，定位和菜单展开按各端组件呈现适配。
 * Angular 端从 `./fixtures.js` 取 test / expect（US-909 失败归档守卫），
 * React / Vue 从 `@playwright/test` 取。
 */

/** 每个用例一个全新浏览器上下文（干净 IndexedDB / localStorage 初态）。 */
const test = base.extend<{ boardPage: Page }>({
  boardPage: async ({ browser }, use) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('/board');
    await expect(page.getByTestId('board-view')).toBeVisible();
    await use(page);
    await context.close();
  }
});

/** 经宿主工具条装载演示数据（只进空库），等种子渲染完成。 */
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

test.describe('看板页对齐（US-539 阶段 A）', () => {
  test('AC#1：装载演示数据——列头、任务、标签与截止日与种子一致，重开后原样', async ({ boardPage: page }) => {
    await expect(page.getByTestId('empty-board')).toBeVisible();
    await startWithSeed(page);

    // 列头与列内数量
    await expect(page.getByTestId('column-title')).toHaveText(['To do', 'Doing', 'Done', 'Ideas']);
    await expect(page.getByTestId('column-count')).toHaveText(['5', '4', '3', '0']);

    // 标签与卡片上的标签 / 截止日
    await expect(page.getByTestId('label-chip')).toHaveCount(4);
    const firstCard = page.getByTestId('task-card').filter({ hasText: '修复登录 bug' });
    await expect(firstCard.getByTestId('task-due')).toHaveText(/2026-11-05/);
    await expect(firstCard.getByTestId('card-label')).toHaveText('核心');

    // 重开：同一库名读回，实体与顺序原样
    await page.reload();
    await expect(page.getByTestId('board-view')).toBeVisible();
    await expect(page.getByTestId('column')).toHaveCount(4);
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

    // 跨列：把 To do 第一张卡「修复登录 bug」拖到 Doing 的「树拖拽落点修复」之上
    const source = page.getByTestId('task-card').filter({ hasText: '修复登录 bug' });
    const target = page.getByTestId('task-card').filter({ hasText: '树拖拽落点修复' });
    await source.dragTo(target, { targetPosition: { x: 10, y: 5 } });
    const doingColumn = page
      .getByTestId('column')
      .filter({ has: page.getByTestId('column-title').getByText('Doing', { exact: true }) });
    await expect(doingColumn.getByTestId('task-title').first()).toHaveText('修复登录 bug');
    await page.reload();
    await expect(page.getByTestId('board-view')).toBeVisible();
    await expect(page.getByTestId('task-card')).toHaveCount(12);
    expect(await titlesOfColumn(page, 'Doing')).toEqual([
      '修复登录 bug',
      '树拖拽落点修复',
      '同步水位线调优',
      'DevTools 同步面板重构',
      '补齐三端对称'
    ]);
    expect(await titlesOfColumn(page, 'To do')).not.toContain('修复登录 bug');

    // 空列：拖「写发布说明」到 Ideas（空列）
    const toIdeas = page.getByTestId('task-card').filter({ hasText: '写发布说明' });
    const ideasColumn = page
      .getByTestId('column')
      .filter({ has: page.getByTestId('column-title').getByText('Ideas', { exact: true }) });
    await toIdeas.dragTo(ideasColumn.getByTestId('add-task'));
    await expect(ideasColumn.getByTestId('task-title')).toHaveText('写发布说明');
    await page.reload();
    await expect(page.getByTestId('board-view')).toBeVisible();
    await expect(page.getByTestId('task-card')).toHaveCount(12);
    expect(await titlesOfColumn(page, 'Ideas')).toEqual(['写发布说明']);

    // 同列改序：把 To do 的「整理同步迁移指南」拖到「同步插件适配 Supabase」之上
    const moved = page.getByTestId('task-card').filter({ hasText: '整理同步迁移指南' });
    const over = page.getByTestId('task-card').filter({ hasText: '同步插件适配 Supabase' });
    await moved.dragTo(over, { targetPosition: { x: 10, y: 5 } });
    const toDoColumn = page
      .getByTestId('column')
      .filter({ has: page.getByTestId('column-title').getByText('To do', { exact: true }) });
    await expect(toDoColumn.getByTestId('task-title').first()).toHaveText('整理同步迁移指南');
    await page.reload();
    await expect(page.getByTestId('board-view')).toBeVisible();
    await expect(page.getByTestId('task-card')).toHaveCount(12);
    expect(await titlesOfColumn(page, 'To do')).toEqual([
      '整理同步迁移指南',
      '同步插件适配 Supabase',
      '回归测试：工作树同步'
    ]);
  });

  test('AC#3：内联改标题保存 / 取消；详情保存标题 / 描述 / 标签 / 截止日并重开读回', async ({ boardPage: page }) => {
    await startWithSeed(page);

    // 内联改标题：取消零写（编辑器渲染时卡片 hasText 过滤失效——标题被输入框替换，
    // 编辑器 / 保存 / 取消一律用页面级定位）
    const card = page.getByTestId('task-card').filter({ hasText: '写发布说明' });
    await card.getByTestId('task-edit-title').click();
    await expect(page.getByTestId('task-title-editor')).toBeVisible();
    await page.getByTestId('task-title-editor').fill('写发布说明（取消）');
    await page.getByTestId('task-title-cancel').click();
    await expect(card.getByTestId('task-title')).toHaveText('写发布说明');

    // 内联改标题：保存生效
    await card.getByTestId('task-edit-title').click();
    await page.getByTestId('task-title-editor').fill('写发布说明 v2');
    await page.getByTestId('task-title-save').click();
    await expect(card.getByTestId('task-title')).toHaveText('写发布说明 v2');

    // 详情：改标题 / 描述 / 截止日，加「文档」标签，保存后重开读回
    const detail = page.getByTestId('detail-panel');
    await card.getByTestId('task-title').click();
    await expect(detail).toBeVisible();
    await detail.getByTestId('detail-title').fill('写发布说明 v3');
    await detail.getByTestId('detail-description').fill('三端对齐的详情描述');
    await detail.getByTestId('detail-due').fill('2026-12-31');
    await detail.locator('label', { hasText: '文档' }).locator('input').check();
    await detail.getByTestId('detail-save').click();
    await expect(detail).toBeHidden();

    await card.getByTestId('task-title').click();
    await expect(detail.getByTestId('detail-title')).toHaveValue('写发布说明 v3');
    await expect(detail.getByTestId('detail-description')).toHaveValue('三端对齐的详情描述');
    await expect(detail.getByTestId('detail-due')).toHaveValue('2026-12-31');
    await expect(detail.locator('input[data-testid="detail-label-check"]:checked')).toHaveCount(1);
    await expect(detail.locator('label', { hasText: '文档' }).locator('input')).toBeChecked();
    await detail.getByTestId('detail-cancel').click();

    // 空标题拒绝且保留草稿
    await card.getByTestId('task-title').click();
    await detail.getByTestId('detail-title').fill('   ');
    await detail.getByTestId('detail-save').click();
    await expect(page.getByTestId('board-notice')).toBeVisible();
    await expect(detail.getByTestId('detail-title')).toHaveValue('   ');
  });

  test('AC#6：axe 无违规；键盘等价路径——列前移 / 后移可完成等价移动', async ({ boardPage: page }) => {
    await startWithSeed(page);
    // 重开清空会话撤销栈：种子的写入也进撤销栈（异步注册），
    // 否则一次 undo 可能先弹到种子条目而不是本用例的键盘移动
    await page.reload();
    await expect(page.getByTestId('board-view')).toBeVisible();
    await expect(page.getByTestId('task-card')).toHaveCount(12);

    // axe（US-539 AC#6 的 a11y 半边）
    const results = await new AxeBuilder({ page }).include('[data-testid="board-view"]').analyze();
    expect(results.violations).toEqual([]);

    // 键盘：首列前移 / 末列后移零写（不可越界），「Doing」后移一次与 Done 换位
    const columnHeader = (title: string) =>
      page
        .getByTestId('column-header')
        .filter({ has: page.getByTestId('column-title').getByText(title, { exact: true }) });
    await columnHeader('To do').getByTestId('column-actions').click();
    await columnHeader('To do').getByTestId('column-move-back').click();
    await expect(page.getByTestId('column-title')).toHaveText(['To do', 'Doing', 'Done', 'Ideas']);
    await columnHeader('Ideas').getByTestId('column-actions').click();
    await columnHeader('Ideas').getByTestId('column-move-forward').click();
    await expect(page.getByTestId('column-title')).toHaveText(['To do', 'Doing', 'Done', 'Ideas']);
    await columnHeader('Doing').getByTestId('column-actions').click();
    await columnHeader('Doing').getByTestId('column-move-forward').click();
    await expect(page.getByTestId('column-title')).toHaveText(['To do', 'Done', 'Doing', 'Ideas']);

    // 键盘移动与拖动走同一领域路径：undo 一次还原
    await page.getByTestId('undo').click();
    await expect(page.getByTestId('column-title')).toHaveText(['To do', 'Doing', 'Done', 'Ideas']);

    // 键盘：任务经详情面板「移动到列 + 位置」完成等价移动，成功后焦点落在被移动卡片
    await page.getByTestId('task-card').filter({ hasText: '修复登录 bug' }).getByTestId('task-title').click();
    await expect(page.getByTestId('detail-panel')).toBeVisible();
    await page.getByTestId('move-column').selectOption({ label: 'Doing' });
    await page.getByTestId('move-position').selectOption({ label: '列尾' });
    await page.getByTestId('move-task').click();
    await expect.poll(async () => (await titlesOfColumn(page, 'Doing')).at(-1)).toBe('修复登录 bug');
    await expect(page.getByTestId('task-card').filter({ hasText: '修复登录 bug' })).toBeFocused();
    await page.reload();
    await expect(page.getByTestId('board-view')).toBeVisible();
    await expect.poll(async () => (await titlesOfColumn(page, 'Doing')).at(-1)).toBe('修复登录 bug');
    expect(await titlesOfColumn(page, 'To do')).not.toContain('修复登录 bug');
  });

  test('AC#7：空库闭环——建板 / 建列 / 建任务、第二块板切换、重开原样', async ({ boardPage: page }) => {
    await expect(page.getByTestId('empty-board')).toBeVisible();

    await page.getByTestId('create-board-empty').click();
    await page.getByTestId('board-composer-input').fill('我的看板');
    await page.getByTestId('board-composer-submit').click();
    await expect(page.getByTestId('column')).toHaveCount(0);
    await expect(page.getByTestId('create-column')).toBeEnabled();
    await page.getByTestId('create-column').click();
    await page.getByTestId('column-composer-input').fill('待办');
    await page.getByTestId('column-composer-submit').click();
    await expect(page.getByTestId('column')).toHaveCount(1);
    // 内联建任务（GitHub Projects 风格）：Esc 取消零写，Enter 提交
    await page.getByTestId('add-task').click();
    await page.getByTestId('add-task-input').fill('第一件事');
    await page.getByTestId('add-task-input').press('Escape');
    await expect(page.getByTestId('task-card')).toHaveCount(0);
    await page.getByTestId('add-task').click();
    await page.getByTestId('add-task-input').fill('第一件事');
    await page.getByTestId('add-task-input').press('Enter');
    await expect(page.getByTestId('task-card')).toHaveCount(1);
    await expect(page.getByTestId('task-title')).toHaveText('第一件事');

    // 第二块板并来回切换：切板不混数据
    await page.getByTestId('create-board').click();
    await page.getByTestId('board-composer-input').fill('第二块板');
    await page.getByTestId('board-composer-submit').click();
    await page.getByTestId('board-selector').selectOption({ label: '第二块板' });
    await expect(page.getByTestId('column')).toHaveCount(0);
    await page.getByTestId('board-selector').selectOption({ label: '我的看板' });
    await expect(page.getByTestId('task-card')).toHaveCount(1);
    // 重开：板 / 列 / 任务与顺序原样
    await page.reload();
    await expect(page.getByTestId('board-view')).toBeVisible();
    await expect(page.getByTestId('task-card')).toHaveCount(1);
    await expect(page.getByTestId('task-title')).toHaveText('第一件事');
  });

  test('AC#8：删除确认——取消零写；确认后级联数量正确且另一板不变；重开不复活', async ({ boardPage: page }) => {
    await startWithSeed(page);

    // 删任务：详情面板删除入口，取消零写，确认后卡片消失
    const detail = page.getByTestId('detail-panel');
    const card = page.getByTestId('task-card').filter({ hasText: '写发布说明' });
    await expect(card.getByTestId('task-title')).toBeVisible();
    await card.getByTestId('task-title').evaluate(element => (element as HTMLElement).click());
    await expect(detail).toBeVisible();
    await detail.getByTestId('detail-actions-toggle').click();
    await detail.getByTestId('detail-delete').click();
    await expect(page.getByTestId('confirm-delete')).toContainText('写发布说明');
    await page.getByTestId('confirm-delete-no').click();
    await expect(page.getByTestId('task-card')).toHaveCount(12);
    await detail.getByTestId('detail-cancel').click();
    await card.getByTestId('task-title').evaluate(element => (element as HTMLElement).click());
    await detail.getByTestId('detail-actions-toggle').click();
    await detail.getByTestId('detail-delete').click();
    await page.getByTestId('confirm-delete-yes').click();
    await expect(page.getByTestId('task-card')).toHaveCount(11);

    // 删列：取消零写；确认提示含列内任务数（Doing 现在 5 张）并级联删除
    const doingHeader = page
      .getByTestId('column-header')
      .filter({ has: page.getByTestId('column-title').getByText('Doing', { exact: true }) });
    await doingHeader.getByTestId('column-actions').click();
    await doingHeader.getByTestId('column-delete').click();
    await expect(page.getByTestId('confirm-delete')).toContainText('4');
    await page.getByTestId('confirm-delete-no').click();
    await expect(page.getByTestId('column')).toHaveCount(4);
    await doingHeader.getByTestId('column-actions').click();
    await doingHeader.getByTestId('column-delete').click();
    await page.getByTestId('confirm-delete-yes').click();
    await expect(page.getByTestId('column')).toHaveCount(3);
    await expect(page.getByTestId('task-card')).toHaveCount(7);

    // 删板：确认后自动选择剩余板，重开不复活
    await page.getByTestId('delete-board').click();
    await expect(page.getByTestId('confirm-delete')).toContainText('3');
    await page.getByTestId('confirm-delete-yes').click();
    await expect(page.getByTestId('board-selector').locator('option')).toHaveCount(1);
    await expect(page.getByTestId('board-selector').locator('option:checked')).toHaveText('引擎研究草稿');
    await expect(page.getByTestId('empty-board')).toHaveCount(0);
    await expect(page.getByTestId('column')).toHaveCount(1);
    await expect(page.getByTestId('task-card')).toHaveCount(8);

    // 删除后的工作区仍可创建一块空板，并与引擎研究板隔离。
    await page.getByTestId('create-board').click();
    await page.getByTestId('board-composer-input').fill('备份板');
    await page.getByTestId('board-composer-submit').click();
    await expect(page.getByTestId('board-selector').locator('option')).toHaveCount(2);
    await page.getByTestId('board-selector').selectOption({ label: '备份板' });
    await expect(page.getByTestId('column')).toHaveCount(0);
    await expect(page.getByTestId('task-card')).toHaveCount(0);
    await page.getByTestId('board-selector').selectOption({ label: '引擎研究草稿' });
    await expect(page.getByTestId('task-card')).toHaveCount(8);
    await page.reload();
    await expect(page.getByTestId('board-view')).toBeVisible();
    await expect(page.getByTestId('task-card')).toHaveCount(8);
  });

  test('AC#11：连续三次保存对应三次撤销 / 重做；新编辑清空 redo；重开后不可撤销', async ({ boardPage: page }) => {
    await startWithSeed(page);
    const detail = page.getByTestId('detail-panel');
    const card = page.getByTestId('task-card').filter({ hasText: '修复登录 bug' });

    // 第一次保存：改标题
    await card.getByTestId('task-title').click();
    await detail.getByTestId('detail-title').fill('修复登录 bug 改');
    await detail.getByTestId('detail-save').click();
    await expect(detail).toBeHidden();
    await expect(page.getByTestId('undo')).toBeEnabled();

    // 第二次保存：加「文档」标签
    await card.getByTestId('task-title').click();
    await detail.locator('label', { hasText: '文档' }).locator('input').check();
    await detail.getByTestId('detail-save').click();
    await expect(detail).toBeHidden();

    // 第三次保存：改截止日
    await card.getByTestId('task-title').click();
    await detail.getByTestId('detail-due').fill('2026-12-01');
    await detail.getByTestId('detail-save').click();
    await expect(detail).toBeHidden();

    // 撤销三次回到初始；重做三次重放
    await page.getByTestId('undo').click();
    await page.getByTestId('undo').click();
    await page.getByTestId('undo').click();
    await expect(card.getByTestId('task-title')).toHaveText('修复登录 bug');
    await expect(card.getByTestId('task-due')).toHaveText(/2026-11-05/);
    await card.getByTestId('task-title').click();
    // 种子任务初始就带「核心」标签：三次撤销后回到初始（1 个选中）
    await expect(detail.locator('input[data-testid="detail-label-check"]:checked')).toHaveCount(1);
    await expect(detail.locator('label', { hasText: '核心' }).locator('input')).toBeChecked();
    await detail.getByTestId('detail-cancel').click();
    await expect(page.getByTestId('redo')).toBeEnabled();

    await page.getByTestId('redo').click();
    await page.getByTestId('redo').click();
    await page.getByTestId('redo').click();
    await expect(card.getByTestId('task-title')).toHaveText('修复登录 bug 改');
    await expect(card.getByTestId('task-due')).toHaveText('2026-12-01');
    await expect(page.getByTestId('redo')).toBeDisabled();

    // 新编辑清空 redo：改标题保存后 redo 仍禁用
    await card.getByTestId('task-title').click();
    await detail.getByTestId('detail-title').fill('修复登录 bug 终');
    await detail.getByTestId('detail-save').click();
    await expect(page.getByTestId('redo')).toBeDisabled();

    // 重开后不可撤销：undo / redo 都禁用
    await page.reload();
    await expect(page.getByTestId('board-view')).toBeVisible();
    await expect(page.getByTestId('undo')).toBeDisabled();
    await expect(page.getByTestId('redo')).toBeDisabled();
  });

  test('AC#14：本列排序——按截止日排序、已排好零写、一次 undo 还原整列', async ({ boardPage: page }) => {
    await startWithSeed(page);
    // 重开清空会话撤销栈：种子的写入也进撤销栈（异步注册），
    // 否则一次 undo 可能先弹到种子条目而不是本用例的排序
    await page.reload();
    await expect(page.getByTestId('board-view')).toBeVisible();
    await expect(page.getByTestId('task-card')).toHaveCount(12);

    const toDoHeader = page
      .getByTestId('column-header')
      .filter({ has: page.getByTestId('column-title').getByText('To do', { exact: true }) });
    const toDoColumn = page
      .getByTestId('column')
      .filter({ has: page.getByTestId('column-title').getByText('To do', { exact: true }) });
    await toDoHeader.getByTestId('column-actions').click();
    await toDoHeader.getByTestId('column-sort-due').click();
    // 升序、空值在后；同日按标题（自动重试等排序事务落定）
    await expect(toDoColumn.getByTestId('task-title')).toHaveText([
      '修复登录 bug',
      '同步插件适配 Supabase',
      '回归测试：工作树同步',
      '整理同步迁移指南',
      '写发布说明'
    ]);

    // 已排好再排一次零写且不新增历史：undo 一次直接回到排序前
    await toDoHeader.getByTestId('column-sort-due').click();
    await expect(toDoColumn.getByTestId('task-title')).toHaveText([
      '修复登录 bug',
      '同步插件适配 Supabase',
      '回归测试：工作树同步',
      '整理同步迁移指南',
      '写发布说明'
    ]);
    await page.getByTestId('undo').click();
    await expect(toDoColumn.getByTestId('task-title')).toHaveText(
      ['修复登录 bug', '写发布说明', '同步插件适配 Supabase', '回归测试：工作树同步', '整理同步迁移指南'],
      { timeout: 15000 }
    );
  });

  test('AC#15：板内搜索——命中片段与所在列、点结果定位高亮、清空退出（US-539 阶段 B）', async ({ boardPage: page }) => {
    await startWithSeed(page);

    const input = page.getByTestId('board-search-input');
    await input.fill('登录');
    await expect(page.getByTestId('board-search-results')).toBeVisible();
    // 命中「修复登录 bug」（词中位置），所在列 To do
    const result = page.getByTestId('board-search-result').filter({ hasText: '修复登录 bug' });
    await expect(result).toHaveCount(1);
    await expect(result.getByText('To do')).toBeVisible();

    // 点结果：目标卡片滚动可见并短暂高亮
    await result.click();
    const card = page.getByTestId('task-card').filter({ hasText: '修复登录 bug' });
    await expect(card).toHaveClass(/search-hit/);
    await expect(card).toBeInViewport();

    // 清空退出搜索态
    await input.fill('');
    await expect(page.getByTestId('board-search-results')).toBeHidden();
    await expect(card).not.toHaveClass(/search-hit/, { timeout: 5000 });
  });

  test('AC#16：多板同词隔离与分页——异板高排位不挤空当前板，切板只显所选板（US-539 阶段 B）', async ({
    boardPage: page
  }) => {
    await startWithSeed(page);

    // 主板 6 条命中「同步」，隔离板 8 条；当前板首屏 5 条、翻页补齐 6 条，无重复
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
      (await page.getByTestId('board-search-result').locator('.search-result-title').allTextContents()).map(text =>
        text.trim()
      );
    await expect(page.getByTestId('board-search-result')).toHaveCount(5);
    const firstPage = await titlesOf();
    expect(new Set(firstPage).size).toBe(5);
    for (const title of firstPage) {
      expect(expectedMain.has(title), `首屏结果标题：${JSON.stringify(firstPage)}`).toBe(true);
    }
    await page.getByTestId('board-search-more').click();
    await expect(page.getByTestId('board-search-result')).toHaveCount(6);
    expect(new Set(await titlesOf())).toEqual(expectedMain);

    // 切到隔离板搜同词：只显示隔离板 8 条
    await page.getByTestId('board-selector').selectOption({ label: '引擎研究草稿' });
    await expect(page.getByTestId('board-search-result')).toHaveCount(5);
    await page.getByTestId('board-search-more').click();
    await expect(page.getByTestId('board-search-result')).toHaveCount(8);
    const titles = await page.getByTestId('board-search-result').allTextContents();
    expect(titles.every(text => text.includes('同步'))).toBe(true);
  });

  test('AC#2b：拖拽落点反馈——卡片间插入线、空列高亮、源卡片半透明、结束清除', async ({ boardPage: page }) => {
    // 落点反馈由 dragstart + dragover 驱动；真实拖放端到端（落点持久化）由 AC#2 的 dragTo 覆盖。
    // 悬停中途的裸鼠标序列在 headless Chromium 的原生拖拽循环下 dragover 派发不可靠，
    // 用合成事件钉住「指针在某处 → 出现对应反馈」的渲染逻辑。
    await startWithSeed(page);

    const source = page.getByTestId('task-card').filter({ hasText: '修复登录 bug' });
    const target = page.getByTestId('task-card').filter({ hasText: '树拖拽落点修复' });
    const targetBox = (await target.boundingBox())!;

    await source.dispatchEvent('dragstart');
    await expect(source).toHaveClass(/dragging/);

    // 目标卡片上半 → before 插入线
    await target.dispatchEvent('dragover', { clientX: targetBox.x + 10, clientY: targetBox.y + 5 });
    await expect(target).toHaveClass(/drop-before/);
    // 样式必须真实生效：class 绑了但样式规则缺失时（曾有 Angular/Vue 整套规则缺失）
    // 类断言仍全绿，用 computed style 兜底
    expect(await target.evaluate(el => getComputedStyle(el).boxShadow)).not.toBe('none');

    // 下半 → after 插入线
    await target.dispatchEvent('dragover', {
      clientX: targetBox.x + 10,
      clientY: targetBox.y + targetBox.height - 5
    });
    await expect(target).toHaveClass(/drop-after/);
    await expect(target).not.toHaveClass(/drop-before/);

    // 空列 Ideas → 整列落点高亮
    const ideas = page
      .getByTestId('column')
      .filter({ has: page.getByTestId('column-title').getByText('Ideas', { exact: true }) });
    const ideasBox = (await ideas.boundingBox())!;
    await ideas.dispatchEvent('dragover', {
      clientX: ideasBox.x + ideasBox.width / 2,
      clientY: ideasBox.y + ideasBox.height / 2
    });
    await expect(ideas).toHaveClass(/drop-end/);
    expect(await ideas.evaluate(el => getComputedStyle(el).outlineStyle)).toBe('dashed');

    // 拖拽结束（dragend）清除全部反馈
    await source.dispatchEvent('dragend');
    await expect(source).not.toHaveClass(/dragging/);
    await expect(ideas).not.toHaveClass(/drop-end/);
    await expect(page.getByTestId('task-card')).toHaveCount(12);
  });
});
