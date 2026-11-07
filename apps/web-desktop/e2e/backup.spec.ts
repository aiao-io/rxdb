import { expect, test, type FrameLocator, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { DesktopBackup } from '../src/core/backup.js';
import type { DesktopState } from '../src/core/types.js';
import { readState as snapshot } from './state.js';

async function fixture(page: Page, mode: 'macos' | 'windows') {
  await page.goto('/');
  await page.getByRole('button', { name: mode === 'macos' ? /^macOS 风格/ : /^Windows 风格/ }).click();
  await page.getByRole('button', { name: '进入桌面', exact: true }).click();
  await page.getByRole('button', { name: '打开 文本编辑器', exact: true }).click();
  const editor = page.frameLocator('iframe[title="文本编辑器"]');
  await editor.getByLabel('文件名', { exact: true }).fill('备份样本.txt');
  await editor.getByLabel('文档内容').fill('备份中的原始正文');
  await editor.getByRole('button', { name: '保存', exact: true }).click();
  await page.getByRole('button', { name: '保存到此位置', exact: true }).click();
  await page.getByRole('button', { name: '始终允许', exact: true }).click();
  await expect(editor.getByRole('status')).toContainText('已保存');
  await page.getByRole('button', { name: '打开 设置', exact: true }).click();
  await page.getByRole('button', { name: '始终允许', exact: true }).click();
  const settings = page.frameLocator('iframe[title="设置"]');
  await settings.getByRole('button', { name: /备份/ }).click();
  await expect
    .poll(async () => (await snapshot(page)).session.find(win => win.appId === 'settings')?.route)
    .toBe('/data');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    settings.getByRole('button', { name: '导出未加密备份', exact: true }).click()
  ]);
  const path = await download.path();
  expect(path).not.toBeNull();
  const backup: DesktopBackup = JSON.parse(await readFile(path!, 'utf8'));
  expect(backup.unencrypted).toBe(true);
  expect(backup.data.grants).toEqual([]);
  expect(backup.data.session.map(win => win.appId)).toEqual(['editor', 'settings']);
  await page.getByRole('button', { name: '打开 文本编辑器', exact: true }).click();
  await editor.getByLabel('文档内容').fill('备份之后另存的正文');
  await editor.getByRole('button', { name: '保存', exact: true }).click();
  await expect(editor.getByRole('status')).toContainText('已保存');
  await page.getByRole('button', { name: '打开 设置', exact: true }).click();
  await selectBackup(settings, backup);
  return { editor, settings, backup };
}

async function selectBackup(settings: FrameLocator, backup: DesktopBackup) {
  await settings.getByLabel('选择桌面备份').setInputFiles({
    name: '桌面备份.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(backup))
  });
  await expect(settings.getByText('已验证：1 个文件，1 个工作区。')).toBeVisible();
}

