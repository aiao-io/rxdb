import type { Locator, Page } from '@playwright/test';
import { readCount, readRequiredAttribute, resetE2eState } from './e2e-utils.js';
import { expect, test } from './fixtures.js';

/**
 * US-031 阶段 A：树页面创建类写入的顺序与删除选择。
 *
 * @remarks
 * 排序键归引擎：新建、批量添加、删除并提升子节点都不由页面算键，新行一律追加到所属 `parentId` 组的末尾。
 * e2e 读不到键，只断言操作后**刷新读回**的显示顺序；写入失败的分支只在单测里验（本地库无法从 Playwright 注入失败）。
 * 三端同名用例：React / Vue 的 `tree-write-order.spec.ts` 与这里的标题一致。
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

// ---------------------------------------------------------------------------
// 菜单页（simple / lazy 共用）
// ---------------------------------------------------------------------------

function menuRow(page: Page, title: string): Locator {
  return page.getByTestId('menu-row').filter({ hasText: title }).first();
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

// ---------------------------------------------------------------------------
// 文件管理器页（simple / lazy 共用）
// ---------------------------------------------------------------------------

function fileRows(page: Page): Locator {
  return page.getByTestId('file-row');
}

async function addRootFolder(page: Page, name: string, expectedRowCount: number): Promise<void> {
  const input = page.getByTestId('file-name-input');
  await input.fill(name);
  await page.getByTestId('file-submit').click();
  await expect(fileRows(page).filter({ hasText: name })).toBeVisible({ timeout: WRITE_TIMEOUT });
  await expect(input).toHaveValue('', { timeout: WRITE_TIMEOUT });
  await expect(fileRows(page)).toHaveCount(expectedRowCount, { timeout: WRITE_TIMEOUT });
}

/** 切到文件模式新建根文件（默认扩展名 `.txt`），建完切回文件夹模式。 */
async function addRootFile(page: Page, name: string, expectedRowCount: number): Promise<void> {
  const toggle = page.locator('button[aria-label="切换模式"]');
  await toggle.click();
  await expect(page.getByTestId('file-extension-select')).toBeVisible();

  const input = page.getByTestId('file-name-input');
  await input.fill(name);
  await page.getByTestId('file-submit').click();
  await expect(fileRows(page).filter({ hasText: name })).toBeVisible({ timeout: WRITE_TIMEOUT });
  await expect(input).toHaveValue('', { timeout: WRITE_TIMEOUT });
  await expect(fileRows(page)).toHaveCount(expectedRowCount, { timeout: WRITE_TIMEOUT });

  await toggle.click();
  await expect(page.getByTestId('file-extension-select')).toBeHidden();
}

