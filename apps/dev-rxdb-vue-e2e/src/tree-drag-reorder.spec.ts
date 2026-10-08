import { expect, test, type Locator, type Page } from '@playwright/test';
import { dragRowTo, holdRowOver } from './drag-utils.js';
import {
  addChildMenu,
  addRootFolder,
  addRootMenu,
  getFileRow,
  getMenuRow,
  openPage,
  readCount,
  requireAttribute,
  resetE2eState
} from './e2e-utils.js';

/**
 * US-031 阶段 B：树页面的拖放（三端同名用例）。
 *
 * @remarks
 * 真实鼠标拖拽，落点取目标行高的 15% / 50% / 85%。放下后只经 `Repository.reorder()` 写入，
 * 显示顺序来自查询的默认排序；每条用例刷新后读回行顺序与 `data-parent-id`（根节点在 Vue 里没有该属性，
 * 根级用 `data-level="0"` 判断）。零写用撤销计数徽标断言。
 */

const MENU_SIMPLE = { path: '/menu-simple', title: 'Tree Menu - Simple' };
const MENU_VIRTUAL = { path: '/menu-virtual', title: 'Tree Menu - Virtual' };
const MENU_LAZY = { path: '/menu-lazy', title: 'Tree Menu - Lazy Load' };
const FILE_SIMPLE = { path: '/file-manager-simple', title: 'File Manager - Simple' };
const FILE_LAZY = { path: '/file-manager-lazy', title: 'File Manager - Lazy' };

type Kind = 'menu' | 'file';

async function open(page: Page, target: { path: string; title: string }): Promise<void> {
  await resetE2eState(page);
  await openPage(page, target.path, target.title);
}

/** 刷新当前页；同一测试内数据库名保持不变，所以读回的是已落库的数据。 */
async function reload(page: Page, title: string): Promise<void> {
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
}

/** 按页面上的出现顺序，把一组行文本映射回约定的名字（不在名单里的行忽略）。 */
function orderOf(texts: string[], names: string[]): string[] {
  return texts.flatMap(text => {
    const name = names.find(candidate => text.includes(candidate));
    return name === undefined ? [] : [name];
  });
}

/** 根级行：Vue 的根节点行没有 `data-parent-id`，用 `data-level="0"` 判断。 */
async function rootOrder(page: Page, kind: Kind, names: string[]): Promise<string[]> {
  const rows = page.getByTestId(`${kind}-row`).and(page.locator('[data-level="0"]'));
  return orderOf(await rows.allInnerTexts(), names);
}

async function childOrder(page: Page, kind: Kind, parent: Locator, names: string[]): Promise<string[]> {
  const idAttribute = kind === 'menu' ? 'data-menu-id' : 'data-file-id';
  const parentId = await requireAttribute(parent, idAttribute, '父节点行');
  const rows = page.getByTestId(`${kind}-row`).and(page.locator(`[data-parent-id=${JSON.stringify(parentId)}]`));
  return orderOf(await rows.allInnerTexts(), names);
}

async function expectParent(page: Page, kind: Kind, child: Locator, parent: Locator): Promise<void> {
  const idAttribute = kind === 'menu' ? 'data-menu-id' : 'data-file-id';
  const parentId = await requireAttribute(parent, idAttribute, '父节点行');
  await expect(child).toHaveAttribute('data-parent-id', parentId);
}

/** 展开一个折叠的节点（刷新后所有节点都折叠）。 */
async function expandRow(row: Locator, kind: Kind): Promise<void> {
  await row.getByTestId(`${kind}-node-toggle`).click();
}

/** 撤销计数徽标；计数为 0 时徽标不渲染。 */
/**
 * 「零写」的同步点：先做一笔已知会落库的写入（新建一个根节点），再断言撤销计数恰好比基线多 1。
 *
 * 写入经适配器队列串行提交，同步点的行出现时，被拒 / 原位拖放若误发过写入也必然已经提交——
 * 计数会是基线 + 2。直接在拖放后断言「计数没变」只证明那一刻还没变，晚到的误写会被漏过。
 */