for (const mode of ['macos', 'windows'] as const) {
  test(`${mode} DESKTOP-US-503/AC1/2/3 backup-activate：真实下载备份恢复后重新启动完整会话，布局保存与再次刷新不丢窗口`, async ({
    page
  }) => {
    const { settings, backup } = await fixture(page, mode);
    await settings.getByRole('button', { name: '检查并恢复', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('权限不会恢复');
    await expect(settings.getByRole('button', { name: '检查并恢复', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: '确认恢复', exact: true }).click();
    await expect.poll(async () => (await snapshot(page)).files).toEqual(backup.data.files);
    await expect(page.locator('[data-app-id="editor"]')).toHaveCount(1);
    await page.getByRole('button', { name: '始终允许', exact: true }).click();
    await page.getByRole('button', { name: '始终允许', exact: true }).click();
    await expect(page.frameLocator('iframe[title="文本编辑器"]').getByLabel('文档内容')).toHaveValue(
      '备份中的原始正文'
    );
    await expect(page.getByRole('alert')).toContainText('备份恢复完成');
    const restored = await snapshot(page);
    expect(restored.files).toEqual(backup.data.files);
    expect(restored.session.map(win => win.id).sort()).toEqual(backup.data.session.map(win => win.id).sort());
    await page.getByRole('button', { name: '打开 文本编辑器', exact: true }).click();
    await page.getByRole('button', { name: '最小化窗口 文本编辑器', exact: true }).click();
    await expect
      .poll(async () => (await snapshot(page)).session.find(win => win.appId === 'editor')?.state)
      .toBe('minimized');
    await page.reload();
    await expect(page.locator('[data-app-id="editor"]')).toHaveCount(1);
    expect((await snapshot(page)).files).toEqual(backup.data.files);
    expect((await snapshot(page)).session.map(win => win.id).sort()).toEqual(
      backup.data.session.map(win => win.id).sort()
    );
  });
}

test('DESKTOP-US-503/AC3/6 backup-cancel：范围确认及未保存文档确认可取消，文件、草稿和实例保持不变', async ({
  page
}) => {
  const { settings, editor } = await fixture(page, 'windows');
  const before = await snapshot(page);
  await settings.getByRole('button', { name: '检查并恢复', exact: true }).click();
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await expect(settings.getByRole('alert')).toContainText('CANCELLED');
  expect(await snapshot(page)).toEqual(before);
  await page.getByRole('button', { name: '打开 文本编辑器', exact: true }).click();
  await editor.getByLabel('文档内容').fill('不能丢弃的未保存草稿');
  await expect(page.getByLabel('未保存', { exact: true })).toBeVisible();
  const instanceId = await page.locator('[data-app-id="editor"]').getAttribute('data-instance-id');
  await page.getByRole('button', { name: '打开 设置', exact: true }).click();
  const dirtyState = await snapshot(page);
  await settings.getByRole('button', { name: '检查并恢复', exact: true }).click();
  await page.getByRole('button', { name: '确认恢复', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('尚未保存');
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await expect(settings.getByRole('alert')).toContainText('CANCELLED');
  expect(await snapshot(page)).toEqual(dirtyState);
  await expect(page.locator('[data-app-id="editor"]')).toHaveAttribute('data-instance-id', instanceId!);
  await expect(editor.getByLabel('文档内容')).toHaveValue('不能丢弃的未保存草稿');
});

test('DESKTOP-US-503/AC5 backup-quota：替换事务额度不足时保留旧会话与文件，重新打开已关闭窗口并明确失败', async ({
  page
}) => {
  const { settings, editor, backup } = await fixture(page, 'windows');
  const before = await snapshot(page);
  await page.evaluate(originalBytes => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value: unknown, key?: IDBValidKey) {
      if (this.name === 'state' && typeof key === 'string' && key.startsWith('file:') && value === originalBytes) {
        throw new DOMException('模拟恢复写入额度不足', 'QuotaExceededError');
      }
      return put.call(this, value, key);
    };
  }, backup.data.files[0].bytes);
  await settings.getByRole('button', { name: '检查并恢复', exact: true }).click();
  await page.getByRole('button', { name: '确认恢复', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('备份恢复未完成');
  await expect(page.getByRole('alert')).toContainText('QUOTA');
  await expect(page.locator('[data-app-id="editor"]')).toHaveCount(1);
  await expect(editor.getByLabel('文档内容')).toHaveValue('备份之后另存的正文');
  expect(await snapshot(page)).toEqual(before);
  await page.reload();
  await expect(editor.getByLabel('文档内容')).toHaveValue('备份之后另存的正文');
  expect((await snapshot(page)).files).toEqual(before.files);
  expect((await snapshot(page)).session.map(win => win.id).sort()).toEqual(before.session.map(win => win.id).sort());
});

for (const corruption of ['checksum', 'version'] as const) {
  test(`DESKTOP-US-503/AC4 backup-invalid-${corruption}：先选有效备份再选损坏备份，提交前拒绝并清除旧恢复入口`, async ({
    page
  }) => {
    const { settings, editor, backup } = await fixture(page, 'windows');
    const before = await snapshot(page);
    const instanceId = await page.locator('[data-app-id="editor"]').getAttribute('data-instance-id');
    const invalid =
      corruption === 'checksum' ? { ...backup, checksum: '0'.repeat(64) } : { ...backup, schemaVersion: 99 };
    await settings.getByLabel('选择桌面备份').setInputFiles({
      name: '损坏备份.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(invalid))
    });
    await expect(settings.getByRole('alert')).toContainText(corruption === 'checksum' ? 'INTEGRITY' : 'INVALID');
    await expect(settings.getByRole('button', { name: '检查并恢复', exact: true })).toHaveCount(0);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await snapshot(page)).toEqual(before);
    await expect(page.locator('[data-app-id="editor"]')).toHaveAttribute('data-instance-id', instanceId!);
    await expect(editor.getByLabel('文档内容')).toHaveValue('备份之后另存的正文');
    await selectBackup(settings, backup);
    await expect(settings.getByRole('button', { name: '检查并恢复', exact: true })).toBeEnabled();
  });
}

for (const mode of ['macos', 'windows'] as const) {
  test(`${mode} DESKTOP-US-503/AC6 reset-all：两次确认均可取消，最终清空后重新入门不残留旧实例或旧会话`, async ({
    page
  }) => {
    const { settings } = await fixture(page, mode);
    const before = await snapshot(page);
    await settings.getByRole('button', { name: '重置桌面数据', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('删除全部托管文件');
    await page.getByRole('button', { name: '取消', exact: true }).click();
    await expect(settings.getByRole('alert')).toContainText('CANCELLED');
    expect(await snapshot(page)).toEqual(before);
    await settings.getByRole('button', { name: '重置桌面数据', exact: true }).click();
    await page.getByRole('button', { name: '继续重置', exact: true }).click();
    await page.getByRole('button', { name: '取消', exact: true }).click();
    await expect(settings.getByRole('alert')).toContainText('CANCELLED');
    expect(await snapshot(page)).toEqual(before);
    await settings.getByRole('button', { name: '重置桌面数据', exact: true }).click();
    await page.getByRole('button', { name: '继续重置', exact: true }).click();
    await page.getByRole('button', { name: '确认删除全部数据', exact: true }).click();
    await expect(page.getByRole('button', { name: '进入桌面', exact: true })).toBeVisible();
    const reset = await snapshot(page);
    expect(reset.files).toEqual([]);
    expect(reset.appData).toEqual([]);
    expect(reset.grants).toEqual([]);
    expect(reset.session).toEqual([]);
    await page.getByRole('button', { name: mode === 'macos' ? /^macOS 风格/ : /^Windows 风格/ }).click();
    await page.getByRole('button', { name: '进入桌面', exact: true }).click();
    await expect(page.getByRole('button', { name: '应用启动器', exact: true })).toBeVisible();
    await expect(page.locator('[data-instance-id]')).toHaveCount(0);
    expect((await snapshot(page)).session).toEqual([]);
    await page.getByRole('button', { name: '打开 设置', exact: true }).click();
    await page.getByRole('button', { name: '始终允许', exact: true }).click();
    await expect(settings.getByRole('heading', { name: '熟悉，且属于你。', exact: true })).toBeVisible();
    await page.reload();
    expect((await snapshot(page)).files).toEqual([]);
    await expect(page.locator('[data-app-id="settings"]')).toHaveCount(1);
  });
}

test('DESKTOP-US-503/AC5/6 reset-all-quota：清除事务被拒绝时原文件与会话保留，重新进入后明确失败且仍可使用', async ({
  page
}) => {
  const { settings, editor } = await fixture(page, 'windows');
  const before = await snapshot(page);
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value: unknown, key?: IDBValidKey) {
      const data = (value as { data?: Partial<DesktopState> } | null)?.data;
      if (this.name === 'state' && data?.files?.length === 0 && data.session?.length === 0) {
        throw new DOMException('模拟清除写入被拒绝', 'QuotaExceededError');
      }
      return put.call(this, value, key);
    };
  });
  await settings.getByRole('button', { name: '重置桌面数据', exact: true }).click();
  await page.getByRole('button', { name: '继续重置', exact: true }).click();
  await page.getByRole('button', { name: '确认删除全部数据', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('桌面数据重置未完成');
  await expect(page.getByRole('alert')).toContainText('QUOTA');
  await expect(editor.getByLabel('文档内容')).toHaveValue('备份之后另存的正文');
  expect(await snapshot(page)).toEqual(before);
  await expect(page.getByRole('button', { name: '进入桌面', exact: true })).toHaveCount(0);
});

test('DESKTOP-US-503/AC5 backup-abort：替换记录写入后事务中断会原子回滚，旧文件和完整会话可重新打开', async ({
  page
}) => {
  const { settings, editor, backup } = await fixture(page, 'windows');
  const before = await snapshot(page);
  await page.evaluate(originalBytes => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value: unknown, key?: IDBValidKey) {
      const request = put.call(this, value, key);
      if (this.name === 'state' && typeof key === 'string' && key.startsWith('file:') && value === originalBytes) {
        request.addEventListener('success', () => this.transaction.abort(), { once: true });
      }
      return request;
    };
  }, backup.data.files[0].bytes);
  await settings.getByRole('button', { name: '检查并恢复', exact: true }).click();
  await page.getByRole('button', { name: '确认恢复', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('备份恢复未完成');
  await expect(page.getByRole('alert')).toContainText('STORAGE');
  await expect(editor.getByLabel('文档内容')).toHaveValue('备份之后另存的正文');
  expect(await snapshot(page)).toEqual(before);
  await page.reload();
  expect((await snapshot(page)).files).toEqual(before.files);
  expect((await snapshot(page)).session.map(win => win.id).sort()).toEqual(before.session.map(win => win.id).sort());
});
