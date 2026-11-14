import { expect, test } from '@playwright/test';
import type { DesktopState } from '../src/core/types.js';
import { createDirectory, downloadFile, openFiles, readState } from './import-support.js';

for (const mode of ['macos', 'windows'] as const) {
  test(`${mode} DESKTOP-US-603/AC1/5 import-binary：拖入指定虚拟目录，原始二进制字节、类型、名称与下载一致`, async ({
    page
  }) => {
    const files = await openFiles(page, mode);
    await createDirectory(files, '二进制目录');
    const bytes = [0, 255, 128, 13, 10, 0, 239, 187, 191, 65];
    const transfer = await files.locator('.file-content').evaluateHandle((_, values) => {
      const data = new DataTransfer();
      data.items.add(new File([new Uint8Array(values)], '原始.bin', { type: 'application/x-orbit-binary' }));
      return data;
    }, bytes);
    try {
      await files.locator('.file-content').dispatchEvent('drop', { dataTransfer: transfer });
    } finally {
      await transfer.dispose();
    }
    await expect(files.getByRole('button', { name: '打开 原始.bin', exact: true })).toBeVisible();
    await expect(files.getByRole('status')).toContainText('与本机文件相互独立');
    const state = await readState(page);
    const directory = state.files.find(file => file.name === '二进制目录')!;
    const file = state.files.find(file => file.name === '原始.bin')!;
    expect(file).toMatchObject({ parentId: directory.id, mime: 'application/x-orbit-binary', deleted: false });
    expect(Buffer.from(file.bytes, 'base64')).toEqual(Buffer.from(bytes));
    expect(await downloadFile(page, files, file.name)).toEqual(Buffer.from(bytes));
    await page.reload();
    await expect(files.getByRole('button', { name: '打开 原始.bin', exact: true })).toBeVisible();
    expect(await downloadFile(page, files, file.name)).toEqual(Buffer.from(bytes));
  });

  test(`${mode} DESKTOP-US-603/AC6 import-active-content：HTML、SVG、脚本按数据导入，打开拒绝执行，主动下载保持原字节`, async ({
    page
  }) => {
    const files = await openFiles(page, mode);
    const execute = 'top.localStorage.setItem("desktop-import-executed","yes")';
    const inputs = [
      { name: '页面.html', mimeType: 'text/html', buffer: Buffer.from(`<script>${execute}</script>`) },
      {
        name: '图像.svg',
        mimeType: 'image/svg+xml',
        buffer: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" onload='${execute}'/>`)
      },
      { name: '脚本.js', mimeType: 'application/javascript', buffer: Buffer.from(execute) }
    ];
    await files.getByLabel('导入本机文件').setInputFiles(inputs);
    await expect(files.locator('tbody tr')).toHaveCount(3);
    const stored = await readState(page);
    for (const input of inputs) {
      const file = stored.files.find(file => file.name === input.name)!;
      expect(file.mime).toBe(input.mimeType);
      expect(Buffer.from(file.bytes, 'base64')).toEqual(input.buffer);
      await files.getByRole('button', { name: `打开 ${input.name}`, exact: true }).dblclick();
      await expect(files.getByRole('alert')).toContainText('UNSUPPORTED');
      expect(await downloadFile(page, files, input.name)).toEqual(input.buffer);
    }
    expect(await page.evaluate(() => localStorage.getItem('desktop-import-executed'))).toBeNull();
    await expect(page.locator('iframe')).toHaveCount(1);
    await page.reload();
    await expect(files.locator('tbody tr')).toHaveCount(3);
    expect(await page.evaluate(() => localStorage.getItem('desktop-import-executed'))).toBeNull();
  });
}