async function expectOnlySyncWrite(page: Page, kind: Kind, before: number): Promise<void> {
  if (kind === 'menu') await addRootMenu(page, '零写同步点');
  else await addRootEntry(page, '零写同步点', 'folder');
  await expect.poll(() => undoCount(page, kind)).toBe(before + 1);
}

async function undoCount(page: Page, kind: Kind): Promise<number> {
  const badge = page.getByTestId(`${kind}-undo-count`);
  if ((await badge.count()) === 0) return 0;
  return readCount(await badge.textContent(), '撤销计数徽标');
}

/** 放下之后拖拽状态已复位（目标行不再是落点）。 */
async function expectDropSettled(target: Locator): Promise<void> {
  await expect(target).toHaveAttribute('data-drop-target', 'false');
}

/** 文件管理器的添加模式开关，按钮文案即当前模式。 */
async function switchAddMode(page: Page, mode: 'file' | 'folder'): Promise<void> {
  const toggle = page.getByTestId('file-mode-toggle');
  const label = mode === 'file' ? '文件' : '文件夹';
  if ((await toggle.innerText()).trim() !== label) await toggle.click();
  await expect(toggle).toHaveText(label);
}

async function addRootEntry(page: Page, name: string, mode: 'file' | 'folder'): Promise<Locator> {
  await switchAddMode(page, mode);
  return addRootFolder(page, name);
}

/** 选中文件夹作父节点后新建；选中状态保留，之后的新建都落在它下面。 */
async function addFileChild(page: Page, parent: Locator, name: string, mode: 'file' | 'folder'): Promise<Locator> {
  await parent.hover();
  await parent.getByTestId('file-select-parent').click();
  const child = await addRootEntry(page, name, mode);
  await expectParent(page, 'file', child, parent);
  return child;
}

async function selectSortMode(page: Page, mode: 'manual' | 'name-asc'): Promise<void> {
  await page.getByTestId('file-sort-select').selectOption(mode);
}

