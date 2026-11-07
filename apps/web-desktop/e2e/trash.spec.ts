import { expect, test, type FrameLocator, type Page } from '@playwright/test';
import { readState as snapshot } from './state.js';

async function enter(page: Page, mode: 'macos' | 'windows') {
  await page.goto('/');
  await page.getByRole('button', { name: mode === 'macos' ? /^macOS 风格/ : /^Windows 风格/ }).click();
  await page.getByRole('button', { name: '进入桌面', exact: true }).click();
  await page.getByRole('button', { name: '打开 文件', exact: true }).click();
  await page.getByRole('button', { name: '始终允许', exact: true }).click();
  return page.frameLocator('iframe[title="文件"]');
}

async function importFile(files: FrameLocator, name: string, content: string) {
  await files.getByLabel('导入本机文件').setInputFiles({ name, mimeType: 'text/plain', buffer: Buffer.from(content) });
  await expect(files.getByRole('button', { name: `打开 ${name}`, exact: true })).toBeVisible();
}

async function folder(files: FrameLocator, name: string) {
  await files.getByRole('button', { name: '新建文件夹', exact: true }).click();
  await files.getByLabel('新建名称').fill(name);
  await files.getByRole('button', { name: '创建', exact: true }).click();
  await files.getByRole('button', { name: `打开 ${name}`, exact: true }).dblclick();
}

async function trash(files: FrameLocator, name: string) {
  await files.getByRole('button', { name: `打开 ${name}`, exact: true }).click();
  await files.getByRole('button', { name: '移到回收站', exact: true }).click();
  await expect(files.getByRole('button', { name: `打开 ${name}`, exact: true })).toHaveCount(0);
}

