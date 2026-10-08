import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  addChildMenu,
  addRootFolder,
  addRootMenu,
  getMenuDeleteButton,
  getMenuRow,
  openPage,
  readCount,
  requireAttribute,
  resetE2eState
} from './e2e-utils.js';

/**
 * US-031 阶段 A：树页面的创建类写入顺序（三端同名用例）。
 *
 * @remarks
 * 新建、批量添加与删除并提升子节点都不再由页面算排序键，由引擎把缺键的节点追加到所属 `parentId` 组末尾。
 * 这里只断言刷新后读回的顺序；键本身由 core 契约套件在真实后端上验。
 */

const MENU_SIMPLE = { path: '/menu-simple', title: 'Tree Menu - Simple' };
const MENU_LAZY = { path: '/menu-lazy', title: 'Tree Menu - Lazy Load' };
const FILE_SIMPLE = { path: '/file-manager-simple', title: 'File Manager - Simple' };
const FILE_LAZY = { path: '/file-manager-lazy', title: 'File Manager - Lazy' };

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

async function menuChildOrder(page: Page, parent: Locator, names: string[]): Promise<string[]> {
  const parentId = await requireAttribute(parent, 'data-menu-id', '父菜单行');
  const rows = page.getByTestId('menu-row').and(page.locator(`[data-parent-id=${JSON.stringify(parentId)}]`));
  return orderOf(await rows.allInnerTexts(), names);
}

async function rootMenuOrder(page: Page, names: string[]): Promise<string[]> {
  return orderOf(await page.getByTestId('menu-row').allInnerTexts(), names);
}

async function fileOrder(page: Page, names: string[]): Promise<string[]> {
  return orderOf(await page.getByTestId('file-row').allInnerTexts(), names);
}

/** 文件管理器的添加模式开关，按钮文案即当前模式。 */
async function switchAddMode(page: Page, mode: 'file' | 'folder'): Promise<void> {
  const toggle = page.getByTestId('file-mode-toggle');
  const label = mode === 'file' ? '文件' : '文件夹';
  if ((await toggle.innerText()).trim() !== label) await toggle.click();
  await expect(toggle).toHaveText(label);
}

async function addRootEntry(page: Page, name: string, mode: 'file' | 'folder'): Promise<void> {
  await switchAddMode(page, mode);
  await expect(await addRootFolder(page, name)).toBeVisible();
}

async function batchAdd(page: Page, kind: 'menu' | 'file', count: 100): Promise<void> {
  await page.getByTestId(`${kind}-batch-add`).click();
  const option = page.getByTestId(`${kind}-batch-option-${count}`);
  await expect(option).toBeVisible();
  await option.click();
  await expect(option).toBeEnabled({ timeout: 60000 });
}