test.describe('树页面拖放（US-031 阶段 B）', () => {
  // 串行：几条用例都要刷新页面、做真实鼠标拖拽，分散到多个 worker 并发时会抢占本机 CPU，
  // 拖慢同时在跑的别的用例
  test.describe.configure({ mode: 'serial' });

  test('同父拖到两邻之间', async ({ page }) => {
    await open(page, MENU_SIMPLE);
    const names = ['拖放甲', '拖放乙', '拖放丙', '拖放丁'];
    for (const name of names) await addRootMenu(page, name);

    // 丁放到乙的上方，即甲、乙之间
    await dragRowTo(page, await getMenuRow(page, names[3]), await getMenuRow(page, names[1]), 'before');

    const expected = [names[0], names[3], names[1], names[2]];
    await expect.poll(() => rootOrder(page, 'menu', names)).toEqual(expected);

    await reload(page, MENU_SIMPLE.title);

    await expect.poll(() => rootOrder(page, 'menu', names)).toEqual(expected);
  });

  test('拖到组首与组尾', async ({ page }) => {
    await open(page, MENU_SIMPLE);
    const [a, b, c] = ['组首尾甲', '组首尾乙', '组首尾丙'];
    for (const name of [a, b, c]) await addRootMenu(page, name);

    // 丙到组首
    await dragRowTo(page, await getMenuRow(page, c), await getMenuRow(page, a), 'before');
    await expect.poll(() => rootOrder(page, 'menu', [a, b, c])).toEqual([c, a, b]);

    // 甲到组尾
    await dragRowTo(page, await getMenuRow(page, a), await getMenuRow(page, b), 'after');
    await expect.poll(() => rootOrder(page, 'menu', [a, b, c])).toEqual([c, b, a]);

    await reload(page, MENU_SIMPLE.title);

    await expect.poll(() => rootOrder(page, 'menu', [a, b, c])).toEqual([c, b, a]);
  });

  test('跨父拖到两个子节点之间', async ({ page }) => {
    await open(page, MENU_SIMPLE);
    const [parentP, parentQ] = ['跨父节点P', '跨父节点Q'];
    const [p1, q1, q2] = ['被拖子p1', '邻居子q1', '邻居子q2'];
    const rowP = await addRootMenu(page, parentP);
    const rowQ = await addRootMenu(page, parentQ);
    const moved = await addChildMenu(page, rowP, p1);
    const neighbor1 = await addChildMenu(page, rowQ, q1);
    await addChildMenu(page, rowQ, q2);

    // p1 放到 q1 下方，即 q1、q2 之间
    await dragRowTo(page, moved, neighbor1, 'after');

    const expected = [q1, p1, q2];
    await expect.poll(() => childOrder(page, 'menu', rowQ, expected)).toEqual(expected);
    await expectParent(page, 'menu', moved, rowQ);

    await reload(page, MENU_SIMPLE.title);

    const reloadedQ = await getMenuRow(page, parentQ);
    await expandRow(reloadedQ, 'menu');
    await expect.poll(() => childOrder(page, 'menu', reloadedQ, expected)).toEqual(expected);
    await expectParent(page, 'menu', await getMenuRow(page, p1), reloadedQ);
  });

  test('菜单懒加载：拖进折叠节点，展开后排在末尾', async ({ page }) => {
    await open(page, MENU_LAZY);
    const parentTitle = '懒加载父节点';
    const dragged = '懒加载待拖入';
    const children = ['懒加载子节点一', '懒加载子节点二'];
    const names = [...children, dragged];

    const parent = await addRootMenu(page, parentTitle);
    await addRootMenu(page, dragged);
    for (const title of children) await addChildMenu(page, parent, title);
    await reload(page, MENU_LAZY.title);

    // 刷新后父节点折叠、子节点没有加载：拖进去只写 { group }，不读子节点
    const collapsedParent = await getMenuRow(page, parentTitle);
    await dragRowTo(page, await getMenuRow(page, dragged), collapsedParent, 'into');
    await expect.poll(() => childOrder(page, 'menu', collapsedParent, names)).toEqual(names);

    await reload(page, MENU_LAZY.title);

    const reloadedParent = await getMenuRow(page, parentTitle);
    await expandRow(reloadedParent, 'menu');
    await expect.poll(() => childOrder(page, 'menu', reloadedParent, names)).toEqual(names);
  });

  test('拖到后代上被拒、零写', async ({ page }) => {
    await open(page, MENU_SIMPLE);
    const [parentTitle, childTitle] = ['后代被拖父', '后代目标子'];
    const parent = await addRootMenu(page, parentTitle);
    const child = await addChildMenu(page, parent, childTitle);
    const before = await undoCount(page, 'menu');

    for (const position of ['before', 'after', 'into'] as const) {
      await holdRowOver(page, parent, child, position);
      await expect(child).toHaveAttribute('data-drop-mode', position);
      await expect(child).toHaveAttribute('data-drop-valid', 'false');
      await page.mouse.up();
      await expectDropSettled(child);
    }

    await expectOnlySyncWrite(page, 'menu', before);
    await expect.poll(() => rootOrder(page, 'menu', [parentTitle, childTitle])).toEqual([parentTitle]);
    await expectParent(page, 'menu', child, parent);

    await reload(page, MENU_SIMPLE.title);

    const reloadedParent = await getMenuRow(page, parentTitle);
    await expandRow(reloadedParent, 'menu');
    await expect.poll(() => childOrder(page, 'menu', reloadedParent, [childTitle])).toEqual([childTitle]);
    await expect.poll(() => rootOrder(page, 'menu', [parentTitle, childTitle])).toEqual([parentTitle]);
  });

  test('原位放下与拖进当前父节点（已是末尾）都零写', async ({ page }) => {
    await open(page, MENU_SIMPLE);
    const parentTitle = '原位父节点';
    const [first, last] = ['原位子节点一', '原位子节点二'];
    const parent = await addRootMenu(page, parentTitle);
    const firstRow = await addChildMenu(page, parent, first);
    const lastRow = await addChildMenu(page, parent, last);
    const before = await undoCount(page, 'menu');

    // 第一个子节点放到第二个的上方：原位
    await dragRowTo(page, firstRow, lastRow, 'before');
    await expectDropSettled(lastRow);

    // 最后一个子节点拖进当前父节点：已是末尾，引擎零写
    await dragRowTo(page, lastRow, parent, 'into');
    await expectDropSettled(parent);
    await expectOnlySyncWrite(page, 'menu', before);

    await expect.poll(() => childOrder(page, 'menu', parent, [first, last])).toEqual([first, last]);

    await reload(page, MENU_SIMPLE.title);

    const reloadedParent = await getMenuRow(page, parentTitle);
    await expandRow(reloadedParent, 'menu');
    await expect.poll(() => childOrder(page, 'menu', reloadedParent, [first, last])).toEqual([first, last]);
  });

  test('拖放后撤销一次恢复', async ({ page }) => {
    await open(page, MENU_SIMPLE);
    const [sourceParent, targetParent] = ['撤销源父节点', '撤销目标父节点'];
    const [x1, x2] = ['撤销子节点一', '撤销子节点二'];
    const rowA = await addRootMenu(page, sourceParent);
    const rowB = await addRootMenu(page, targetParent);
    const moved = await addChildMenu(page, rowA, x1);
    await addChildMenu(page, rowA, x2);
    const before = await undoCount(page, 'menu');

    await dragRowTo(page, moved, rowB, 'into');
    await expectParent(page, 'menu', moved, rowB);
    await expect.poll(() => undoCount(page, 'menu')).toBeGreaterThan(before);

    // 一次撤销恢复一次拖放
    await page.getByTestId('menu-undo').click();

    await expect.poll(() => undoCount(page, 'menu')).toBe(before);
    await expectParent(page, 'menu', moved, rowA);
    await expect.poll(() => childOrder(page, 'menu', rowA, [x1, x2])).toEqual([x1, x2]);
    await expect.poll(() => childOrder(page, 'menu', rowB, [x1, x2])).toEqual([]);

    await reload(page, MENU_SIMPLE.title);

    const reloadedA = await getMenuRow(page, sourceParent);
    await expandRow(reloadedA, 'menu');
    await expect.poll(() => childOrder(page, 'menu', reloadedA, [x1, x2])).toEqual([x1, x2]);
  });

  test('虚拟滚动页同父重排', async ({ page }) => {
    await open(page, MENU_VIRTUAL);
    const names = ['虚拟拖放甲', '虚拟拖放乙', '虚拟拖放丙', '虚拟拖放丁'];
    for (const name of names) await addRootMenu(page, name);

    await dragRowTo(page, await getMenuRow(page, names[3]), await getMenuRow(page, names[1]), 'before');

    const expected = [names[0], names[3], names[1], names[2]];
    await expect.poll(() => rootOrder(page, 'menu', names)).toEqual(expected);

    await reload(page, MENU_VIRTUAL.title);

    await expect.poll(() => rootOrder(page, 'menu', names)).toEqual(expected);
  });

  test('文件管理器手动模式：文件夹之间重排、拖进文件夹', async ({ page }) => {
    await open(page, FILE_SIMPLE);
    const [folderA, folderB, folderC] = ['手动夹甲', '手动夹乙', '手动夹丙'];
    const fileD = '手动文件丁';
    const roots = [folderA, folderB, folderC, fileD];
    for (const name of [folderA, folderB, folderC]) await addRootEntry(page, name, 'folder');
    await addRootEntry(page, fileD, 'file');

    // 文件夹丙到文件夹甲上方
    await dragRowTo(page, await getFileRow(page, folderC), await getFileRow(page, folderA), 'before');
    await expect.poll(() => rootOrder(page, 'file', roots)).toEqual([folderC, folderA, folderB, fileD]);

    // 文件丁拖进文件夹乙
    const rowB = await getFileRow(page, folderB);
    await dragRowTo(page, await getFileRow(page, fileD), rowB, 'into');
    await expect.poll(() => rootOrder(page, 'file', roots)).toEqual([folderC, folderA, folderB]);
    await expectParent(page, 'file', await getFileRow(page, fileD), rowB);

    await reload(page, FILE_SIMPLE.title);

    await expect.poll(() => rootOrder(page, 'file', roots)).toEqual([folderC, folderA, folderB]);
    const reloadedB = await getFileRow(page, folderB);
    await expandRow(reloadedB, 'file');
    await expect.poll(() => childOrder(page, 'file', reloadedB, roots)).toEqual([fileD]);
  });

  test('文件管理器懒加载：拖进折叠文件夹，展开后排在末尾', async ({ page }) => {
    await open(page, FILE_LAZY);
    const folderName = '懒加载文件夹F';
    const dragged = '懒加载待拖入X';
    const children = ['懒加载子文件一', '懒加载子文件二'];
    const names = [...children, dragged];

    const folder = await addRootEntry(page, folderName, 'folder');
    await addRootEntry(page, dragged, 'file');
    for (const name of children) await addFileChild(page, folder, name, 'file');
    await reload(page, FILE_LAZY.title);

    // 刷新后文件夹折叠、子节点没有加载：拖进去只写 { group }，不读子节点
    const collapsedFolder = await getFileRow(page, folderName);
    await dragRowTo(page, await getFileRow(page, dragged), collapsedFolder, 'into');
    await expect.poll(() => childOrder(page, 'file', collapsedFolder, names)).toEqual(names);

    await reload(page, FILE_LAZY.title);

    const reloadedFolder = await getFileRow(page, folderName);
    await expandRow(reloadedFolder, 'file');
    await expect.poll(() => childOrder(page, 'file', reloadedFolder, names)).toEqual(names);
  });

  test('文件管理器非手动模式：子级拖到根级节点下方移到根组末尾', async ({ page }) => {
    await open(page, FILE_SIMPLE);
    const [folderA, folderB] = ['非手动根夹甲', '非手动根夹乙'];
    const childName = '非手动子文件丙';
    const names = [folderA, folderB, childName];
    const rowA = await addRootEntry(page, folderA, 'folder');
    await addRootEntry(page, folderB, 'folder');
    const child = await addFileChild(page, rowA, childName, 'file');

    await selectSortMode(page, 'name-asc');

    // 非手动模式根级行仍分三档：下方放置把子级移到根组末尾
    const rowB = await getFileRow(page, folderB);
    await holdRowOver(page, child, rowB, 'after');
    await expect(rowB).toHaveAttribute('data-drop-mode', 'after');
    await expect(rowB).toHaveAttribute('data-drop-valid', 'true');
    await page.mouse.up();
    await expect(child).toHaveAttribute('data-level', '0');

    // 切回手动模式，根组末尾是它
    await selectSortMode(page, 'manual');
    await expect.poll(() => rootOrder(page, 'file', names)).toEqual([folderA, folderB, childName]);

    await reload(page, FILE_SIMPLE.title);

    await expect.poll(() => rootOrder(page, 'file', names)).toEqual([folderA, folderB, childName]);
  });

  test('文件管理器非手动模式：同级前后放置被拒', async ({ page }) => {
    await open(page, FILE_SIMPLE);
    const [folderA, folderB] = ['同级被拒夹甲', '同级被拒夹乙'];
    const names = [folderA, folderB];
    const rowA = await addRootEntry(page, folderA, 'folder');
    const rowB = await addRootEntry(page, folderB, 'folder');
    await selectSortMode(page, 'name-asc');
    const before = await undoCount(page, 'file');

    for (const position of ['before', 'after'] as const) {
      await holdRowOver(page, rowA, rowB, position);
      await expect(rowB).toHaveAttribute('data-drop-mode', position);
      await expect(rowB).toHaveAttribute('data-drop-valid', 'false');
      await page.mouse.up();
      await expectDropSettled(rowB);
    }

    await expectOnlySyncWrite(page, 'file', before);

    // 顺序以手动模式读回：零写，仍是 甲、乙
    await selectSortMode(page, 'manual');
    await expect.poll(() => rootOrder(page, 'file', names)).toEqual(names);
    await reload(page, FILE_SIMPLE.title);
    await expect.poll(() => rootOrder(page, 'file', names)).toEqual(names);
  });
});
