import { test as base, expect, type Page } from '@playwright/test';
import { APP_BASE_URL } from './env';

/**
 * 看板 demo 阶段 B（US-540 AC#9～11、#13）：同一份种子上的板内搜索隔离与分页、无匹配与切板丢弃旧请求、
 * 命中集随写入刷新、重开既有库后旧任务仍可搜到。每个用例在全新浏览器上下文从启动页开始。
 */

/** 每个用例一个全新浏览器上下文（干净 IndexedDB / localStorage 初态）。 */
const test = base.extend<{ boardPage: Page }>({
  boardPage: async ({ browser }, use) => {
    const context = await browser.newContext();
    const page = await context.newPage();
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

/** 经启动页装载演示数据（只进新库）。 */
const startWithSeed = async (page: Page): Promise<void> => {
  await expect(page.getByTestId('startup-page')).toBeVisible();
  await page.getByTestId('start-seed').click();
  await expect(page.getByTestId('board-view')).toBeVisible();
  await expect(page.getByTestId('task-card')).toHaveCount(12);
};

const results = (page: Page) => page.getByTestId('board-search-result');

const resultTitles = async (page: Page): Promise<string[]> =>
  (await results(page).locator('.rxb-search-result-title').allTextContents()).map(text => text.trim());

/** 打开搜索对话框（⌘K 同一入口），按需换关键词。 */
const search = async (page: Page, query?: string): Promise<void> => {
  await page.getByTestId('search-open').click();
  if (query !== undefined) await page.getByTestId('board-search-input').fill(query);
};

const closeSearch = async (page: Page): Promise<void> => {
  await page.getByTestId('board-search-input').press('Escape');
  await expect(page.getByTestId('board-search')).toHaveCount(0);
};

/** 主板标题或描述含「同步」的 6 条任务。 */
const MAIN_SYNC_TITLES = [
  '同步插件适配 Supabase',
  '整理同步迁移指南',
  '回归测试：工作树同步',
  '同步水位线调优',
  'DevTools 同步面板重构',
  '全量同步测试门禁接通'
];

test('AC#9：多板同词——当前板首屏不被异板挤空、板内分页无遗漏 / 重复；切板只搜所选板；点结果定位并突出卡片', async ({
  boardPage: page
}) => {
  await startWithSeed(page);
  await search(page, '同步');
  await expect(results(page)).toHaveCount(5);
  const firstPage = await resultTitles(page);
  expect(new Set(firstPage).size).toBe(5);
  for (const title of firstPage) expect(MAIN_SYNC_TITLES, `首屏结果：${JSON.stringify(firstPage)}`).toContain(title);
  await page.getByTestId('board-search-more').click();
  await expect(results(page)).toHaveCount(6);
  expect([...(await resultTitles(page))].sort()).toEqual([...MAIN_SYNC_TITLES].sort());

  // 结果写明所在列与片段；点选后关闭对话框，定位、聚焦并短暂突出目标卡片
  const hit = results(page).filter({ hasText: '同步水位线调优' });
  await expect(hit.locator('.rxb-search-result-column')).toHaveText('Doing');
  await expect(hit.locator('.rxb-search-result-snippet')).not.toBeEmpty();
  await hit.click();
  await expect(page.getByTestId('board-search')).toHaveCount(0);
  const card = page.getByTestId('task-card').filter({ hasText: '同步水位线调优' });
  await expect(card).toHaveClass(/search-hit/);
  await expect(card).toBeFocused();
  await expect(card).toBeInViewport();

  // 切到隔离板：关键词保留，命中只来自隔离板（8 条，分两页）
  await page.getByTestId('board-selector').selectOption({ label: '引擎研究草稿' });
  await expect(page.getByTestId('task-card')).toHaveCount(8);
  await search(page);
  await expect(page.getByTestId('board-search-input')).toHaveValue('同步');
  await expect(results(page)).toHaveCount(5);
  await page.getByTestId('board-search-more').click();
  await expect(results(page)).toHaveCount(8);
  const isolation = await resultTitles(page);
  expect(new Set(isolation).size).toBe(8);
  for (const title of isolation) expect(MAIN_SYNC_TITLES).not.toContain(title);
});

test('AC#10：无匹配只在查询返回后显示；有匹配的搜索刚发出就切板，旧板的结果不回填', async ({ boardPage: page }) => {
  await startWithSeed(page);
  await search(page, '量子纠缠');
  await expect(page.getByTestId('board-search-empty')).toHaveText('无匹配');
  await expect(results(page)).toHaveCount(0);

  // 主板有「登录」命中；发出查询后立即关对话框切板——迟到的主板结果不得出现在隔离板
  await page.getByTestId('board-search-input').fill('登录');
  await closeSearch(page);
  await page.getByTestId('board-selector').selectOption({ label: '引擎研究草稿' });
  await expect(page.getByTestId('task-card')).toHaveCount(8);
  await search(page);
  await expect(page.getByTestId('board-search-input')).toHaveValue('登录');
  await expect(page.getByTestId('board-search-empty')).toHaveText('无匹配');
  await expect(results(page)).toHaveCount(0);

  // 切回主板：同词重查只给主板命中
  await closeSearch(page);
  await page.getByTestId('board-selector').selectOption({ label: 'rxdb 1.0 发布计划' });
  await search(page);
  await expect(results(page)).toHaveCount(1);
  await expect(results(page).locator('.rxb-search-result-title')).toHaveText('修复登录 bug');
});

test('AC#11：命中集随写入刷新——新建命中、改描述后不再命中、删除命中任务及其所在列后无陈旧结果', async ({
  boardPage: page
}) => {
  await startWithSeed(page);
  await search(page, '登录');
  await expect(results(page)).toHaveCount(1);
  await closeSearch(page);

  // 新建命中任务（Ideas 列）：结果补上，所在列正确
  const ideas = page
    .getByTestId('column')
    .filter({ has: page.getByTestId('column-title').getByText('Ideas', { exact: true }) });
  await ideas.getByTestId('add-task').click();
  await page.getByTestId('add-task-input').fill('登录页加验证码');
  await page.getByTestId('add-task-input').press('Enter');
  await page.getByTestId('add-task-input').press('Escape');
  await search(page);
  await expect(results(page)).toHaveCount(2);
  await expect(results(page).filter({ hasText: '登录页加验证码' }).locator('.rxb-search-result-column')).toHaveText(
    'Ideas'
  );
  await closeSearch(page);

  // 只靠描述命中的任务改掉描述：不再命中
  await search(page, '弱网');
  await expect(results(page)).toHaveCount(1);
  await closeSearch(page);
  await page.getByTestId('task-card').filter({ hasText: '修复登录 bug' }).getByTestId('task-title').click();
  const detail = page.getByTestId('detail-panel');
  await detail.getByTestId('detail-description').fill('重试入口补齐后再回归。');
  await detail.getByTestId('detail-description').press('Tab');
  await detail.getByTestId('detail-close').click();
  await search(page);
  await expect(page.getByTestId('board-search-empty')).toHaveText('无匹配');
  await closeSearch(page);

  // 删除命中任务、再删除另一条命中所在的列：结果里没有已删任务，也没有陈旧的所在列
  await page.getByTestId('task-card').filter({ hasText: '修复登录 bug' }).getByTestId('task-title').click();
  await detail.getByTestId('detail-delete').click();
  await page.getByTestId('confirm-delete-yes').click();
  await expect(page.getByTestId('task-card').filter({ hasText: '修复登录 bug' })).toHaveCount(0);
  await search(page, '登录');
  await expect(results(page)).toHaveCount(1);
  await expect(results(page).locator('.rxb-search-result-title')).toHaveText('登录页加验证码');
  await closeSearch(page);
  await ideas.getByTestId('column-menu-trigger').click();
  await page.getByTestId('column-delete').click();
  await page.getByTestId('confirm-delete-yes').click();
  await expect(page.getByTestId('column')).toHaveCount(3);
  await search(page);
  await expect(page.getByTestId('board-search-empty')).toHaveText('无匹配');
});

test('AC#13：重开既有库——编辑过的任务与标签原样，旧任务与改过的标题都能搜到，连接无结构错误', async ({
  boardPage: page
}) => {
  await startWithSeed(page);
  // 编辑任务标题（F2 就地改）与标签名（标签对话框）
  await page.getByTestId('task-card').filter({ hasText: '整理同步迁移指南' }).focus();
  await page.keyboard.press('F2');
  await page.getByTestId('task-title-editor').fill('整理同步迁移手册');
  await page.getByTestId('task-title-editor').press('Enter');
  await expect(page.getByTestId('task-card').filter({ hasText: '整理同步迁移手册' })).toBeVisible();
  await page.getByTestId('labels-open').click();
  await page.getByTestId('label-row').filter({ hasText: '核心' }).getByTestId('label-edit').click();
  await page.getByTestId('label-name-input').fill('Core');
  await page.getByTestId('label-editor-save').click();
  await expect(page.getByTestId('label-editor')).toHaveCount(0);
  await expect(page.getByTestId('label-row').filter({ hasText: 'Core' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('label-manager')).toHaveCount(0);

  // 整页重开同一个库
  await page.reload();
  await expect(page.getByTestId('task-card')).toHaveCount(12);
  await expect(page.getByTestId('app-error')).toHaveCount(0);
  await expect(page.getByTestId('task-card').filter({ hasText: '修复登录 bug' }).getByTestId('card-label')).toHaveText(
    'Core'
  );

  await search(page, '迁移手册');
  await expect(results(page)).toHaveCount(1);
  await expect(results(page).locator('.rxb-search-result-title')).toHaveText('整理同步迁移手册');
  await page.getByTestId('board-search-input').fill('水位线');
  await expect(results(page)).toHaveCount(1);
  await expect(results(page).locator('.rxb-search-result-title')).toHaveText('同步水位线调优');
});
