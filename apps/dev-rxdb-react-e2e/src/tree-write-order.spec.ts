import { expect, type Locator, type Page, test } from '@playwright/test';

import {
  addRootFolder,
  addRootMenu,
  expectMenuParent,
  getFileRow,
  getMenuRow,
  openPage,
  readCount,
  requireAttribute
} from './e2e-utils.js';

/**
 * US-031 阶段 A：树页面的创建类写入不再自己算排序键，由引擎把新节点追加到所属父节点组的末尾。
 * 这里验的是用户可见的结果：新建、批量添加、删除并提升之后，刷新页面，顺序仍是库里提交的顺序。
 *
 * 文件管理器「自由排序」显示的就是库里的手动顺序（US-031 阶段 B 起不再文件夹优先），
 * 所以文件与文件夹交替新建的顺序就是新建先后。
 */

/** 某个父节点下的菜单行（按页面上的 DOM 顺序）。 */
function menuChildRows(page: Page, parentId: string): Locator {
  return page.locator(`[data-testid="menu-row"][data-parent-id=${JSON.stringify(parentId)}]`);
}

/** 在 `parent` 下新建一个子菜单：悬停出现行内按钮 -> 选中父节点 -> 提交。 */
async function addMenuChild(page: Page, parent: Locator, title: string): Promise<Locator> {
  await parent.hover();
  await parent.getByTestId('menu-add-child').click();
  await page.getByTestId('menu-title-input').fill(title);
  await page.getByTestId('menu-submit-child').click();
  const child = await getMenuRow(page, title);
  await expectMenuParent(child, parent);
  return child;
}

/** 切换文件管理器的新建模式（按钮上显示的是当前模式）。 */
async function selectAddMode(page: Page, mode: '文件' | '文件夹'): Promise<void> {
  const toggle = page.getByTestId('file-mode-toggle');
  if ((await toggle.innerText()).trim() !== mode) await toggle.click();
  await expect(toggle).toHaveText(mode);
}

/** 在根目录新建一个 .txt 文件，返回它的行（行内文本为「<名称>.txt」）。 */
async function addRootFile(page: Page, name: string): Promise<Locator> {
  await selectAddMode(page, '文件');
  const input = page.getByTestId('file-name-input');
  await input.fill(name);
  await page.getByTestId('file-submit').click();
  const row = await getFileRow(page, `${name}.txt`);
  await expect(input).toHaveValue('');
  return row;
}

/** 在根目录新建一个文件夹。 */
async function addRootFolderInMode(page: Page, name: string): Promise<Locator> {
  await selectAddMode(page, '文件夹');
  return addRootFolder(page, name);
}

/** 页面上当前渲染的文件行 id，按 DOM 顺序。 */
function renderedFileIds(page: Page): Promise<string[]> {
  return page.getByTestId('file-row').evaluateAll(rows => rows.map(row => row.getAttribute('data-file-id') ?? ''));
}

/** 点批量添加的某一档，等按钮恢复可用。 */
async function batchAddMenus(page: Page, count: number): Promise<void> {
  await page.getByTestId('menu-batch-add').click();
  const option = page.getByTestId(`menu-batch-option-${count}`);
  await option.click();
  await expect(option).toBeEnabled({ timeout: 60000 });
}

