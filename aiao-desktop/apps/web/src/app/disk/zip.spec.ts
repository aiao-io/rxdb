import { describe, expect, it } from 'vitest';

import { DESKTOP, DiskPath } from './disk-path';
import { MemoryDiskStore } from './memory-disk-store';
import { ZipResult, compressToZip, compressToZipFile, crc32 } from './zip';

const bytes = (value: string): Uint8Array => new TextEncoder().encode(value);

/** 本地时间构造，保证 DOS 时间字段不依赖测试机器的时区。 */
const NOW = new Date(2026, 10, 24, 12, 34, 56).getTime();
const clock = (): number => NOW;
const store = (): MemoryDiskStore => new MemoryDiskStore(clock);

const u16 = (data: Uint8Array, at: number): number => data[at] | (data[at + 1] << 8);
const u32 = (data: Uint8Array, at: number): number =>
  (data[at] + (data[at + 1] << 8) + (data[at + 2] << 16) + data[at + 3] * 0x1000000) >>> 0;

interface CentralEntry {
  readonly name: string;
  readonly crc: number;
  readonly size: number;
  readonly offset: number;
  readonly method: number;
  readonly flags: number;
  readonly directory: boolean;
}

/** 从 EOCD 读中央目录（测试用的小解析器）。 */
const central = (archive: ZipResult): CentralEntry[] => {
  const data = archive.bytes;
  expect(u32(data, data.length - 22)).toBe(0x06054b50);
  const count = u16(data, data.length - 14);
  const size = u32(data, data.length - 10);
  const offset = u32(data, data.length - 6);
  const entries: CentralEntry[] = [];
  let at = offset;
  for (let index = 0; index < count; index++) {
    expect(u32(data, at)).toBe(0x02014b50);
    const flags = u16(data, at + 8);
    const method = u16(data, at + 10);
    const crc = u32(data, at + 16);
    const entrySize = u32(data, at + 24);
    const nameLength = u16(data, at + 28);
    const extra = u16(data, at + 30);
    const comment = u16(data, at + 32);
    const directory = (u32(data, at + 38) & 0x10) !== 0;
    const localOffset = u32(data, at + 42);
    const name = new TextDecoder().decode(data.slice(at + 46, at + 46 + nameLength));
    entries.push({ name, crc, size: entrySize, offset: localOffset, method, flags, directory });
    at += 46 + nameLength + extra + comment;
  }
  expect(at).toBe(offset + size);
  return entries;
};

/** 读本地文件头并核对条目名、CRC 与内容（测试用）。 */
const local = (archive: ZipResult, entry: CentralEntry): Uint8Array => {
  const data = archive.bytes;
  expect(u32(data, entry.offset)).toBe(0x04034b50);
  const nameLength = u16(data, entry.offset + 26);
  expect(u16(data, entry.offset + 28)).toBe(0);
  const name = new TextDecoder().decode(data.slice(entry.offset + 30, entry.offset + 30 + nameLength));
  expect(name).toBe(entry.name);
  const content = data.slice(entry.offset + 30 + nameLength, entry.offset + 30 + nameLength + entry.size);
  expect(crc32(content)).toBe(entry.crc);
  return content;
};

describe('compressToZip', () => {
  it('单个文件：method 0、UTF-8 标志、CRC 对得上，归档名加 .zip', async () => {
    const disk = store();
    const path: DiskPath = [...DESKTOP, '你好.txt'];
    await disk.write(path, bytes('内容'));
    const archive = await compressToZip(disk, [path], { now: clock });
    expect(archive.name).toBe('你好.txt.zip');
    const [entry] = central(archive);
    expect(entry).toMatchObject({ name: '你好.txt', method: 0, flags: 0x0800, directory: false });
    expect(local(archive, entry)).toEqual(bytes('内容'));
    expect(crc32(bytes('内容'))).toBe(entry.crc);
  });

  it('目录递归收进子项与空目录，目录条目以 / 结尾且无内容', async () => {
    const disk = store();
    const dir = [...DESKTOP, 'project'];
    await disk.write([...dir, 'sub', 'a.bin'], new Uint8Array([0, 255]));
    await disk.mkdir([...dir, 'blank']);
    const archive = await compressToZip(disk, [dir], { now: clock });
    expect(archive.name).toBe('project.zip');
    const entries = central(archive);
    expect(entries.map(entry => entry.name)).toEqual(['project/', 'project/blank/', 'project/sub/', 'project/sub/a.bin']);
    expect(entries.filter(entry => entry.directory)).toHaveLength(3);
    const file = entries.find(entry => !entry.directory)!;
    expect(local(archive, file)).toEqual(new Uint8Array([0, 255]));
  });

  it('多个条目同名时用祖先目录名消歧，归档名 Archive.zip；空选择与不存在的条目拒绝', async () => {
    const disk = store();
    await disk.write([...DESKTOP, 'a', 'x.txt'], bytes('one'));
    await disk.write([...DESKTOP, 'b', 'x.txt'], bytes('two'));
    const archive = await compressToZip(
      disk,
      [
        [...DESKTOP, 'a', 'x.txt'],
        [...DESKTOP, 'b', 'x.txt']
      ],
      { now: clock }
    );
    expect(archive.name).toBe('Archive.zip');
    expect(central(archive).map(entry => entry.name)).toEqual(['x.txt', 'b/x.txt']);

    await disk.write([...DESKTOP, 'a', 'b', 'x.txt'], bytes('three'));
    const nested = await compressToZip(
      disk,
      [
        [...DESKTOP, 'a', 'x.txt'],
        [...DESKTOP, 'a', 'b', 'x.txt'],
        [...DESKTOP, 'b', 'x.txt']
      ],
      { now: clock }
    );
    expect(central(nested).map(entry => entry.name)).toEqual(['x.txt', 'b/x.txt', 'b/x 2.txt']);
    await expect(compressToZip(disk, [], { now: clock })).rejects.toThrow('Select items');
    await expect(compressToZip(disk, [[...DESKTOP, 'missing']], { now: clock })).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('修改时间写进 DOS 日期与时间字段', async () => {
    const disk = store();
    const path = [...DESKTOP, 'note.txt'];
    await disk.write(path, bytes('x'));
    const archive = await compressToZip(disk, [path], { now: clock });
    const data = archive.bytes;
    const [entry] = central(archive);
    expect(u16(data, entry.offset + 10)).toBe((12 << 11) | (34 << 5) | 28);
    expect(u16(data, entry.offset + 12)).toBe(((2026 - 1980) << 9) | (11 << 5) | 24);
  });
});

describe('compressToZipFile', () => {
  it('写进目标目录、重名追加序号；目标必须是目录', async () => {
    const disk = store();
    const path = [...DESKTOP, 'note.txt'];
    await disk.write(path, bytes('hello'));
    const target = await compressToZipFile(disk, [path], DESKTOP, { now: clock });
    expect(target).toEqual([...DESKTOP, 'note.txt.zip']);
    expect((await disk.read(target)).byteLength).toBeGreaterThan(40);
    expect(await compressToZipFile(disk, [path], DESKTOP, { now: clock })).toEqual([...DESKTOP, 'note.txt 2.zip']);
    await expect(compressToZipFile(disk, [path], [...DESKTOP, 'missing'], { now: clock })).rejects.toMatchObject({
      code: 'ENOENT'
    });
    await expect(compressToZipFile(disk, [path], path, { now: clock })).rejects.toMatchObject({ code: 'ENOTDIR' });
  });
});

describe('crc32', () => {
  it('已知向量与空输入', () => {
    expect(crc32(bytes('123456789'))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0);
  });
});
