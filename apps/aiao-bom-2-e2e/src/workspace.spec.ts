import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

async function open(page: Page, url = '/'): Promise<void> {
  await page.goto(url);
  await expect(page.getByTestId('bom-grid').locator('canvas').first()).toBeVisible();
}
async function dialog(page: Page, name: string) {
  await page.getByRole('button', { name, exact: true }).first().click();
  return page.locator('dialog[open]');
}
async function hideModel(page: Page) {
  const close = page.getByRole('button', { name: '关闭模型与详情' });
  if (await close.count()) await close.click();
}
async function clickRow(page: Page, row: number) {
  await expect(page.getByTestId('bom-grid')).toHaveAttribute('aria-busy', 'false');
  const box = await page.getByTestId('bom-grid').boundingBox();
  if (!box) throw new Error('表格未渲染');
  await page.mouse.click(box.x + 155, box.y + 40 + row * 35 + 17);
}

test('真实数据、范围导航、搜索祖先与三种视图', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await open(page);
  await hideModel(page);
  await expect(page.getByText('1,424 主清单物料')).toBeVisible();
  await page.getByRole('button', { name: '冷却系统 90', exact: true }).click();
  await expect(page.getByRole('navigation', { name: '当前范围' })).toContainText('冷却系统');
  await page.getByRole('button', { name: '平铺', exact: true }).click();
  await expect(page.getByTestId('bom-grid')).toHaveAttribute('data-row-count', /\d+/);
  await page.getByRole('button', { name: '全部系统 2,362', exact: true }).click();
  await page.getByRole('textbox', { name: '搜索 BOM', exact: true }).fill('1319317');
  await expect(page.getByTestId('matched-count')).toHaveText('1');
  await clickRow(page, 0);
  await expect(page.getByTestId('selected-summary')).toContainText('1319317');
  await page.getByRole('button', { name: '结构树', exact: true }).click();
  await expect(page.getByTestId('bom-grid')).toHaveAttribute('data-row-count', '2');
  await page.getByRole('button', { name: '汇总', exact: true }).click();
  await expect(page.getByTestId('bom-grid')).toHaveAttribute('data-row-count', '1');
  expect(errors).toEqual([]);
});

test('草稿编辑、撤销重做、刷新恢复、差异与本地提交', async ({ page }) => {
  await open(page, '/?pn=1108100X9D01');
  await hideModel(page);
  const fork = await dialog(page, '建立工作草稿');
  await fork.getByRole('button', { name: '建立分支', exact: true }).click();
  await page.getByRole('textbox', { name: '搜索 BOM', exact: true }).fill('1108100');
  await expect(page.getByTestId('matched-count')).toHaveText('1');
  await clickRow(page, 1);
  await page.getByRole('button', { name: '差异', exact: true }).click();
  await page.getByRole('button', { name: '将当前草稿保存为基线' }).click();
  await page.locator('dialog').getByRole('button', { name: '关闭', exact: true }).click();
  const edit = await dialog(page, '编辑用量');
  await edit.getByRole('textbox', { name: '直接用量', exact: true }).fill('2.5');
  await edit.getByRole('textbox', { name: '单位成本', exact: true }).fill('0.1');
  await edit.getByRole('button', { name: '确认', exact: true }).click();
  await expect(page.getByTestId('selected-summary')).toContainText('2.5');
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await expect(page.getByTestId('selected-summary')).toContainText('1 件');
  await page.getByRole('button', { name: '重做', exact: true }).click();
  await expect(page.getByTestId('selected-summary')).toContainText('2.5');
  await expect(page.locator('.app-footer')).toContainText('已保存到本机');
  await page.reload();
  await expect(page.getByTestId('selected-summary')).toContainText('2.5');
  await page.getByRole('button', { name: '差异', exact: true }).click();
  await expect(page.locator('dialog')).toContainText('1 → 2.5');
  await page.locator('dialog').getByRole('button', { name: '关闭', exact: true }).click();
  await page.getByRole('button', { name: '提交版本', exact: true }).click();
  const commit = page.getByRole('dialog');
  await commit.getByRole('textbox', { name: '提交说明', exact: true }).fill('确认草稿用量');
  await commit.getByRole('button', { name: '确认', exact: true }).click();
  await expect(page.locator('.app-footer')).toContainText('已提交到本地版本历史');
  const history = await dialog(page, '版本历史');
  await expect(history).toContainText('确认草稿用量');
  await expect(history).toContainText('HEAD');
  await expect(history.getByRole('button', { name: '导入', exact: true })).toHaveCount(0);
  await expect(history.getByRole('button', { name: '导出', exact: true })).toHaveCount(0);
});

