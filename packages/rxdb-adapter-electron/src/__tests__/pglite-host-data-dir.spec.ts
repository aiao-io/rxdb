/**
 * host 侧 PGlite 数据目录工具（US-217 阶段 C）。
 *
 * @remarks
 * 遍历格式必须与浏览器端 `walkEmscriptenDataDir` 逐项一致——两端写出的归档要能互相比对；
 * 数据块必须各自独占恰好大小的 `ArrayBuffer`——结构化克隆搬的是整个 backing buffer（AC#9、AC#21）。
 */

import { RxDBAdapterDesktopError, type DesktopPgliteDataDirItem } from '@aiao/rxdb-adapter-sqlite-core/desktop-host';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  truncateSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  hasPgVersion,
  isEmptyOrMissing,
  removePgliteDataDirectory,
  syncPgliteDataDirectory,
  toHostIoError,
  walkPgliteDataDirectory
} from '../pglite-host/pglite-host-data-dir.js';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'rxdb-pglite-host-dir-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const writeTree = (directory: string, files: Record<string, Uint8Array | string>): void => {
  for (const [path, content] of Object.entries(files)) {
    const full = join(directory, path);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, content);
  }
};

const collect = async (items: AsyncIterable<DesktopPgliteDataDirItem>): Promise<DesktopPgliteDataDirItem[]> => {
  const result: DesktopPgliteDataDirItem[] = [];
  for await (const item of items) result.push(item);
  return result;
};

const describeItem = (item: DesktopPgliteDataDirItem): string =>
  item.type === 'entry' ?
    `${item.header.kind}:${item.header.path}:${item.header.size}`
  : `data:${item.bytes.byteLength}`;

const desktopCode = async (promise: Promise<unknown>): Promise<string> => {
  const error = await promise.then(
    () => undefined,
    (reason: unknown) => reason
  );
  expect(error).toBeInstanceOf(RxDBAdapterDesktopError);
  return (error as RxDBAdapterDesktopError).code;
};

const patterned = (size: number): Uint8Array => Uint8Array.from({ length: size }, (_, index) => index % 251);

describe('walkPgliteDataDirectory', () => {
  it('父目录先于子项、子项按码点排序，运行态文件在任何深度都不产出', async () => {
    const dir = join(root, 'db');
    writeTree(dir, {
      PG_VERSION: '17\n',
      'base/1/1234': 'x',
      'base/1/B': 'yy',
      'global/pg_control': 'zzz',
      'postmaster.pid': 'pid',
      'base/postmaster.opts': 'opts',
      'global/pg_internal.init': 'init'
    });

    const items = await collect(walkPgliteDataDirectory(dir));

    expect(items.map(describeItem)).toEqual([
      'file:PG_VERSION:3',
      'data:3',
      'directory:base:0',
      'directory:base/1:0',
      'file:base/1/1234:1',
      'data:1',
      'file:base/1/B:2',
      'data:2',
      'directory:global:0',
      'file:global/pg_control:3',
      'data:3'
    ]);
  });

  it('大文件按 64K 切块，每块独占恰好大小的 ArrayBuffer 且内容不变', async () => {
    const dir = join(root, 'db');
    const content = patterned(153_600);
    writeTree(dir, { 'base/big': content });

    const items = await collect(walkPgliteDataDirectory(dir));
    const chunks = items.flatMap(item => (item.type === 'data' ? [item.bytes] : []));

    expect(chunks.map(chunk => chunk.byteLength)).toEqual([65_536, 65_536, 22_528]);
    for (const chunk of chunks) expect(chunk.buffer.byteLength).toBe(chunk.byteLength);
    const joined = new Uint8Array(content.byteLength);
    let offset = 0;
    for (const chunk of chunks) {
      joined.set(chunk, offset);
      offset += chunk.byteLength;
    }
    expect(joined).toEqual(content);
  });

  it('空文件只有条目、没有数据块', async () => {
    const dir = join(root, 'db');
    writeTree(dir, { empty: new Uint8Array(0) });

    expect((await collect(walkPgliteDataDirectory(dir))).map(describeItem)).toEqual(['file:empty:0']);
  });

  it('条目之后文件变短：报 host_internal_error，而不是写出与条目大小不符的数据', async () => {
    const dir = join(root, 'db');
    writeTree(dir, { shrinking: patterned(100_000) });
    const iterator = walkPgliteDataDirectory(dir);

    const first = await iterator.next();
    expect(first.value && describeItem(first.value)).toBe('file:shrinking:100000');
    truncateSync(join(dir, 'shrinking'), 10);

    const chunk = await iterator.next();
    expect(chunk.value && describeItem(chunk.value)).toBe('data:10');
    expect(await desktopCode(iterator.next())).toBe('host_internal_error');
  });

  it.skipIf(process.platform === 'win32')('符号链接不是数据目录能有的东西：报 host_internal_error', async () => {
    const dir = join(root, 'db');
    writeTree(dir, { target: 'x' });
    symlinkSync(join(dir, 'target'), join(dir, 'link'));

    expect(await desktopCode(collect(walkPgliteDataDirectory(dir)))).toBe('host_internal_error');
  });

  it('目录不存在：报 file_not_found', async () => {
    expect(await desktopCode(collect(walkPgliteDataDirectory(join(root, 'missing'))))).toBe('file_not_found');
  });

  it('提前结束遍历时关掉正在读的文件', async () => {
    const dir = join(root, 'db');
    writeTree(dir, { big: patterned(200_000) });
    const iterator = walkPgliteDataDirectory(dir);
    await iterator.next();
    await iterator.next();

    await iterator.return(undefined);

    // 句柄已关：Windows 上仍被打开的文件删不掉，POSIX 上靠下一次遍历照常开始来旁证
    rmSync(join(dir, 'big'));
    expect(existsSync(join(dir, 'big'))).toBe(false);
    expect(await iterator.next()).toEqual({ done: true, value: undefined });
  });
});

