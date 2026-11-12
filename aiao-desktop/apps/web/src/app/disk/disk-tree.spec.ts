import { describe, expect, it } from 'vitest';

import { TRASH } from './disk-path';
import { FileRow, buildTree, nodeAt, scanDisk, searchNodes, visibleChildren } from './disk-tree';
import { MemoryDiskStore } from './memory-disk-store';

describe('buildTree', () => {
  const row = (
    id: string,
    parentId: string | null,
    name: string,
    folder: boolean,
    modified: number,
    size = 0
  ): FileRow => ({
    id,
    parentId,
    name,
    folder,
    size,
    modified: new Date(modified)
  });

  it('按 parentId 组装，路径由各级名字拼成', () => {
    const root = buildTree(
      [
        row('u', null, 'Users', true, 1_000),
        row('p', 'u', 'prasenjit', true, 1_000),
        row('n', 'p', 'a.txt', false, 3_000, 12)
      ],
      new Date(0)
    );
    expect(nodeAt(root, ['Users', 'prasenjit', 'a.txt'])).toMatchObject({
      kind: 'file',
      path: ['Users', 'prasenjit', 'a.txt'],
      bytes: 12,
      size: '12 bytes',
      date: new Date(3_000)
    });
  });

  it('文件夹日期取自身与子项里最新的一个', () => {
    const root = buildTree(
      [
        row('u', null, 'Users', true, 1_000),
        row('p', 'u', 'prasenjit', true, 5_000),
        row('e', 'u', 'Empty', true, 2_000)
      ],
      new Date(0)
    );
    expect(nodeAt(root, ['Users'])?.date).toEqual(new Date(5_000));
    expect(nodeAt(root, ['Users', 'Empty'])?.date).toEqual(new Date(2_000));
  });

  it('父节点不存在的行不出现在树里', () => {
    const root = buildTree([row('x', 'missing', 'orphan.txt', false, 1)], new Date(0));
    expect(root.children).toEqual([]);
  });
});

const bytes = (length: number): Uint8Array => new Uint8Array(length);
const EMPTY_DATE = new Date(2026, 10, 1, 9, 0);

async function sampleStore(): Promise<MemoryDiskStore> {
  let now = Date.UTC(2026, 6, 1);
  const store = new MemoryDiskStore(() => now);
  await store.write(['Users', 'prasenjit', 'Desktop', 'b.txt'], bytes(2_100));
  now = Date.UTC(2026, 6, 27);
  await store.write(['Users', 'prasenjit', 'Desktop', 'A.png'], bytes(3_800_000));
  await store.write(['Applications', 'Notes.app', 'Contents', 'Info.plist'], bytes(600));
  await store.write(['Applications', 'Notes.app', 'Contents', 'PkgInfo'], bytes(8));
  await store.mkdir(['Library', 'Caches']);
  await store.write([...TRASH, 'old-draft.md'], bytes(10));
  await store.write(['Users', 'prasenjit', '.zshrc'], bytes(4));
  return store;
}

describe('scanDisk', () => {
  it('根节点是 Macintosh HD，子项按名字排序', async () => {
    const root = await scanDisk(await sampleStore(), EMPTY_DATE);
    expect(root).toMatchObject({ name: 'Macintosh HD', path: [], kind: 'folder', icon: 'f-hd', k: 'Folder' });
    expect(root.children?.map(child => child.name)).toEqual(['Applications', 'Library', 'Users']);
  });

  it('文件带真实大小、种类、图标与修改时间', async () => {
    const root = await scanDisk(await sampleStore(), EMPTY_DATE);
    const desktop = nodeAt(root, ['Users', 'prasenjit', 'Desktop']);
    expect(desktop?.children?.map(child => child.name)).toEqual(['A.png', 'b.txt']);
    expect(nodeAt(root, ['Users', 'prasenjit', 'Desktop', 'A.png'])).toMatchObject({
      kind: 'file',
      path: ['Users', 'prasenjit', 'Desktop', 'A.png'],
      icon: 'f-img',
      k: 'PNG image',
      bytes: 3_800_000,
      size: '3.8 MB',
      date: new Date(Date.UTC(2026, 6, 27)),
      hidden: false
    });
  });

  it('文件夹的日期取最新的子项，空文件夹用给定日期', async () => {
    const root = await scanDisk(await sampleStore(), EMPTY_DATE);
    expect(nodeAt(root, ['Users', 'prasenjit', 'Desktop'])?.date).toEqual(new Date(Date.UTC(2026, 6, 27)));
    expect(nodeAt(root, ['Library', 'Caches'])?.date).toEqual(EMPTY_DATE);
  });

  it('.app 目录是一个程序包：按文件显示，大小是包内总和，不往下展开', async () => {
    const root = await scanDisk(await sampleStore(), EMPTY_DATE);
    const app = nodeAt(root, ['Applications', 'Notes.app']);
    expect(app).toMatchObject({ kind: 'file', k: 'Application', icon: 'f-app', bytes: 608, size: '608 bytes' });
    expect(app?.children).toBeUndefined();
    expect(nodeAt(root, ['Applications', 'Notes.app', 'Contents'])).toBeNull();
  });

  it('隐藏项保留在树里，但不出现在可见子项与搜索结果中', async () => {
    const root = await scanDisk(await sampleStore(), EMPTY_DATE);
    const home = nodeAt(root, ['Users', 'prasenjit']);
    expect(home?.children?.map(child => child.name)).toEqual(['.Trash', '.zshrc', 'Desktop']);
    expect(visibleChildren(home).map(child => child.name)).toEqual(['Desktop']);
    expect(nodeAt(root, TRASH)).toMatchObject({ icon: 'app-trash', hidden: true });
    expect(searchNodes(root, 'draft')).toEqual([]);
    expect(searchNodes(root, 'a.png').map(node => node.name)).toEqual(['A.png']);
  });
});
