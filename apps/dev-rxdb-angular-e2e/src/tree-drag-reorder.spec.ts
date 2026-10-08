import type { Locator, Page } from '@playwright/test';
import { dragRowOver, dragRowTo } from './drag-utils.js';
import { readCount, readRequiredAttribute, resetE2eState } from './e2e-utils.js';
import { expect, test } from './fixtures.js';

/**
 * US-031 阶段 B：树页面的拖放经 `Repository.reorder()`，显示顺序取自查询的默认排序。
 *
 * @remarks
 * 全部用例用真实鼠标拖拽（按下、移动、松开），操作后刷新页面读回顺序与 `data-parent-id`。
 * 落点取目标行高的 15% / 50% / 85%，分别是「上方 / 拖进 / 下方」三档（三端统一为三等分）。
 * 拖放失败的分支只在单测里验：同一页面里活查询会先把界面刷新到库里的状态，Playwright 里没有确定性的触发点。
 * 三端同名用例：React / Vue 的 `tree-drag-reorder.spec.ts` 与这里的标题一致。
 */

const WRITE_TIMEOUT = 20_000;

/** 断言一组行从上到下的文案依次包含给定正则，且行数相等。 */
async function expectOrder(rows: Locator, patterns: RegExp[]): Promise<void> {
  await expect(rows).toHaveText(patterns, { timeout: WRITE_TIMEOUT });
}

/** 页内没有写入失败提示。 */
async function expectNoWriteError(page: Page): Promise<void> {
  await expect(page.getByTestId('tree-write-error')).toHaveCount(0);
}

/**
 * 「零写」的同步点：撤销计数恰好比基线多 1。
 *
 * 断言零写之前先做一笔已知会落库的写入（新建一个根节点）。写入经适配器队列串行提交，
 * 这笔写入的行出现时，前面若有被拒拖放误发的写入也必然已经提交——计数只会是基线 + 2，
 * 不靠等待时长猜「该落地的都落地了」。
 */
async function expectOnlySyncWrite(
  page: Page,
  badgeTestId: 'menu-undo-count' | 'file-undo-count',
  undoBefore: number
): Promise<void> {
  await expect.poll(() => readUndoCount(page, badgeTestId), { timeout: WRITE_TIMEOUT }).toBe(undoBefore + 1);
}

/** 撤销按钮上的计数徽标；没有历史项时徽标不渲染，按 0 算。 */
async function readUndoCount(page: Page, badgeTestId: 'menu-undo-count' | 'file-undo-count'): Promise<number> {
  const badge = page.getByTestId(badgeTestId);
  return (await badge.count()) === 0 ? 0 : readCount(await badge.textContent(), '撤销计数');
}

// ---------------------------------------------------------------------------
// 菜单页（simple / virtual / lazy 共用）
// ---------------------------------------------------------------------------

const MENU_UNDO = 'menu-undo-count';

function menuRows(page: Page): Locator {
  return page.getByTestId('menu-row');
}

function menuRow(page: Page, title: string): Locator {
  return menuRows(page).filter({ hasText: title }).first();
}

async function gotoMenuPage(page: Page, route: string, hostSelector: string): Promise<void> {
  await page.goto(route);
  await page.waitForLoadState('domcontentloaded');
  await expect(page.locator(hostSelector)).toBeVisible();
  await expect(page.getByTestId('menu-title-input')).toBeVisible({ timeout: WRITE_TIMEOUT });
}

async function reloadMenuPage(page: Page, hostSelector: string): Promise<void> {
  await page.reload();
  await expect(page.locator(hostSelector)).toBeVisible({ timeout: WRITE_TIMEOUT });
  await expect(page.getByTestId('menu-title-input')).toBeVisible({ timeout: WRITE_TIMEOUT });
}

async function addRootMenu(page: Page, title: string): Promise<void> {
  const input = page.getByTestId('menu-title-input');
  await input.fill(title);
  await input.press('Enter');
  await expect(menuRow(page, title)).toBeVisible({ timeout: WRITE_TIMEOUT });
  await expect(input).toHaveValue('', { timeout: WRITE_TIMEOUT });
}

