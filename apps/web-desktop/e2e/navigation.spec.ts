import { expect, test, type Locator, type Page } from '@playwright/test';
import { readState } from './state.js';

async function enter(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: /^Windows 风格/ }).click();
  await page.getByRole('button', { name: '进入桌面', exact: true }).click();
}
async function openLocation(page: Page, window: Locator, route: string) {
  await window.getByLabel('窗口操作 文本编辑器', { exact: true }).click();
  await window.getByRole('button', { name: '打开位置…', exact: true }).click();
  await page.getByLabel('应用位置', { exact: true }).fill(route);
  await page.getByRole('button', { name: '打开位置', exact: true }).click();
}
async function savedRoutes(page: Page): Promise<string[]> {
  return (await readState(page)).session.map(item => item.route);
}

test('DESKTOP-US-305/501：文件目录、搜索、选择和设置页面刷新后恢复，前进后退只作用于目标应用', async ({ page }) => {
  await enter(page);
  const topURL = page.url();
  await page.getByRole('button', { name: '打开 文件', exact: true }).click();
  await page.getByRole('button', { name: '始终允许', exact: true }).click();
  const files = page.frameLocator('iframe[title="文件"]');
  await files.getByRole('button', { name: '新建文件夹', exact: true }).click();
  await files.getByLabel('新建名称').fill('恢复目录');
  await files.getByRole('button', { name: '创建', exact: true }).click();
  await files.getByRole('button', { name: '打开 恢复目录', exact: true }).press('Enter');
  await files
    .getByLabel('导入本机文件')
    .setInputFiles({ name: '目标.txt', mimeType: 'text/plain', buffer: Buffer.from('保存内容') });
  await files.getByLabel('搜索当前目录').fill('目标');
  await files.getByRole('button', { name: '打开 目标.txt', exact: true }).click();
  const fileRoute = await files.locator('.app-frame').getAttribute('data-route');
  expect(fileRoute).toMatch(/^\/folders\/[^?]+\?q=.+#selected=.+$/);
  await page.getByRole('button', { name: '打开 设置', exact: true }).click();
  await page.getByRole('button', { name: '始终允许', exact: true }).click();
  const settings = page.frameLocator('iframe[title="设置"]');
  await settings.getByRole('button', { name: '▱ 数据与备份', exact: true }).click();
  await expect.poll(() => savedRoutes(page)).toEqual(expect.arrayContaining([fileRoute, '/data']));
  await page.reload();
  await expect(settings.getByRole('button', { name: '▱ 数据与备份', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  await page.getByRole('button', { name: '打开 文件', exact: true }).click();
  await expect(files.getByRole('navigation', { name: '文件路径' }).getByRole('button')).toHaveText([
    '我的文件',
    '恢复目录'
  ]);
  await expect(files.getByLabel('搜索当前目录')).toHaveValue('目标');
  await expect(files.getByRole('row').filter({ hasText: '目标.txt' })).toHaveAttribute('data-selected', 'true');
  await files.getByRole('button', { name: '返回我的文件', exact: true }).click();
  await page.getByRole('button', { name: '后退 文件', exact: true }).click();
  await expect(files.getByLabel('搜索当前目录')).toHaveValue('目标');
  await page.getByRole('button', { name: '前进 文件', exact: true }).click();
  await expect(files.getByLabel('搜索当前目录')).toHaveValue('');
  await expect(settings.getByRole('button', { name: '▱ 数据与备份', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  expect(page.url()).toBe(topURL);
});

test('DESKTOP-US-305/AC2/5：同应用两实例保存不同 path/query/hash，导航失败保留草稿且桌面地址不变', async ({ page }) => {
  await enter(page);
  const topURL = page.url();
  await page.getByRole('button', { name: '打开 文件', exact: true }).click();
  await page.getByRole('button', { name: '始终允许', exact: true }).click();
  const files = page.frameLocator('iframe[title="文件"]');
  await files.getByLabel('导入本机文件').setInputFiles([
    { name: '一号.txt', mimeType: 'text/plain', buffer: Buffer.from('甲一\n甲二\n甲三') },
    { name: '二号.txt', mimeType: 'text/plain', buffer: Buffer.from('乙一\n乙二\n乙三') }
  ]);
  await files.getByRole('button', { name: '打开 一号.txt', exact: true }).press('Enter');
  await page.getByRole('button', { name: '始终允许', exact: true }).click();
  const first = page.locator('[data-app-id="editor"]').filter({ hasText: '一号.txt' });
  const firstFrame = first.locator('iframe').contentFrame();
  await expect(firstFrame.getByLabel('文档内容')).toHaveValue('甲一\n甲二\n甲三');
  const firstPath = (await firstFrame.locator('.app-frame').getAttribute('data-route'))!;
  await openLocation(page, first, firstPath + '?line=2#L2');
  await expect(firstFrame.locator('.app-frame')).toHaveAttribute('data-route', firstPath + '?line=2#L2');
  await page.getByRole('button', { name: '打开 文件', exact: true }).click();
  await files.getByRole('button', { name: '打开 二号.txt', exact: true }).press('Enter');
  await page.getByRole('button', { name: '始终允许', exact: true }).click();
  const second = page.locator('[data-app-id="editor"]').filter({ hasText: '二号.txt' });
  const secondFrame = second.locator('iframe').contentFrame();
  await expect(secondFrame.getByLabel('文档内容')).toHaveValue('乙一\n乙二\n乙三');
  const secondPath = (await secondFrame.locator('.app-frame').getAttribute('data-route'))!;
  await openLocation(page, second, secondPath + '?line=3#L3');
  await page.getByLabel('文本编辑器 的运行实例', { exact: true }).click();
  await page.getByRole('button', { name: '一号.txt', exact: true }).click();
  await page.getByLabel('文本编辑器 的运行实例', { exact: true }).click();
  await first.getByRole('button', { name: '后退 文本编辑器', exact: true }).click();
  await expect(firstFrame.locator('.app-frame')).toHaveAttribute('data-route', firstPath);
  await expect(secondFrame.locator('.app-frame')).toHaveAttribute('data-route', secondPath + '?line=3#L3');
  await first.getByRole('button', { name: '前进 文本编辑器', exact: true }).click();
  await expect
    .poll(() => savedRoutes(page))
    .toEqual(expect.arrayContaining([firstPath + '?line=2#L2', secondPath + '?line=3#L3']));
  await page.reload();
  await expect(firstFrame.getByLabel('文档内容')).toHaveValue('甲一\n甲二\n甲三');
  await expect(secondFrame.getByLabel('文档内容')).toHaveValue('乙一\n乙二\n乙三');
  await expect
    .poll(() => firstFrame.getByLabel('文档内容').evaluate(input => (input as HTMLTextAreaElement).selectionStart))
    .toBe(3);
  await expect
    .poll(() => secondFrame.getByLabel('文档内容').evaluate(input => (input as HTMLTextAreaElement).selectionStart))
    .toBe(6);
  await page.getByLabel('文本编辑器 的运行实例', { exact: true }).click();
  await page.getByRole('button', { name: '一号.txt', exact: true }).click();
  await page.getByLabel('文本编辑器 的运行实例', { exact: true }).click();
  await firstFrame.getByLabel('文档内容').fill('不能丢失的草稿');
  await openLocation(page, first, secondPath);
  await expect(page.getByRole('alert')).toContainText('未保存');
  await expect(firstFrame.getByLabel('文档内容')).toHaveValue('不能丢失的草稿');
  await expect(firstFrame.locator('.app-frame')).toHaveAttribute('data-route', firstPath + '?line=2#L2');
  await page.getByRole('button', { name: '关闭消息', exact: true }).click();
  await openLocation(page, first, '/?access_token=never-store-this-value');
  await expect(page.getByRole('alert')).toContainText('凭据');
  expect(JSON.stringify(await savedRoutes(page))).not.toContain('never-store-this-value');
  expect(page.url()).toBe(topURL);
});

test('DESKTOP-US-305/AC5：同一实例跨文档导航和后退按各文档行位置恢复', async ({ page }) => {
  await enter(page);
  await page.getByRole('button', { name: '打开 文件', exact: true }).click();
  await page.getByRole('button', { name: '始终允许', exact: true }).click();
  const files = page.frameLocator('iframe[title="文件"]');
  const firstText = '短\n第一份文档';
  const secondText = '另一份文档的较长首行\n第二份文档';
  await files.getByLabel('导入本机文件').setInputFiles([
    { name: '起点.txt', mimeType: 'text/plain', buffer: Buffer.from(firstText) },
    { name: '目标.txt', mimeType: 'text/plain', buffer: Buffer.from(secondText) }
  ]);
  await files.getByRole('button', { name: '打开 目标.txt', exact: true }).click();
  await expect(files.locator('.app-frame')).toHaveAttribute('data-route', /#selected=/);
  const fileRoute = (await files.locator('.app-frame').getAttribute('data-route'))!;
  const targetId = new URLSearchParams(new URL(fileRoute, 'https://files.invalid/').hash.slice(1)).get('selected');
  expect(targetId).toBeTruthy();
  await files.getByRole('button', { name: '打开 起点.txt', exact: true }).press('Enter');
  await page.getByRole('button', { name: '始终允许', exact: true }).click();
  const editorWindow = page.locator('[data-app-id="editor"]');
  const editor = editorWindow.locator('iframe').contentFrame();
  await expect(editor.getByLabel('文档内容')).toHaveValue(firstText);
  const initialPath = (await editor.locator('.app-frame').getAttribute('data-route'))!;
  await openLocation(page, editorWindow, initialPath + '?line=2#L2');
  await openLocation(page, editorWindow, `/documents/${targetId}?line=2#L2`);
  await page.getByRole('button', { name: '始终允许', exact: true }).click();
  await expect(editor.getByLabel('文档内容')).toHaveValue(secondText);
  await expect(page.locator('[data-app-id="editor"]')).toHaveCount(1);
  await expect
    .poll(() => editor.getByLabel('文档内容').evaluate(input => (input as HTMLTextAreaElement).selectionStart))
    .toBe(secondText.indexOf('\n') + 1);
  await editorWindow.getByRole('button', { name: '后退 文本编辑器', exact: true }).click();
  await expect(editor.getByLabel('文档内容')).toHaveValue(firstText);
  await expect(editor.locator('.app-frame')).toHaveAttribute('data-route', initialPath + '?line=2#L2');
  await expect
    .poll(() => editor.getByLabel('文档内容').evaluate(input => (input as HTMLTextAreaElement).selectionStart))
    .toBe(firstText.indexOf('\n') + 1);
});