describe('isEmptyOrMissing', () => {
  it('不存在或空目录可以恢复；有内容或是个普通文件则不行', async () => {
    const empty = join(root, 'empty');
    mkdirSync(empty);
    writeTree(root, { 'full/PG_VERSION': '17', file: 'x' });

    expect(await isEmptyOrMissing(join(root, 'missing'))).toBe(true);
    expect(await isEmptyOrMissing(empty)).toBe(true);
    expect(await isEmptyOrMissing(join(root, 'full'))).toBe(false);
    expect(await isEmptyOrMissing(join(root, 'file'))).toBe(false);
  });
});

describe('hasPgVersion', () => {
  it('只认普通文件形态的 PG_VERSION', async () => {
    writeTree(root, { 'ok/PG_VERSION': '17' });
    mkdirSync(join(root, 'dir/PG_VERSION'), { recursive: true });

    expect(await hasPgVersion(join(root, 'ok'))).toBe(true);
    expect(await hasPgVersion(join(root, 'dir'))).toBe(false);
    expect(await hasPgVersion(join(root, 'missing'))).toBe(false);
  });
});

describe('syncPgliteDataDirectory / removePgliteDataDirectory', () => {
  it('整棵树逐一落盘后内容不变', async () => {
    const dir = join(root, 'db');
    writeTree(dir, { PG_VERSION: '17', 'base/1/1': 'a', empty: new Uint8Array(0) });

    await syncPgliteDataDirectory(dir);

    expect(readFileSync(join(dir, 'base/1/1'), 'utf8')).toBe('a');
  });

  it('要落盘的目录不存在：报 file_not_found', async () => {
    expect(await desktopCode(syncPgliteDataDirectory(join(root, 'missing')))).toBe('file_not_found');
  });

  it('删除整棵树；不存在时视为已删除', async () => {
    const dir = join(root, 'db');
    writeTree(dir, { 'base/1/1': 'a' });

    await removePgliteDataDirectory(dir);
    await removePgliteDataDirectory(dir);

    expect(existsSync(dir)).toBe(false);
  });
});

describe('toHostIoError', () => {
  const errno = (code: string): Error => Object.assign(new Error(code), { code });

  it.each([
    ['ENOSPC', 'disk_full'],
    ['EDQUOT', 'disk_full'],
    ['EACCES', 'permission_denied'],
    ['EPERM', 'permission_denied'],
    ['EROFS', 'permission_denied'],
    ['ENOENT', 'file_not_found'],
    ['EIO', 'host_internal_error']
  ])('%s → %s，cause 保留原始错误', (code, expected) => {
    const cause = errno(code);
    const error = toHostIoError(cause, 'detail');

    expect(error.code).toBe(expected);
    expect(error.detail).toBe('detail');
    expect(error.cause).toBe(cause);
  });

  it('非 errno 形状的错误同样按 host 自身故障上报', () => {
    expect(toHostIoError('boom', 'detail').code).toBe('host_internal_error');
    expect(toHostIoError(null, 'detail').code).toBe('host_internal_error');
  });

  it('已经是桌面错误的原样透传', () => {
    const original = new RxDBAdapterDesktopError('database_busy', 'held');

    expect(toHostIoError(original, 'outer')).toBe(original);
  });
});