test.describe('树页面创建类写入的顺序（US-031 阶段 A）', () => {
  // 串行：几条用例都要刷新页面、批量写入，分散到多个 worker 并发时会抢占本机 CPU，
  // 拖慢同时在跑的别的用例（实测会让 search-refresh 等不到结果）
  test.describe.configure({ mode: 'serial' });

  test('根级依次新建文件夹、文件、文件夹，刷新后顺序不变', async ({ page }) => {
    await open(page, FILE_SIMPLE);
    const names = ['顺序文件夹甲', '顺序文件乙', '顺序文件夹丙'];

    await addRootEntry(page, names[0], 'folder');
    await addRootEntry(page, names[1], 'file');
    await addRootEntry(page, names[2], 'folder');

    await expect.poll(() => fileOrder(page, names)).toEqual(names);

    await reload(page, FILE_SIMPLE.title);

    await expect.poll(() => fileOrder(page, names)).toEqual(names);
  });

  test('折叠节点下新建子节点，展开后排在末尾', async ({ page }) => {
    await open(page, MENU_LAZY);
    const parentTitle = '折叠父节点';
    const names = ['先有的子节点', '折叠后新建的子节点'];

    const parent = await addRootMenu(page, parentTitle);
    await addChildMenu(page, parent, names[0]);
    await reload(page, MENU_LAZY.title);

    // 刷新后父节点是折叠的、子节点没有加载；在这种状态下新建子节点
    const collapsedParent = await getMenuRow(page, parentTitle);
    await addChildMenu(page, collapsedParent, names[1]);
    await reload(page, MENU_LAZY.title);

    const reloadedParent = await getMenuRow(page, parentTitle);
    await reloadedParent.getByTestId('menu-node-toggle').click();

    await expect.poll(() => menuChildOrder(page, reloadedParent, names)).toEqual(names);
  });

  test('删除并提升子节点，子节点排到祖父组末尾', async ({ page }) => {
    await open(page, MENU_SIMPLE);
    const grandparentTitle = '提升祖父节点';
    const deletedTitle = '提升被删节点';
    const siblingTitle = '提升兄弟节点';
    const childTitles = ['提升子节点一', '提升子节点二'];
    const expectedOrder = [siblingTitle, ...childTitles];

    const grandparent = await addRootMenu(page, grandparentTitle);
    const deleted = await addChildMenu(page, grandparent, deletedTitle);
    await addChildMenu(page, grandparent, siblingTitle);
    for (const title of childTitles) await addChildMenu(page, deleted, title);

    await (await getMenuDeleteButton(deleted)).click();
    await page.getByRole('button', { name: /子节点提升/ }).click();

    await expect(page.getByTestId('menu-row').filter({ hasText: deletedTitle })).toHaveCount(0);
    await expect.poll(() => menuChildOrder(page, grandparent, expectedOrder)).toEqual(expectedOrder);

    await reload(page, MENU_SIMPLE.title);

    const reloadedGrandparent = await getMenuRow(page, grandparentTitle);
    await reloadedGrandparent.getByTestId('menu-node-toggle').click();
    await expect.poll(() => menuChildOrder(page, reloadedGrandparent, expectedOrder)).toEqual(expectedOrder);
  });

  test('删除并提升失败后，重命名子节点不夹带失败的移动', async ({ page }) => {
    await open(page, MENU_SIMPLE);

    const parent = await addRootMenu(page, '提升父P');
    const parentId = await requireAttribute(parent, 'data-menu-id', '父节点行');
    const child = await addChildMenu(page, parent, '重名S');
    const childId = await requireAttribute(child, 'data-menu-id', '子节点行');

    // 根组再建一个同名节点：提升会撞上根组同级唯一索引，整批回滚。
    // 刷新清掉选中的父节点；两行同名，按 id 而不是按标题取行
    await reload(page, MENU_SIMPLE.title);
    const input = page.getByTestId('menu-title-input');
    await input.fill('重名S');
    await page.getByTestId('menu-add-root').click();
    await expect(input).toHaveValue('');

    const parentRow = page.locator(`[data-testid="menu-row"][data-menu-id=${JSON.stringify(parentId)}]`);
    const childRow = page.locator(`[data-testid="menu-row"][data-menu-id=${JSON.stringify(childId)}]`);
    await parentRow.getByTestId('menu-node-toggle').click();
    await expect(childRow).toBeVisible();

    await (await getMenuDeleteButton(parentRow)).click();
    await page.getByRole('button', { name: /子节点提升/ }).click();
    await expect(page.getByTestId('tree-write-error')).toContainText('删除并提升子节点失败');
    await expect(parentRow).toBeVisible();

    // 只改子节点的标题：失败的移动不能随这次保存落库
    await childRow.hover();
    await childRow.getByTestId('menu-edit').click();
    const editInput = childRow.getByTestId('menu-edit-input');
    await editInput.fill('改名C');
    await editInput.press('Enter');
    await expect(childRow).toContainText('改名C');

    await reload(page, MENU_SIMPLE.title);
    await parentRow.getByTestId('menu-node-toggle').click();
    await expect(childRow).toContainText('改名C');
    await expect(childRow).toHaveAttribute('data-parent-id', parentId);
  });

  test('懒加载页新建同名根节点被拒后保留输入', async ({ page }) => {
    await open(page, MENU_LAZY);
    await addRootMenu(page, '重名根R');

    // 第二次提交同名根节点：被拒（同级唯一索引或页面重名校验），输入框不得被清空
    const input = page.getByTestId('menu-title-input');
    await input.fill('重名根R');
    await page.getByTestId('menu-add-root').click();
    await expect(page.getByTestId('tree-write-error')).toContainText('新建失败');
    await expect(input).toHaveValue('重名根R');
    await expect(page.getByTestId('menu-row').filter({ hasText: '重名根R' })).toHaveCount(1);
  });

  test('懒加载页删除折叠节点仍弹出选择对话框', async ({ page }) => {
    await open(page, MENU_LAZY);
    const parentTitle = '待删折叠父节点';

    const parent = await addRootMenu(page, parentTitle);
    await addChildMenu(page, parent, '待删折叠子节点');
    await reload(page, MENU_LAZY.title);

    // 刷新后父节点折叠、子节点没有加载
    const collapsedParent = await getMenuRow(page, parentTitle);
    await (await getMenuDeleteButton(collapsedParent)).click();

    await expect(page.getByRole('button', { name: /子节点提升/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /级联删除/ })).toBeVisible();
    await expect(collapsedParent).toBeVisible();

    await page.getByRole('button', { name: '取消' }).click();
    await expect(collapsedParent).toBeVisible();
  });

  test('批量添加后原有根节点仍在最前', async ({ page }) => {
    await open(page, MENU_SIMPLE);
    const existing = ['最前原有根节点甲', '最前原有根节点乙'];
    for (const title of existing) await addRootMenu(page, title);
    const countBefore = readCount(await page.getByTestId('menu-count').textContent(), '菜单计数徽标');

    await batchAdd(page, 'menu', 100);
    await expect
      .poll(async () => readCount(await page.getByTestId('menu-count').textContent(), '菜单计数徽标'), {
        timeout: 30000
      })
      .toBeGreaterThanOrEqual(countBefore + 100);

    await reload(page, MENU_SIMPLE.title);

    await expect.poll(async () => (await rootMenuOrder(page, existing)).join()).toBe(existing.join());
    await expect(page.getByTestId('menu-row').nth(0)).toContainText(existing[0]);
    await expect(page.getByTestId('menu-row').nth(1)).toContainText(existing[1]);
  });

  test('文件管理器懒加载页批量添加后根级原有节点在前', async ({ page }) => {
    await open(page, FILE_LAZY);
    const fileName = '懒加载根文件X';
    const folderName = '懒加载根文件夹F';

    await addRootEntry(page, fileName, 'file');
    await addRootEntry(page, folderName, 'folder');

    await batchAdd(page, 'file', 100);

    await reload(page, FILE_LAZY.title);

    await expect(page.getByTestId('file-row').nth(0)).toContainText(fileName);
    await expect(page.getByTestId('file-row').nth(1)).toContainText(folderName);
  });
});