test('导入导出入口已取消，模型失败可见且表格仍可操作', async ({ page }) => {
  await page.route('**/models/*.glb', route => route.abort());
  await open(page);
  await expect(page.getByText(/3D 加载失败/)).toBeVisible();
  await hideModel(page);
  await expect(page.getByRole('button', { name: '导入', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '导出', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '平铺', exact: true }).click();
  await expect(page.getByTestId('bom-grid')).toBeVisible();
});

test('真实整车模型完成解码，表格与模型双向定位', async ({ page }) => {
  const decoder = await page.request.get('/draco/draco_decoder.wasm');
  expect(decoder.status()).toBe(200);
  expect(decoder.headers()['content-type']).toContain('application/wasm');
  expect(Array.from((await decoder.body()).subarray(0, 8))).toEqual([0, 97, 115, 109, 1, 0, 0, 0]);
  let vehicleRequests = 0;
  page.on('request', request => {
    if (request.url().endsWith('/models/eu-x9d13.glb')) vehicleRequests++;
  });
  await open(page, '/?structure=cad&pn=1321315X9D01A');
  await expect(page.locator('.mapping-state')).toContainText('具体模型位置', { timeout: 90000 });
  await expect(page.locator('.mapping-state')).toContainText('几何节点');
  await page.getByRole('button', { name: '隔离', exact: true }).click();
  await expect(page.getByRole('button', { name: '隔离', exact: true })).toHaveClass(/active/);
  await page.getByRole('button', { name: '还原', exact: true }).click();
  const canvas = page.getByTestId('model-viewport').locator('canvas');
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('模型画布缺失');
  const occurrence = new URL(page.url()).searchParams.get('occurrence');
  for (const x of [0.5, 0.4, 0.6]) await page.mouse.click(box.x + box.width * x, box.y + box.height * 0.5);
  await expect.poll(() => new URL(page.url()).searchParams.get('occurrence')).not.toBe(occurrence);
  await expect(page.getByTestId('selected-summary')).not.toContainText('1321315X9D01A');
  await expect(page.locator('.mapping-state')).toContainText('具体模型位置');
  expect(vehicleRequests).toBe(1);
  await mkdir('test-output/evidence', { recursive: true });
  await page.screenshot({ path: 'test-output/evidence/workbench-3d.png' });
  const response = await page.request.get('/');
  expect(response.headers()['cross-origin-embedder-policy']).toBe('require-corp');
  expect(await page.evaluate(() => window.crossOriginIsolated)).toBe(true);
});

test('375px 窄屏搜索、面板开合与键盘路径可用', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await open(page);
  await hideModel(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375);
  await page.getByRole('textbox', { name: '搜索 BOM', exact: true }).fill('1108100');
  await expect(page.getByTestId('matched-count')).toHaveText('1');
  await page.getByRole('button', { name: '打开详情面板' }).click();
  await expect(page.getByRole('complementary', { name: '模型与物料详情' })).toBeVisible();
  await hideModel(page);
  await expect(page.getByRole('button', { name: '导入', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '导出', exact: true })).toHaveCount(0);
});