/** 在已显示的父节点行下新建子节点；成功后子节点行可见（选父节点会展开它）。 */
async function addChildMenu(page: Page, parentTitle: string, title: string): Promise<void> {
  const parent = menuRow(page, parentTitle);
  await parent.hover();
  await parent.getByTestId('menu-add-child').click();
  await expect(page.getByTestId('menu-selected-parent')).toBeVisible();

  const input = page.getByTestId('menu-title-input');
  await input.fill(title);
  await input.press('Enter');
  await expect(menuRow(page, title)).toBeVisible({ timeout: WRITE_TIMEOUT });
  await expect(input).toHaveValue('', { timeout: WRITE_TIMEOUT });
}

/** 展开一个折叠的菜单节点。 */
async function expandMenu(page: Page, title: string): Promise<void> {
  await menuRow(page, title).getByTestId('menu-node-toggle').click();
}

/** 菜单行的 `data-menu-id`，即它作为父节点时子节点 `data-parent-id` 的取值。 */
function menuIdOf(page: Page, title: string): Promise<string> {
  return readRequiredAttribute(menuRow(page, title), 'data-menu-id', `${title}行`);
}

// ---------------------------------------------------------------------------
// 文件管理器页（simple / lazy 共用）
// ---------------------------------------------------------------------------

const FILE_UNDO = 'file-undo-count';

function fileRows(page: Page): Locator {
  return page.getByTestId('file-row');
}

function fileRow(page: Page, name: string): Locator {
  return fileRows(page).filter({ hasText: name }).first();
}

async function gotoFilePage(page: Page, route: string, hostSelector: string): Promise<void> {
  await page.goto(route);
  await expect(page.locator(hostSelector)).toBeVisible({ timeout: WRITE_TIMEOUT });
  await expect(page.getByTestId('file-name-input')).toBeVisible({ timeout: WRITE_TIMEOUT });
}

async function reloadFilePage(page: Page, hostSelector: string): Promise<void> {
  await page.reload();
  await expect(page.locator(hostSelector)).toBeVisible({ timeout: WRITE_TIMEOUT });
  await expect(page.getByTestId('file-name-input')).toBeVisible({ timeout: WRITE_TIMEOUT });
}

async function addRootFolder(page: Page, name: string): Promise<void> {
  const input = page.getByTestId('file-name-input');
  await input.fill(name);
  await page.getByTestId('file-submit').click();
  await expect(fileRow(page, name)).toBeVisible({ timeout: WRITE_TIMEOUT });
  await expect(input).toHaveValue('', { timeout: WRITE_TIMEOUT });
}

/** 在已显示的文件夹行下新建子文件夹。 */
async function addChildFolder(page: Page, parentName: string, name: string): Promise<void> {
  const parent = fileRow(page, parentName);
  await parent.hover();
  await parent.getByTitle('添加子文件夹').click();

  const input = page.getByTestId('file-name-input');
  await input.fill(name);
  await page.getByTestId('file-submit').click();
  await expect(fileRow(page, name)).toBeVisible({ timeout: WRITE_TIMEOUT });
  await expect(input).toHaveValue('', { timeout: WRITE_TIMEOUT });
}

async function selectSortMode(page: Page, mode: 'manual' | 'name-asc'): Promise<void> {
  await page.getByTestId('file-sort-select').selectOption(mode);
  await expect(page.getByTestId('file-sort-select')).toHaveValue(mode);
}

function fileIdOf(page: Page, name: string): Promise<string> {
  return readRequiredAttribute(fileRow(page, name), 'data-file-id', `${name}行`);
}