test.describe('树页面创建类写入的顺序（US-031 阶段 A）', () => {
  // 串行：几条用例都要刷新页面、批量写入，分散到多个 worker 并发时会抢占本机 CPU，
  // 拖慢同时在跑的别的用例（实测会让 search-refresh 等不到结果）
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    await resetE2eState(page);
  });

  test('根级依次新建文件夹、文件、文件夹，刷新后顺序不变', async ({ page }) => {
    await page.goto('/file-manager-simple');
    await expect(page.locator('app-file-manager-simple-page')).toBeVisible({ timeout: WRITE_TIMEOUT });
    await expect(page.getByTestId('file-name-input')).toBeVisible({ timeout: WRITE_TIMEOUT });

    // 缺陷一：文件与文件夹同属根这一组；只在根文件夹里取尾键时，B 会与 X 同键
    await addRootFolder(page, '文件夹A', 1);
    await addRootFile(page, '文件X', 2);
    await addRootFolder(page, '文件夹B', 3);
    await expectOrder(fileRows(page), [/文件夹A/, /文件X\.txt/, /文件夹B/]);

    await page.reload();
    await expect(page.locator('app-file-manager-simple-page')).toBeVisible({ timeout: WRITE_TIMEOUT });
    await expectOrder(fileRows(page), [/文件夹A/, /文件X\.txt/, /文件夹B/]);
    await expectNoWriteError(page);
  });

  test('折叠节点下新建子节点，展开后排在末尾', async ({ page }) => {
    const host = 'app-tree-menu-lazy-page';
    await gotoMenuPage(page, '/menu-lazy', host);

    await addRootMenu(page, '折叠父节点');
    await addChildMenu(page, '折叠父节点', '子节点一');
    await addChildMenu(page, '折叠父节点', '子节点二');

    // 刷新后懒加载页只有根节点：父节点折叠，子节点都未加载
    await reloadMenuPage(page, host);
    await expectOrder(page.getByTestId('menu-row'), [/折叠父节点/]);

    await addChildMenu(page, '折叠父节点', '子节点三');
    await expectOrder(page.getByTestId('menu-row'), [/折叠父节点/, /子节点一/, /子节点二/, /子节点三/]);

    // 再刷新、手动展开：新子节点仍在末尾
    await reloadMenuPage(page, host);
    await menuRow(page, '折叠父节点').getByTestId('menu-node-toggle').click();
    await expectOrder(page.getByTestId('menu-row'), [/折叠父节点/, /子节点一/, /子节点二/, /子节点三/]);
    await expectNoWriteError(page);
  });

  test('删除并提升子节点，子节点排到祖父组末尾', async ({ page }) => {
    const host = 'app-tree-menu-simple-page';
    await gotoMenuPage(page, '/menu-simple', host);

    // 祖父 G 下依次有 P、Q；P 下有 c1、c2
    await addRootMenu(page, '祖父G');
    await addChildMenu(page, '祖父G', '父P');
    await addChildMenu(page, '祖父G', '兄弟Q');
    await addChildMenu(page, '父P', '子c1');
    await addChildMenu(page, '父P', '子c2');
    await expectOrder(page.getByTestId('menu-row'), [/祖父G/, /父P/, /子c1/, /子c2/, /兄弟Q/]);

    const parent = menuRow(page, '父P');
    await parent.hover();
    await parent.getByTestId('menu-delete').click();
    await page.getByRole('button', { name: /删除父节点/ }).click();

    // 提升后子节点追加在 G 组末尾（Q 之后），而不是插回 P 原来的位置
    await expect(page.getByRole('dialog')).toBeHidden({ timeout: WRITE_TIMEOUT });
    await expectOrder(page.getByTestId('menu-row'), [/祖父G/, /兄弟Q/, /子c1/, /子c2/]);

    await reloadMenuPage(page, host);
    const grandparent = menuRow(page, '祖父G');
    await grandparent.getByTestId('menu-node-toggle').click();
    await expectOrder(page.getByTestId('menu-row'), [/祖父G/, /兄弟Q/, /子c1/, /子c2/]);

    const grandparentId = await readRequiredAttribute(grandparent, 'data-menu-id', '祖父行');
    await expect(menuRow(page, '子c1')).toHaveAttribute('data-parent-id', grandparentId);
    await expect(menuRow(page, '子c2')).toHaveAttribute('data-parent-id', grandparentId);
    await expectNoWriteError(page);
  });

  test('懒加载页删除折叠节点仍弹出选择对话框', async ({ page }) => {
    const host = 'app-tree-menu-lazy-page';
    await gotoMenuPage(page, '/menu-lazy', host);

    await addRootMenu(page, '待删父节点');
    await addChildMenu(page, '待删父节点', '待删子节点');

    // 刷新后父节点折叠、子节点未加载：旧实现按已加载节点判断，会当叶子直接删除并级联删掉子树
    await reloadMenuPage(page, host);
    await expectOrder(page.getByTestId('menu-row'), [/待删父节点/]);

    const parent = menuRow(page, '待删父节点');
    await parent.hover();
    await parent.getByTestId('menu-delete').click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: WRITE_TIMEOUT });
    await expect(dialog.getByRole('button', { name: /删除父节点/ })).toBeVisible();
    await expect(dialog.getByRole('button', { name: /级联删除/ })).toBeVisible();
    await expect(dialog).toContainText('1 个直接子节点');

    await dialog.getByRole('button', { name: '取消' }).click();
    await expect(dialog).toBeHidden();
    await expect(menuRow(page, '待删父节点')).toBeVisible();
    await expectNoWriteError(page);
  });

  test('批量添加后原有根节点仍在最前', async ({ page }) => {
    const host = 'app-tree-menu-simple-page';
    await gotoMenuPage(page, '/menu-simple', host);

    await addRootMenu(page, '原有根甲');
    await addRootMenu(page, '原有根乙');
    const countBadge = page.getByTestId('menu-count');
    const countBefore = readCount(await countBadge.textContent(), '菜单计数徽标');

    await page.getByTestId('menu-batch-add').click();
    const option100 = page.getByTestId('menu-batch-option-100');
    await option100.click();
    await expect(option100).toBeEnabled({ timeout: 60_000 });
    await expect
      .poll(async () => readCount(await countBadge.textContent(), '菜单计数徽标'), { timeout: 30_000 })
      .toBeGreaterThanOrEqual(countBefore + 100);

    // 旧实现把整批按批内顺序重算键、从首键起，批内根节点会插到原有根节点前面
    await reloadMenuPage(page, host);
    const rows = page.getByTestId('menu-row');
    await expect(rows.nth(0)).toContainText('原有根甲', { timeout: WRITE_TIMEOUT });
    await expect(rows.nth(1)).toContainText('原有根乙');
    await expectNoWriteError(page);
  });

  test('文件管理器懒加载页批量添加后根级原有节点在前', async ({ page }) => {
    await page.goto('/file-manager-lazy');
    await expect(page.locator('app-file-manager-lazy-page')).toBeVisible({ timeout: WRITE_TIMEOUT });
    await expect(page.getByTestId('file-name-input')).toBeVisible({ timeout: WRITE_TIMEOUT });

    await addRootFile(page, '原有文件X', 1);
    await addRootFolder(page, '原有文件夹F', 2);
    const countBadge = page.getByTestId('file-count');
    const countBefore = readCount(await countBadge.textContent(), '根节点计数徽标');

    await page.getByTestId('file-batch-add').click();
    const option100 = page.getByTestId('file-batch-option-100');
    await option100.click();
    await expect(option100).toBeEnabled({ timeout: 60_000 });
    // 懒加载页徽标只数根节点，批内一部分节点落在根上即可增长
    await expect
      .poll(async () => readCount(await countBadge.textContent(), '根节点计数徽标'), { timeout: 30_000 })
      .toBeGreaterThan(countBefore);

    // 旧实现以页面已加载的根节点作锚点，其余（含未加载的）组从首键起算
    await page.reload();
    await expect(page.locator('app-file-manager-lazy-page')).toBeVisible({ timeout: WRITE_TIMEOUT });
    const rows = fileRows(page);
    await expect(rows.nth(0)).toContainText('原有文件X.txt', { timeout: WRITE_TIMEOUT });
    await expect(rows.nth(1)).toContainText('原有文件夹F');
    await expectNoWriteError(page);
  });
});