test('DESKTOP-US-603/AC2/4 import-cancel：批次已有新文件时取消重名决策仍整批不提交，跳过保留原文件字节与版本', async ({
  page
}) => {
  const files = await openFiles(page);
  const original = { name: '冲突.txt', mimeType: 'text/plain', buffer: Buffer.from('原始内容') };
  await files.getByLabel('导入本机文件').setInputFiles(original);
  await expect(files.getByRole('button', { name: '打开 冲突.txt', exact: true })).toBeVisible();
  const before = (await readState(page)).files;
  await files.getByLabel('导入本机文件').setInputFiles([
    { name: '不应部分提交.bin', mimeType: 'application/octet-stream', buffer: Buffer.from([0, 255]) },
    { ...original, buffer: Buffer.from('尚未确认的替换') }
  ]);
  await page.getByRole('button', { name: '取消导入', exact: true }).click();
  await expect(files.getByRole('alert')).toContainText('CANCELLED');
  expect((await readState(page)).files).toEqual(before);
  await expect(files.getByRole('button', { name: '打开 不应部分提交.bin', exact: true })).toHaveCount(0);
  await files.getByLabel('导入本机文件').setInputFiles({ ...original, buffer: Buffer.from('应被跳过') });
  await page.getByRole('button', { name: '跳过', exact: true }).click();
  await expect(files.getByRole('alert')).toHaveCount(0);
  expect((await readState(page)).files).toEqual(before);
});

test('DESKTOP-US-603/AC4 import-read-failure：一个本机文件读取失败时整批无新增文件，旧字节保留并显示失败原因', async ({
  page
}) => {
  const files = await openFiles(page);
  await files
    .getByLabel('导入本机文件')
    .setInputFiles({ name: '保留.txt', mimeType: 'text/plain', buffer: Buffer.from('旧文件') });
  await expect(files.getByRole('button', { name: '打开 保留.txt', exact: true })).toBeVisible();
  const before = (await readState(page)).files;
  await files.locator('main').evaluate(() => {
    const read = File.prototype.arrayBuffer;
    File.prototype.arrayBuffer = function () {
      return this.name === '读失败.bin' ?
          Promise.reject(new DOMException('模拟本机文件读取失败', 'NotReadableError'))
        : read.call(this);
    };
  });
  await files.getByLabel('导入本机文件').setInputFiles([
    { name: '可读.bin', mimeType: 'application/octet-stream', buffer: Buffer.from([0, 255]) },
    { name: '读失败.bin', mimeType: 'application/octet-stream', buffer: Buffer.from([0, 128]) }
  ]);
  await expect(files.getByRole('alert')).toContainText('模拟本机文件读取失败');
  expect((await readState(page)).files).toEqual(before);
  await expect(files.locator('tbody tr')).toHaveCount(1);
});

for (const failure of ['quota', 'abort'] as const) {
  test(`DESKTOP-US-603/AC4 import-${failure}：导入写入失败或事务中断时回滚整批，不留空文件，刷新后仍只有旧数据`, async ({
    page
  }) => {
    const files = await openFiles(page);
    await files
      .getByLabel('导入本机文件')
      .setInputFiles({ name: '保留.txt', mimeType: 'text/plain', buffer: Buffer.from('旧文件') });
    await expect(files.getByRole('button', { name: '打开 保留.txt', exact: true })).toBeVisible();
    const before = (await readState(page)).files;
    await page.evaluate(kind => {
      const put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (value: unknown, key?: IDBValidKey) {
        const data = (value as { data?: Partial<DesktopState> } | null)?.data;
        const importing = this.name === 'state' && data?.files?.some(file => file.name === '新文件A.bin');
        if (importing && kind === 'quota') throw new DOMException('模拟导入额度不足', 'QuotaExceededError');
        const request = put.call(this, value, key);
        if (importing && kind === 'abort')
          request.addEventListener('success', () => this.transaction.abort(), { once: true });
        return request;
      };
    }, failure);
    await files.getByLabel('导入本机文件').setInputFiles([
      { name: '新文件A.bin', mimeType: 'application/octet-stream', buffer: Buffer.from([0, 255]) },
      { name: '新文件B.bin', mimeType: 'application/octet-stream', buffer: Buffer.from([0, 128]) }
    ]);
    await expect(files.getByRole('alert')).toContainText(failure === 'quota' ? 'QUOTA' : 'STORAGE');
    expect((await readState(page)).files).toEqual(before);
    await expect(files.locator('tbody tr')).toHaveCount(1);
    await page.reload();
    await expect(files.locator('tbody tr')).toHaveCount(1);
    expect((await readState(page)).files).toEqual(before);
  });
}