test.describe('树页面拖放（US-031 阶段 B）', () => {
  // 串行：每条用例都要建节点、刷新页面，分散到多个 worker 并发时会抢占本机 CPU，
  // 拖慢同时在跑的别的用例（实测会让 search-refresh 等不到结果）
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    await resetE2eState(page);
  });

  test('同父拖到两邻之间', async ({ page }) => {
    const host = 'app-tree-menu-simple-page';
    await gotoMenuPage(page, '/menu-simple', host);
    for (const title of ['节点A', '节点B', '节点C', '节点D']) await addRootMenu(page, title);
    await expectOrder(menuRows(page), [/节点A/, /节点B/, /节点C/, /节点D/]);

    // D 放到 A 的下方，即 A 与 B 之间
    await dragRowTo(page, menuRow(page, '节点D'), menuRow(page, '节点A'), 'after');
    await expectOrder(menuRows(page), [/节点A/, /节点D/, /节点B/, /节点C/]);

    await reloadMenuPage(page, host);
    await expectOrder(menuRows(page), [/节点A/, /节点D/, /节点B/, /节点C/]);
    await expectNoWriteError(page);
  });

  test('拖到组首与组尾', async ({ page }) => {
    const host = 'app-tree-menu-simple-page';
    await gotoMenuPage(page, '/menu-simple', host);
    for (const title of ['节点A', '节点B', '节点C']) await addRootMenu(page, title);

    // C 拖到组首（A 的上方）
    await dragRowTo(page, menuRow(page, '节点C'), menuRow(page, '节点A'), 'before');
    await expectOrder(menuRows(page), [/节点C/, /节点A/, /节点B/]);

    // A 拖到组尾（B 的下方）
    await dragRowTo(page, menuRow(page, '节点A'), menuRow(page, '节点B'), 'after');
    await expectOrder(menuRows(page), [/节点C/, /节点B/, /节点A/]);

    await reloadMenuPage(page, host);
    await expectOrder(menuRows(page), [/节点C/, /节点B/, /节点A/]);
    await expectNoWriteError(page);
  });

  test('跨父拖到两个子节点之间', async ({ page }) => {
    const host = 'app-tree-menu-simple-page';
    await gotoMenuPage(page, '/menu-simple', host);
    await addRootMenu(page, '父P');
    await addRootMenu(page, '父Q');
    await addChildMenu(page, '父P', '子p1');
    await addChildMenu(page, '父Q', '子q1');
    await addChildMenu(page, '父Q', '子q2');
    await expectOrder(menuRows(page), [/父P/, /子p1/, /父Q/, /子q1/, /子q2/]);

    // p1 放到 q1 的下方，即 q1 与 q2 之间；改挂与定位在一次提交内完成
    await dragRowTo(page, menuRow(page, '子p1'), menuRow(page, '子q1'), 'after');
    await expectOrder(menuRows(page), [/父P/, /父Q/, /子q1/, /子p1/, /子q2/]);
    const parentQId = await menuIdOf(page, '父Q');
    await expect(menuRow(page, '子p1')).toHaveAttribute('data-parent-id', parentQId);

    await reloadMenuPage(page, host);
    await expandMenu(page, '父Q');
    await expectOrder(menuRows(page), [/父P/, /父Q/, /子q1/, /子p1/, /子q2/]);
    await expect(menuRow(page, '子p1')).toHaveAttribute('data-parent-id', await menuIdOf(page, '父Q'));
    await expectNoWriteError(page);
  });

  test('菜单懒加载：拖进折叠节点，展开后排在末尾', async ({ page }) => {
    const host = 'app-tree-menu-lazy-page';
    await gotoMenuPage(page, '/menu-lazy', host);
    await addRootMenu(page, '父P');
    await addRootMenu(page, '节点X');
    await addChildMenu(page, '父P', '子c1');
    await addChildMenu(page, '父P', '子c2');

    // 刷新后懒加载页只有根节点：P 折叠，它的子节点都未加载
    await reloadMenuPage(page, host);
    await expectOrder(menuRows(page), [/父P/, /节点X/]);

    // 缺陷三：拖进折叠且子节点未加载的节点，不能与首个子节点撞键，要排在既有子节点之后
    await dragRowTo(page, menuRow(page, '节点X'), menuRow(page, '父P'), 'into');
    await expectOrder(menuRows(page), [/父P/, /子c1/, /子c2/, /节点X/]);

    await reloadMenuPage(page, host);
    await expandMenu(page, '父P');
    await expectOrder(menuRows(page), [/父P/, /子c1/, /子c2/, /节点X/]);
    await expect(menuRow(page, '节点X')).toHaveAttribute('data-parent-id', await menuIdOf(page, '父P'));
    await expectNoWriteError(page);
  });

  test('拖到后代上被拒、零写', async ({ page }) => {
    const host = 'app-tree-menu-simple-page';
    await gotoMenuPage(page, '/menu-simple', host);
    await addRootMenu(page, '父P');
    await addChildMenu(page, '父P', '子c');
    const undoBefore = await readUndoCount(page, MENU_UNDO);
    const parentPId = await menuIdOf(page, '父P');

    // 前、后、内部三种落点都被拒：高亮为无效，松开后零写
    for (const position of ['before', 'after', 'into'] as const) {
      await dragRowOver(page, menuRow(page, '父P'), menuRow(page, '子c'), position);
      await expect(menuRow(page, '子c')).toHaveAttribute('data-drop-valid', 'false');
      await page.mouse.up();
    }

    await addRootMenu(page, '同步点');
    await expectOnlySyncWrite(page, MENU_UNDO, undoBefore);
    await expectOrder(menuRows(page), [/父P/, /子c/, /同步点/]);
    await expect(menuRow(page, '子c')).toHaveAttribute('data-parent-id', parentPId);

    await reloadMenuPage(page, host);
    await expandMenu(page, '父P');
    await expectOrder(menuRows(page), [/父P/, /子c/, /同步点/]);
    await expect(menuRow(page, '子c')).toHaveAttribute('data-parent-id', await menuIdOf(page, '父P'));
    await expectNoWriteError(page);
  });

  test('原位放下与拖进当前父节点（已是末尾）都零写', async ({ page }) => {
    const host = 'app-tree-menu-simple-page';
    await gotoMenuPage(page, '/menu-simple', host);
    await addRootMenu(page, '节点A');
    await addRootMenu(page, '节点B');
    await addRootMenu(page, '父P');
    await addChildMenu(page, '父P', '子c1');
    await addChildMenu(page, '父P', '子c2');
    await expectOrder(menuRows(page), [/节点A/, /节点B/, /父P/, /子c1/, /子c2/]);
    const undoBefore = await readUndoCount(page, MENU_UNDO);

    // B 本来就在 A 之后；A 本来就在 B 之前
    await dragRowTo(page, menuRow(page, '节点B'), menuRow(page, '节点A'), 'after');
    await dragRowTo(page, menuRow(page, '节点A'), menuRow(page, '节点B'), 'before');
    // c2 已是 P 的最后一个子节点，再拖进 P
    await dragRowTo(page, menuRow(page, '子c2'), menuRow(page, '父P'), 'into');

    await addRootMenu(page, '同步点');
    await expectOnlySyncWrite(page, MENU_UNDO, undoBefore);
    await expectOrder(menuRows(page), [/节点A/, /节点B/, /父P/, /子c1/, /子c2/, /同步点/]);

    await reloadMenuPage(page, host);
    await expandMenu(page, '父P');
    await expectOrder(menuRows(page), [/节点A/, /节点B/, /父P/, /子c1/, /子c2/, /同步点/]);
    await expectNoWriteError(page);
  });

  test('拖放后撤销一次恢复', async ({ page }) => {
    const host = 'app-tree-menu-simple-page';
    await gotoMenuPage(page, '/menu-simple', host);
    await addRootMenu(page, '父P');
    await addRootMenu(page, '父Q');
    await addChildMenu(page, '父P', '子p1');
    await addChildMenu(page, '父Q', '子q1');
    await expectOrder(menuRows(page), [/父P/, /子p1/, /父Q/, /子q1/]);
    const parentPId = await menuIdOf(page, '父P');
    const parentQId = await menuIdOf(page, '父Q');
    const undoBefore = await readUndoCount(page, MENU_UNDO);

    // 跨父拖进 Q：改挂与定位是一次提交
    await dragRowTo(page, menuRow(page, '子p1'), menuRow(page, '父Q'), 'into');
    await expectOrder(menuRows(page), [/父P/, /父Q/, /子q1/, /子p1/]);
    await expect(menuRow(page, '子p1')).toHaveAttribute('data-parent-id', parentQId);
    await expect.poll(() => readUndoCount(page, MENU_UNDO), { timeout: WRITE_TIMEOUT }).toBe(undoBefore + 1);

    // 撤销一次恢复拖放前的父节点与顺序
    await page.locator('button[aria-label="撤销"]').first().click();
    await expectOrder(menuRows(page), [/父P/, /子p1/, /父Q/, /子q1/]);
    await expect(menuRow(page, '子p1')).toHaveAttribute('data-parent-id', parentPId);
    await expect.poll(() => readUndoCount(page, MENU_UNDO), { timeout: WRITE_TIMEOUT }).toBe(undoBefore);
    await expectNoWriteError(page);
  });

  test('虚拟滚动页同父重排', async ({ page }) => {
    const host = 'app-tree-menu-virtual-page';
    await gotoMenuPage(page, '/menu-virtual', host);
    for (const title of ['节点A', '节点B', '节点C', '节点D']) await addRootMenu(page, title);
    await expectOrder(menuRows(page), [/节点A/, /节点B/, /节点C/, /节点D/]);

    await dragRowTo(page, menuRow(page, '节点D'), menuRow(page, '节点A'), 'after');
    await expectOrder(menuRows(page), [/节点A/, /节点D/, /节点B/, /节点C/]);

    await reloadMenuPage(page, host);
    await expectOrder(menuRows(page), [/节点A/, /节点D/, /节点B/, /节点C/]);
    await expectNoWriteError(page);
  });

  test('文件管理器手动模式：文件夹之间重排、拖进文件夹', async ({ page }) => {
    const host = 'app-file-manager-simple-page';
    await gotoFilePage(page, '/file-manager-simple', host);
    for (const name of ['夹甲', '夹乙', '夹丙']) await addRootFolder(page, name);
    await expectOrder(fileRows(page), [/夹甲/, /夹乙/, /夹丙/]);

    // 丙拖到组首（甲的上方）
    await dragRowTo(page, fileRow(page, '夹丙'), fileRow(page, '夹甲'), 'before');
    await expectOrder(fileRows(page), [/夹丙/, /夹甲/, /夹乙/]);

    // 乙拖进丙：成为丙的子节点，目标展开
    await dragRowTo(page, fileRow(page, '夹乙'), fileRow(page, '夹丙'), 'into');
    await expectOrder(fileRows(page), [/夹丙/, /夹乙/, /夹甲/]);
    await expect(fileRow(page, '夹乙')).toHaveAttribute('data-parent-id', await fileIdOf(page, '夹丙'));

    await reloadFilePage(page, host);
    await fileRow(page, '夹丙').getByTestId('file-node-toggle').click();
    await expectOrder(fileRows(page), [/夹丙/, /夹乙/, /夹甲/]);
    await expect(fileRow(page, '夹乙')).toHaveAttribute('data-parent-id', await fileIdOf(page, '夹丙'));
    await expect(fileRow(page, '夹甲')).toHaveAttribute('data-parent-id', '');
    await expectNoWriteError(page);
  });

  test('文件管理器懒加载：拖进折叠文件夹，展开后排在末尾', async ({ page }) => {
    const host = 'app-file-manager-lazy-page';
    await gotoFilePage(page, '/file-manager-lazy', host);
    for (const name of ['夹P', '夹c1', '夹c2', '夹X']) await addRootFolder(page, name);

    // 先把 c1、c2 依次拖进 P，让 P 有两个子节点
    await dragRowTo(page, fileRow(page, '夹c1'), fileRow(page, '夹P'), 'into');
    await expectOrder(fileRows(page), [/夹P/, /夹c1/, /夹c2/, /夹X/]);
    await dragRowTo(page, fileRow(page, '夹c2'), fileRow(page, '夹P'), 'into');
    await expect(fileRow(page, '夹c2')).toHaveAttribute('data-parent-id', await fileIdOf(page, '夹P'));

    // 刷新后懒加载页只有根节点：P 折叠，它的子节点都未加载
    await reloadFilePage(page, host);
    await expectOrder(fileRows(page), [/夹P/, /夹X/]);

    // 缺陷三：拖进折叠且子节点未加载的文件夹，要排在既有子节点之后
    await dragRowTo(page, fileRow(page, '夹X'), fileRow(page, '夹P'), 'into');
    await expectOrder(fileRows(page), [/夹P/, /夹c1/, /夹c2/, /夹X/]);

    await reloadFilePage(page, host);
    await fileRow(page, '夹P').getByTestId('file-node-toggle').click();
    await expectOrder(fileRows(page), [/夹P/, /夹c1/, /夹c2/, /夹X/]);
    await expect(fileRow(page, '夹X')).toHaveAttribute('data-parent-id', await fileIdOf(page, '夹P'));
    await expectNoWriteError(page);
  });

  test('文件管理器非手动模式：子级拖到根级节点下方移到根组末尾', async ({ page }) => {
    const host = 'app-file-manager-simple-page';
    await gotoFilePage(page, '/file-manager-simple', host);
    await addRootFolder(page, '夹甲');
    await addRootFolder(page, '夹乙');
    await addChildFolder(page, '夹甲', '夹x');

    await selectSortMode(page, 'name-asc');
    await expect(fileRows(page)).toHaveCount(3);

    // 根级目标行仍分三档：x 拖到乙的下方，等于移到根级、追加到根组末尾
    await dragRowTo(page, fileRow(page, '夹x'), fileRow(page, '夹乙'), 'after');
    await expect(fileRow(page, '夹x')).toHaveAttribute('data-parent-id', '', { timeout: WRITE_TIMEOUT });

    // 切回手动模式：根组末尾是 x
    await selectSortMode(page, 'manual');
    await expectOrder(fileRows(page), [/夹甲/, /夹乙/, /夹x/]);

    await reloadFilePage(page, host);
    await expectOrder(fileRows(page), [/夹甲/, /夹乙/, /夹x/]);
    await expect(fileRow(page, '夹x')).toHaveAttribute('data-parent-id', '');
    await expectNoWriteError(page);
  });

  test('文件管理器非手动模式：同级前后放置被拒', async ({ page }) => {
    const host = 'app-file-manager-simple-page';
    await gotoFilePage(page, '/file-manager-simple', host);
    await addRootFolder(page, '夹甲');
    await addRootFolder(page, '夹乙');
    await selectSortMode(page, 'name-asc');
    const undoBefore = await readUndoCount(page, FILE_UNDO);

    for (const position of ['before', 'after'] as const) {
      await dragRowOver(page, fileRow(page, '夹甲'), fileRow(page, '夹乙'), position);
      await expect(fileRow(page, '夹乙')).toHaveAttribute('data-drop-valid', 'false');
      await page.mouse.up();
    }

    await addRootFolder(page, '夹丙');
    await expectOnlySyncWrite(page, FILE_UNDO, undoBefore);

    // 切回手动模式，库里的顺序没变（同步点追加在根组末尾）
    await selectSortMode(page, 'manual');
    await expectOrder(fileRows(page), [/夹甲/, /夹乙/, /夹丙/]);
    await reloadFilePage(page, host);
    await expectOrder(fileRows(page), [/夹甲/, /夹乙/, /夹丙/]);
    await expectNoWriteError(page);
  });
});