for (const mode of ['macos', 'windows'] as const) {
  test(`${mode} DESKTOP-US-604/AC1/2 trash-restore：原目录在回收站时显式选择目标，重名可取消或改名，不覆盖文件`, async ({
    page
  }) => {
    const files = await enter(page, mode);
    await folder(files, '原目录');
    await importFile(files, '恢复.txt', '待恢复的原始内容');
    await trash(files, '恢复.txt');
    await files.getByRole('button', { name: '返回我的文件', exact: true }).click();
    await trash(files, '原目录');
    await importFile(files, '恢复.txt', '根目录中的同名内容');
    await files.getByRole('button', { name: '♲ 回收站', exact: true }).click();
    await files.getByRole('button', { name: '打开 恢复.txt', exact: true }).click();
    const before = (await snapshot(page)).files;
    await files.getByRole('button', { name: '恢复', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('原目录已不在普通文件中');
    await page.getByRole('button', { name: '取消', exact: true }).click();
    await expect(files.getByRole('alert')).toContainText('CANCELLED');
    expect((await snapshot(page)).files).toEqual(before);
    await files.getByRole('button', { name: '恢复', exact: true }).click();
    await page.getByLabel('目录', { exact: true }).selectOption('root');
    await page.getByRole('button', { name: '恢复到此目录', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('目标位置已有同名文件');
    await page.getByRole('button', { name: '取消', exact: true }).click();
    await expect(files.getByRole('alert')).toContainText('CANCELLED');
    expect((await snapshot(page)).files).toEqual(before);
    await files.getByRole('button', { name: '恢复', exact: true }).click();
    await page.getByLabel('目录', { exact: true }).selectOption('root');
    await page.getByRole('button', { name: '恢复到此目录', exact: true }).click();
    await page.getByLabel('恢复名称', { exact: true }).fill('恢复副本.txt');
    await page.getByRole('button', { name: '以此名称恢复', exact: true }).click();
    await expect(files.getByRole('button', { name: '打开 恢复.txt', exact: true })).toHaveCount(0);
    const after = (await snapshot(page)).files;
    const original = before.find(file => file.deleted && file.kind === 'file')!;
    expect(after.find(file => file.id === original.id)).toMatchObject({
      name: '恢复副本.txt',
      parentId: null,
      deleted: false,
      bytes: original.bytes
    });
    expect(after.find(file => !file.deleted && file.name === '恢复.txt')).toEqual(
      before.find(file => !file.deleted && file.name === '恢复.txt')
    );
    expect(after.find(file => file.name === '原目录')?.deleted).toBe(true);
    await files.getByRole('button', { name: '返回我的文件', exact: true }).click();
    await expect(files.getByRole('button', { name: '打开 恢复副本.txt', exact: true })).toBeVisible();
    await page.reload();
    expect((await snapshot(page)).files).toEqual(after);
    await expect(files.getByRole('button', { name: '打开 恢复副本.txt', exact: true })).toBeVisible();
  });
}

test('DESKTOP-US-604/AC3 trash-editor：其他窗口回收正在编辑的文件，保存失败保留草稿，只有显式另存才创建新文件', async ({
  page
}) => {
  const files = await enter(page, 'windows');
  await importFile(files, '编辑中.txt', '磁盘中已保存的正文');
  await files.getByRole('button', { name: '打开 编辑中.txt', exact: true }).dblclick();
  await page.getByRole('button', { name: '始终允许', exact: true }).click();
  const editor = page.frameLocator('iframe[title="文本编辑器"]');
  await expect(editor.getByLabel('文档内容')).toHaveValue('磁盘中已保存的正文');
  await editor.getByLabel('文档内容').fill('回收后仍须保留的草稿');
  await page.getByRole('button', { name: '打开 文件', exact: true }).click();
  await trash(files, '编辑中.txt');
  await page.getByRole('button', { name: '打开 文本编辑器', exact: true }).click();
  await expect(editor.getByRole('alert')).toContainText('文件已移入回收站');
  const before = (await snapshot(page)).files;
  await editor.getByRole('button', { name: '保存', exact: true }).click();
  await expect(editor.getByRole('alert')).toContainText('TRASHED');
  await expect(editor.getByLabel('文档内容')).toHaveValue('回收后仍须保留的草稿');
  expect((await snapshot(page)).files).toEqual(before);
  await editor.getByRole('button', { name: '另存为', exact: true }).click();
  await page.getByLabel('保存文件名', { exact: true }).fill('保留草稿.txt');
  await page.getByRole('button', { name: '保存到此位置', exact: true }).click();
  await page.getByRole('button', { name: '始终允许', exact: true }).click();
  await expect(editor.getByRole('status')).toContainText('已保存');
  const after = (await snapshot(page)).files;
  expect(after).toHaveLength(2);
  expect(after.find(file => file.id === before[0].id)).toEqual(before[0]);
  const copy = after.find(file => !file.deleted)!;
  expect(copy.name).toBe('保留草稿.txt');
  expect(Buffer.from(copy.bytes, 'base64').toString('utf8')).toBe('回收后仍须保留的草稿');
});

test('DESKTOP-US-604/AC4/6 trash-empty：清空确认含子项数量，取消及 QUOTA 失败保留全部原项，重试成功后刷新无残留', async ({
  page
}) => {
  const files = await enter(page, 'windows');
  await folder(files, '带子文件');
  await importFile(files, '子文件.txt', '子文件字节');
  await files.getByRole('button', { name: '返回我的文件', exact: true }).click();
  await trash(files, '带子文件');
  await importFile(files, '独立.txt', '独立文件字节');
  await trash(files, '独立.txt');
  await files.getByRole('button', { name: '♲ 回收站', exact: true }).click();
  const before = (await snapshot(page)).files;
  expect(before).toHaveLength(3);
  expect(before.every(file => file.deleted)).toBe(true);
  await files.getByRole('button', { name: '清空回收站', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('清空回收站 3 项');
  await expect(page.getByRole('dialog')).toContainText('无法恢复');
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await expect(files.getByRole('alert')).toContainText('CANCELLED');
  expect((await snapshot(page)).files).toEqual(before);
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value: unknown, key?: IDBValidKey) {
      const data = (value as { data?: Partial<DesktopState> } | null)?.data;
      if (this.name === 'state' && data?.files?.length === 0)
        throw new DOMException('模拟清空失败', 'QuotaExceededError');
      return put.call(this, value, key);
    };
  });
  await files.getByRole('button', { name: '清空回收站', exact: true }).click();
  await page.getByRole('button', { name: '永久删除全部回收项', exact: true }).click();
  await expect(files.getByRole('alert')).toContainText('QUOTA');
  await expect(files.locator('tbody tr')).toHaveCount(3);
  await expect(files.getByRole('status')).not.toContainText('回收站已清空');
  expect((await snapshot(page)).files).toEqual(before);
  await page.reload();
  await expect(files.locator('tbody tr')).toHaveCount(3);
  await files.getByRole('button', { name: '清空回收站', exact: true }).click();
  await page.getByRole('button', { name: '永久删除全部回收项', exact: true }).click();
  await expect(files.getByRole('status')).toContainText('回收站已清空');
  expect((await snapshot(page)).files).toEqual([]);
  await page.reload();
  await expect(files.locator('tbody tr')).toHaveCount(0);
  expect((await snapshot(page)).files).toEqual([]);
});

test('DESKTOP-US-604/AC5 trash-revoked：撤销文件授权后拒绝恢复和永久删除，回收站无法绕过原访问范围', async ({
  page
}) => {
  const files = await enter(page, 'windows');
  await importFile(files, '受保护.txt', '不应被未授权删除的内容');
  await trash(files, '受保护.txt');
  await files.getByRole('button', { name: '♲ 回收站', exact: true }).click();
  await files.getByRole('button', { name: '打开 受保护.txt', exact: true }).click();
  const before = (await snapshot(page)).files;
  await page.getByRole('button', { name: '打开 设置', exact: true }).click();
  await page.getByRole('button', { name: '始终允许', exact: true }).click();
  const settings = page.frameLocator('iframe[title="设置"]');
  await settings.getByRole('button', { name: '◇ 权限', exact: true }).click();
  const grant = settings.locator('.grant-row').filter({ hasText: '文件 · 文件访问' });
  await grant.getByRole('button', { name: '撤销', exact: true }).click();
  await expect(grant).toHaveCount(0);
  expect((await snapshot(page)).grants.some(item => item.appId === 'files' && item.capability === 'files')).toBe(false);
  await page.getByRole('button', { name: '打开 文件', exact: true }).click();
  await files.getByRole('button', { name: '恢复', exact: true }).click();
  await page.getByRole('button', { name: '拒绝', exact: true }).click();
  await expect(files.getByRole('alert')).toContainText('DENIED');
  expect((await snapshot(page)).files).toEqual(before);
  await files.getByRole('button', { name: '永久删除', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('永久删除 1 项');
  await page.getByRole('button', { name: '确认', exact: true }).click();
  await page.getByRole('button', { name: '拒绝', exact: true }).click();
  await expect(files.getByRole('alert')).toContainText('DENIED');
  expect((await snapshot(page)).files).toEqual(before);
  await expect(files.getByRole('button', { name: '打开 受保护.txt', exact: true })).toBeVisible();
  await files.getByRole('button', { name: '恢复', exact: true }).click();
  await page.getByRole('button', { name: '始终允许', exact: true }).click();
  await expect(files.getByRole('button', { name: '打开 受保护.txt', exact: true })).toHaveCount(0);
  const restored = (await snapshot(page)).files[0];
  expect(restored.deleted).toBe(false);
  expect(restored.bytes).toBe(before[0].bytes);
});
