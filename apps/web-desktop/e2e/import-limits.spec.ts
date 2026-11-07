import { expect, test, type FrameLocator } from '@playwright/test';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdtemp, open, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { downloadFile, openFiles } from './import-support.js';
import { fileInfo } from './state.js';

const MiB = 1024 * 1024;

async function fixtureFile(directory: string, name: string, size: number): Promise<string> {
  const path = join(directory, name);
  const file = await open(path, 'w');
  try {
    await file.truncate(size);
    await file.write(
      new Uint8Array(256).map((_, index) => index),
      0,
      256,
      0
    );
    await file.write(new Uint8Array([165]), 0, 1, size - 1);
  } finally {
    await file.close();
  }
  return path;
}

async function fileHash(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const bytes of createReadStream(path)) hash.update(bytes);
  return hash.digest('hex');
}

async function selectFiles(files: FrameLocator, paths: string[]): Promise<string[]> {
  const input = files.getByLabel('导入本机文件');
  await input.evaluate(element => {
    element.addEventListener(
      'change',
      () => {
        const selected = (element as HTMLInputElement).files;
        element.dataset['fixtureTypes'] = JSON.stringify(Array.from(selected ?? [], file => file.type));
      },
      { capture: true, once: true }
    );
  });
  await input.setInputFiles(paths);
  return JSON.parse((await input.getAttribute('data-fixture-types'))!);
}

async function expectImported(files: FrameLocator, count: number, timeout: number): Promise<void> {
  await files.locator('tbody tr').first().or(files.getByRole('alert')).first().waitFor({ state: 'visible', timeout });
  expect(await files.getByRole('alert').allTextContents()).toEqual([]);
  await expect(files.locator('tbody tr')).toHaveCount(count);
}

for (const limit of ['single', 'count', 'batch'] as const) {
  test(`DESKTOP-US-603/AC3 import-limit-${limit}：真实超限选择在读取/写入前整批拒绝，原文件不变`, async ({ page }) => {
    test.setTimeout(120000);
    const directory = await mkdtemp(join(tmpdir(), 'desktop-import-reject-'));
    try {
      const files = await openFiles(page);
      await files
        .getByLabel('导入本机文件')
        .setInputFiles({ name: '保留.txt', mimeType: 'text/plain', buffer: Buffer.from('原文件') });
      await expect(files.getByRole('button', { name: '打开 保留.txt', exact: true })).toBeVisible();
      const before = await fileInfo(page, true);
      let paths: string[];
      if (limit === 'count') {
        await files.getByLabel('导入本机文件').setInputFiles(
          Array.from({ length: 101 }, (_, index) => ({
            name: `超量${index}.bin`,
            mimeType: 'application/octet-stream',
            buffer: Buffer.from([index])
          }))
        );
      } else {
        paths = [];
        const count = limit === 'single' ? 1 : 5;
        const size = limit === 'single' ? 50 * MiB + 1 : 41 * MiB;
        for (let index = 0; index < count; index++) paths.push(await fixtureFile(directory, `超限${index}.bin`, size));
        await files.getByLabel('导入本机文件').setInputFiles(paths);
      }
      await expect(files.getByRole('alert')).toContainText('LIMIT');
      await expect(files.getByRole('alert')).toContainText('单文件最多 50 MiB，每批最多 100 个文件、200 MiB');
      await expect(files.locator('tbody tr')).toHaveCount(1);
      expect(await fileInfo(page, true)).toEqual(before);
      await page.reload();
      await expect(files.locator('tbody tr')).toHaveCount(1);
      expect(await fileInfo(page, true)).toEqual(before);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
}

test('DESKTOP-US-603/AC1/3/5 import-limit-exact50：50 MiB 原始二进制可完整导入和下载，修改本机源文件不改变虚拟副本', async ({
  page
}) => {
  test.setTimeout(180000);
  const directory = await mkdtemp(join(tmpdir(), 'desktop-import-50-'));
  try {
    const path = await fixtureFile(directory, '边界50.bin', 50 * MiB);
    const sha256 = await fileHash(path);
    const files = await openFiles(page);
    const [nativeType] = await selectFiles(files, [path]);
    await expectImported(files, 1, 120000);
    const info = await fileInfo(page, true);
    expect(info).toHaveLength(1);
    expect(info[0]).toMatchObject({
      name: '边界50.bin',
      size: 50 * MiB,
      sha256,
      mime: nativeType || 'application/octet-stream'
    });
    const source = await open(path, 'r+');
    try {
      await source.write(new Uint8Array([9, 9, 9, 9]), 0, 4, 0);
    } finally {
      await source.close();
    }
    expect(await fileHash(path)).not.toBe(sha256);
    const downloaded = await downloadFile(page, files, '边界50.bin', 120000);
    expect(downloaded.length).toBe(50 * MiB);
    expect(createHash('sha256').update(downloaded).digest('hex')).toBe(sha256);
    await page.reload();
    await expect(files.getByRole('button', { name: '打开 边界50.bin', exact: true })).toBeVisible({ timeout: 120000 });
    expect(await fileInfo(page, true)).toEqual(info);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('DESKTOP-US-603/AC3 import-limit-exact200：4 个真实 50 MiB 文件整批完整导入，全部哈希与刷新结果一致', async ({
  page
}) => {
  test.setTimeout(240000);
  const directory = await mkdtemp(join(tmpdir(), 'desktop-import-200-'));
  try {
    const paths: string[] = [];
    for (let index = 0; index < 4; index++) paths.push(await fixtureFile(directory, `批次${index}.bin`, 50 * MiB));
    const sha256 = await fileHash(paths[0]);
    const files = await openFiles(page);
    const nativeTypes = await selectFiles(files, paths);
    await expectImported(files, 4, 180000);
    const info = await fileInfo(page, true);
    expect(info.map(file => file.name).sort()).toEqual(['批次0.bin', '批次1.bin', '批次2.bin', '批次3.bin']);
    for (const [index, file] of info.entries())
      expect(file).toMatchObject({ size: 50 * MiB, sha256, mime: nativeTypes[index] || 'application/octet-stream' });
    await page.reload();
    await expect(files.locator('tbody tr')).toHaveCount(4, { timeout: 120000 });
    expect(await fileInfo(page, true)).toEqual(info);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('DESKTOP-US-603/AC3 import-limit-exact100：恰好 100 个文件全部导入，不丢失最后一项', async ({ page }) => {
  const files = await openFiles(page);
  await files.getByLabel('导入本机文件').setInputFiles(
    Array.from({ length: 100 }, (_, index) => ({
      name: `允许${index}.bin`,
      mimeType: 'application/octet-stream',
      buffer: Buffer.from([index])
    }))
  );
  await expectImported(files, 100, 10000);
  const info = await fileInfo(page, true);
  expect(info).toHaveLength(100);
  for (let index = 0; index < 100; index++) {
    expect(info.find(file => file.name === `允许${index}.bin`)).toMatchObject({
      size: 1,
      sha256: createHash('sha256')
        .update(Buffer.from([index]))
        .digest('hex')
    });
  }
});