test.describe('树页面创建类写入的顺序（US-031 阶段 A）', () => {
  // 串行：几条用例都要刷新页面、批量写入，分散到多个 worker 并发时会抢占本机 CPU，
  // 拖慢同时在跑的别的用例（实测会让 search-refresh 等不到结果）
  test.describe.configure({ mode: 'serial' });

  test('根级依次新建文件夹、文件、文件夹，刷新后顺序不变', async ({ page }) => {
    await openPage(page, '/file-manager-simple', 'File Manager - Simple');

    const folderA = await addRootFolderInMode(page, '甲夹');
    const fileX = await addRootFile(page, '乙文件');
    const folderB = await addRootFolderInMode(page, '丙夹');
    const [idFolderA, idFile, idFolderB] = await Promise.all([
      requireAttribute(folderA, 'data-file-id', '文件夹甲夹行'),
      requireAttribute(fileX, 'data-file-id', '文件乙文件行'),
      requireAttribute(folderB, 'data-file-id', '文件夹丙夹行')
    ]);
    const created = [idFolderA, idFile, idFolderB];
    const orderOf = async () => (await renderedFileIds(page)).filter(id => created.includes(id));

    // 手动顺序：文件夹 A、文件 X、文件夹 B，与新建先后一致，不再文件夹优先
    expect(await orderOf()).toEqual([idFolderA, idFile, idFolderB]);

    await page.reload();
    await expect(page.getByTestId('file-row')).toHaveCount(3);
    expect(await orderOf()).toEqual([idFolderA, idFile, idFolderB]);
  });

  test('折叠节点下新建子节点，展开后排在末尾', async ({ page }) => {
    await openPage(page, '/menu-lazy', 'Tree Menu - Lazy Load');

    const parent = await addRootMenu(page, '折叠父节点');
    const parentId = await requireAttribute(parent, 'data-menu-id', '父节点行');
    await addMenuChild(page, parent, '子一');
    await addMenuChild(page, parent, '子二');

    // 折叠：子节点从页面上卸载，页面不再持有它们
    await parent.getByTestId('menu-node-toggle').click();
    await expect(menuChildRows(page, parentId)).toHaveCount(0);

    // 在折叠、子节点未加载的节点下新建：库里的子节点连同新节点一起载入，新节点在末尾
    await addMenuChild(page, parent, '子三');
    await expect(menuChildRows(page, parentId)).toHaveText([/子一/, /子二/, /子三/]);

    // 刷新后重新展开，顺序仍是库里提交的顺序
    await page.reload();
    const reloaded = await getMenuRow(page, '折叠父节点');
    const toggle = reloaded.getByTestId('menu-node-toggle');
    await expect(toggle).toBeEnabled();
    await toggle.click();
    await expect(menuChildRows(page, parentId)).toHaveText([/子一/, /子二/, /子三/]);
  });

  test('删除并提升子节点，子节点排到祖父组末尾', async ({ page }) => {
    await openPage(page, '/menu-simple', 'Tree Menu - Simple');

    const grand = await addRootMenu(page, '祖父G');
    const grandId = await requireAttribute(grand, 'data-menu-id', '祖父行');
    const parent = await addMenuChild(page, grand, '父P');
    await addMenuChild(page, grand, '兄弟Q');
    await addMenuChild(page, parent, '子c1');
    await addMenuChild(page, parent, '子c2');
    await expect(menuChildRows(page, grandId)).toHaveText([/父P/, /兄弟Q/]);

    await parent.hover();
    await parent.getByTestId('menu-delete').click();
    await page.getByRole('button', { name: /删除父节点/ }).click();
    await expect(parent).toHaveCount(0);

    // 刷新后：被删节点的子节点接在祖父组原有成员之后，且保持它们原有的相对顺序
    await page.reload();
    await expect(menuChildRows(page, grandId)).toHaveText([/兄弟Q/, /子c1/, /子c2/]);
  });

  test('删除并提升失败后，重命名子节点不夹带失败的移动', async ({ page }) => {
    await openPage(page, '/menu-simple', 'Tree Menu - Simple');

    const parent = await addRootMenu(page, '提升父P');
    const parentId = await requireAttribute(parent, 'data-menu-id', '父节点行');
    const child = await addMenuChild(page, parent, '重名S');
    const childId = await requireAttribute(child, 'data-menu-id', '子节点行');

    // 根组再建一个同名节点：提升会撞上根组同级唯一索引，整批回滚。
    // 刷新清掉选中的父节点；两行同名，按行数而不是按标题取行
    await page.reload();
    const input = page.getByTestId('menu-title-input');
    await input.fill('重名S');
    await page.getByTestId('menu-add-root').click();
    await expect(page.getByTestId('menu-row').filter({ hasText: '重名S' })).toHaveCount(2);
    await expect(input).toHaveValue('');

    const parentRow = page.locator(`[data-testid="menu-row"][data-menu-id=${JSON.stringify(parentId)}]`);
    await parentRow.hover();
    await parentRow.getByTestId('menu-delete').click();
    await page.getByRole('button', { name: /删除父节点/ }).click();
    await expect(page.getByTestId('tree-write-error')).toContainText('删除并提升子节点失败');
    await expect(parentRow).toBeVisible();

    // 只改子节点的标题：失败的移动不能随这次保存落库
    const childRow = page.locator(`[data-testid="menu-row"][data-menu-id=${JSON.stringify(childId)}]`);
    await childRow.hover();
    await childRow.getByTestId('menu-edit').click();
    const editInput = childRow.getByTestId('menu-edit-input');
    await editInput.fill('改名C');
    await editInput.press('Enter');
    await expect(childRow).toContainText('改名C');

    await page.reload();
    await expect(childRow).toContainText('改名C');
    await expect(childRow).toHaveAttribute('data-parent-id', parentId);
  });

  test('懒加载页新建同名根节点被拒后保留输入', async ({ page }) => {
    await openPage(page, '/menu-lazy', 'Tree Menu - Lazy Load');
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
    await openPage(page, '/menu-lazy', 'Tree Menu - Lazy Load');

    const parent = await addRootMenu(page, '折叠待删节点');
    const parentId = await requireAttribute(parent, 'data-menu-id', '待删节点行');
    await addMenuChild(page, parent, '待删子一');
    await addMenuChild(page, parent, '待删子二');
    await parent.getByTestId('menu-node-toggle').click();
    await expect(menuChildRows(page, parentId)).toHaveCount(0);

    await parent.hover();
    await parent.getByTestId('menu-delete').click();

    // 子节点没加载，对话框仍须按库里的直接子节点给出「提升 / 级联」两个选项
    await expect(page.getByRole('button', { name: /删除父节点/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /级联删除/ })).toBeVisible();
    await page.getByRole('button', { name: '取消', exact: true }).click();
    await expect(parent).toBeVisible();
  });

  test('文件管理器懒加载页删除折叠文件夹弹出级联删除对话框', async ({ page }) => {
    await openPage(page, '/file-manager-lazy', 'File Manager - Lazy Load');

    const folder = await addRootFolderInMode(page, '待删文件夹');
    await folder.hover();
    await folder.getByTestId('file-select-parent').click();
    const input = page.getByTestId('file-name-input');
    await input.fill('待删子项');
    await page.getByTestId('file-submit').click();
    await expect(input).toHaveValue('');

    // 刷新后文件夹折叠、子项未加载：旧实现按已加载节点判断，对话框显示「确认删除」且无级联警告
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'File Manager - Lazy Load' })).toBeVisible();
    const rows = page.getByTestId('file-row');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText('待删文件夹');

    await rows.first().hover();
    await rows.first().getByTestId('file-delete').click();

    const dialog = page.locator('dialog.modal-open');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('1 个直接子项');
    await expect(dialog.getByRole('button', { name: '级联删除' })).toBeVisible();

    await dialog.getByRole('button', { name: '取消', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText('待删文件夹');
    await expect(page.getByTestId('tree-write-error')).toHaveCount(0);
  });

  test('批量添加后原有根节点仍在最前', async ({ page }) => {
    await openPage(page, '/menu-simple', 'Tree Menu - Simple');

    await addRootMenu(page, '原有根甲');
    await addRootMenu(page, '原有根乙');
    await batchAddMenus(page, 100);
    const badge = page.getByTestId('menu-count');
    await expect.poll(async () => readCount(await badge.textContent(), 'menu-count'), { timeout: 30000 }).toBe(102);

    await page.reload();
    const rows = page.getByTestId('menu-row');
    await expect(rows).toHaveCount(102);
    await expect(rows.nth(0)).toContainText('原有根甲');
    await expect(rows.nth(1)).toContainText('原有根乙');
  });

  test('文件管理器懒加载页批量添加后根级原有节点在前', async ({ page }) => {
    await openPage(page, '/file-manager-lazy', 'File Manager - Lazy Load');

    await addRootFile(page, '先建文件');
    await addRootFolderInMode(page, '后建夹');

    await page.getByTestId('file-batch-add').click();
    const option = page.getByTestId('file-batch-option-100');
    await option.click();
    await expect(option).toBeEnabled({ timeout: 30000 });
    const badge = page.getByTestId('file-count');
    await expect
      .poll(async () => readCount(await badge.textContent(), 'file-count'), { timeout: 30000 })
      .toBeGreaterThan(2);

    await page.reload();
    const rows = page.getByTestId('file-row');
    // 自由排序显示库里的手动顺序：两个原有根节点按新建先后排在最前，本批追加在它们之后（批内节点不会插到它们前面）
    await expect(rows.nth(0)).toHaveText(/^先建文件\.txt/u);
    await expect(rows.nth(1)).toHaveText(/^后建夹$/u);
  });
});
