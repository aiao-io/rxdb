import type { Locator, Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { resetE2eState } from './e2e-utils.js';

/**
 * 移动端（390×844）UX 回归：与 Angular demo 的 mobile-ux.spec.ts 同构，
 * Vue demo 移动端体验优化的每条修复各占一条用例。
 *
 * @remarks 整组串行：对话框 / VTable 等窄视口用例都偏重，本地 e2e 又是
 * 8 worker 无重试，偏重的 spec 默认串行以免拖垮无关用例。
 */
test.describe.configure({ mode: 'serial' });

const VIEWPORT = { width: 390, height: 844 };
const SETTLED = /^(success|empty|error)$/;

/** 断言元素横向完整落在视口内（右缘留 1px 容差）。 */
async function expectFitsHorizontally(locator: Locator): Promise<void> {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  expect(box, '元素应有包围盒').not.toBeNull();
  expect(box!.x, '左缘不得出屏').toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width, '右缘不得出屏').toBeLessThanOrEqual(VIEWPORT.width + 1);
}

const openPanel = async (page: Page): Promise<void> => {
  await resetE2eState(page);
  await page.goto('/working-tree', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('working-tree-page')).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId('wt-status-phase')).toHaveText(SETTLED, { timeout: 20000 });
};

const waitForAutoEnabled = async (page: Page): Promise<void> => {
  await expect(page.getByTestId('wt-enabled')).toHaveText('已启用', { timeout: 30000 });
  await expect(page.getByTestId('wt-status-phase')).toHaveText(/^(success|empty)$/, { timeout: 30000 });
};

test.beforeEach(async ({ page }) => {
  await resetE2eState(page);
  await page.setViewportSize(VIEWPORT);
});

test('移动端：entities 目录在上、列表在下', async ({ page }) => {
  await page.goto('/entities');
  const shell = page.getByTestId('entity-shell');
  await expect(shell).toBeVisible();

  const catalog = page.getByTestId('entity-catalog');
  await expect(catalog).toBeVisible();
  const catalogBox = await catalog.boundingBox();
  expect(catalogBox!.width, '目录在移动端应占满整行').toBeGreaterThan(VIEWPORT.width * 0.9);

  const canvas = shell.locator('canvas').first();
  await expect(canvas).toBeVisible();
  const canvasBox = await canvas.boundingBox();
  expect(canvasBox!.y, '实体列表应在目录下方').toBeGreaterThanOrEqual(catalogBox!.y + catalogBox!.height);
});

test('移动端：entities 新增对话框不横向溢出视口', async ({ page }) => {
  await page.goto('/entities');
  await expect(page.getByTestId('entity-shell')).toBeVisible();
  await page.getByRole('button', { name: '+ 新增' }).click();

  const pane = page.locator('.rxdb-dialog-pane').first();
  await expectFitsHorizontally(pane);

  await page.keyboard.press('Escape');
  await expect(pane).toHaveCount(0, { timeout: 5000 });
});

test('移动端：working-tree 工具栏三段平分、全部可达', async ({ page }) => {
  await openPanel(page);
  await waitForAutoEnabled(page);

  await expectFitsHorizontally(page.locator('.gd-toolbar'));
  await expectFitsHorizontally(page.getByTestId('wt-repo-menu'));
  await expectFitsHorizontally(page.getByTestId('wt-refresh-status'));
});

test('移动端：storage 工具栏换行、按钮不溢出', async ({ page }) => {
  await page.goto('/storage');
  await expect(page.getByTestId('storage-page')).toBeVisible();

  await expectFitsHorizontally(page.getByTestId('storage-upload-btn'));
  await expectFitsHorizontally(page.getByTestId('storage-upload-folder-btn'));
  await expectFitsHorizontally(page.getByTestId('storage-new-folder-btn'));
});

test('移动端：storage 行内重命名按钮可达（不依赖右键）', async ({ page }) => {
  await page.goto('/storage');
  await page.getByTestId('storage-file-input').setInputFiles({
    name: 'mobile.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('hello mobile')
  });
  await expect(page.getByTestId('storage-file-row')).toHaveCount(1, { timeout: 10000 });

  await page.getByTestId('storage-rename-btn').first().click();
  await expect(page.getByTestId('storage-rename-dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByTestId('storage-rename-dialog')).toHaveCount(0);
});

test('移动端：tree-menu 行内操作按钮常显', async ({ page }) => {
  await page.goto('/menu-simple');
  await page.getByTestId('menu-title-input').fill('移动菜单');
  await page.getByTestId('menu-add-root').click();
  await expect(page.getByTestId('menu-row')).toHaveCount(1);

  await expect(page.locator('.actions').first()).toHaveCSS('opacity', '1');
});

test('移动端：generator 编辑器上下排列', async ({ page }) => {
  await page.goto('/generator');
  const input = page.getByTestId('generator-input-editor');
  const output = page.getByTestId('generator-output-editor');
  await expect(input).toBeVisible();
  await expect(output).toBeVisible({ timeout: 15000 });

  const inputBox = await input.boundingBox();
  const outputBox = await output.boundingBox();
  expect(outputBox!.y, '输出编辑器应在输入编辑器下方').toBeGreaterThan(inputBox!.y);
});

test('移动端：tree-menu 历史侧栏以浮层呈现', async ({ page }) => {
  await page.goto('/menu-simple');
  await page.getByRole('button', { name: '历史记录' }).click();

  const sidebar = page.getByTestId('history-sidebar');
  await expect(sidebar).toBeVisible();
  const asideBox = await sidebar.boundingBox();
  expect(asideBox!.width, '历史浮层宽度').toBeLessThanOrEqual(240);

  const mainBox = await page.locator('main').first().boundingBox();
  expect(mainBox!.width, '主内容区在浮层打开时仍占满视口').toBeGreaterThan(VIEWPORT.width * 0.9);
});

test('移动端：working-tree 分支行 ⋯ 打开触屏菜单', async ({ page }) => {
  await openPanel(page);
  await waitForAutoEnabled(page);

  await page.getByTestId('wt-branch-menu').click();
  await expect(page.getByTestId('wt-branch-item').first()).toBeVisible();
  await page.getByTestId('wt-branch-more').first().click();
  // 当前分支的菜单只有 Copy branch name（切换/合并/删除只属于非当前分支）
  await expect(page.getByTestId('wt-branch-menu-copy')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.getByTestId('wt-branch-menu-copy')).toHaveCount(0);
});

test('移动端：旋转到桌面宽度后侧栏自动展开', async ({ page }) => {
  await openPanel(page);
  await waitForAutoEnabled(page);

  await expect(page.locator('#layout-main')).not.toHaveClass(/left-menu-pinned/);
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(page.locator('#layout-main')).toHaveClass(/left-menu-pinned/);
});
