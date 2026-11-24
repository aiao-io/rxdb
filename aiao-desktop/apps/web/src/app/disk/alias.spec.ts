import { describe, expect, it } from 'vitest';

import { aliasJson, isAliasNode, makeAlias, parseAliasRecord, resolveAlias } from './alias';
import { fileKind, isAliasName } from './disk-kinds';
import { DESKTOP, DiskPath } from './disk-path';
import { FsNode, nodeAt, scanDisk } from './disk-tree';
import { MemoryDiskStore } from './memory-disk-store';

const bytes = (value: string): Uint8Array => new TextEncoder().encode(value);
const note = [...DESKTOP, 'note.txt'];
const alias = [...DESKTOP, 'note.txt alias'];

const node = (path: DiskPath | null, name: string): FsNode => ({
  name,
  path,
  kind: 'file',
  icon: 'f-txt',
  k: 'Alias',
  hidden: false
});

const setup = async () => {
  const store = new MemoryDiskStore();
  await store.write(note, bytes('keep'));
  return store;
};

describe('makeAlias', () => {
  it('在旁边生成 <名字> alias，内容是 JSON 目标路径，重名追加序号', async () => {
    const store = await setup();
    expect(await makeAlias(store, note)).toEqual(alias);
    expect(parseAliasRecord(await store.read(alias))).toEqual({ target: note });
    expect(await makeAlias(store, note)).toEqual([...DESKTOP, 'note.txt alias 2']);
  });

  it('卷根与不存在的条目不能生成别名', async () => {
    const store = await setup();
    await expect(makeAlias(store, [])).rejects.toMatchObject({ code: 'EACCES' });
    await expect(makeAlias(store, [...DESKTOP, 'ghost.txt'])).rejects.toMatchObject({ code: 'ENOENT' });
  });
});

describe('别名识别与解析', () => {
  it('isAliasNode 只认名字带 alias 后缀的文件；别名文件在 Finder 里按 Alias 显示', async () => {
    const store = await setup();
    await makeAlias(store, note);
    const tree = await scanDisk(store, new Date());
    const aliasNode = nodeAt(tree, alias)!;
    expect(isAliasNode(aliasNode)).toBe(true);
    expect(isAliasNode(nodeAt(tree, note)!)).toBe(false);
    expect(isAliasNode({ ...node(alias, 'dir alias'), kind: 'folder', icon: 'f-folder', k: 'Folder' })).toBe(false);
    expect(fileKind('note.txt alias')).toEqual({ kind: 'Alias', icon: 'f-alias' });
    expect(isAliasName('note.txt alias')).toBe(true);
    expect(isAliasName('note.txt')).toBe(false);
  });

  it('resolveAlias 解析出目标节点；别名损坏或目标不存在时为 null', async () => {
    const store = await setup();
    await makeAlias(store, note);
    const tree = await scanDisk(store, new Date());
    const aliasNode = nodeAt(tree, alias)!;
    const resolved = await resolveAlias(store, aliasNode);
    expect(resolved?.path).toEqual(note);
    expect(resolved?.kind).toBe('file');

    await store.write(alias, bytes('not json'));
    expect(await resolveAlias(store, aliasNode)).toBeNull();

    await store.write(alias, aliasJson([...DESKTOP, 'ghost.txt']));
    expect(await resolveAlias(store, aliasNode)).toBeNull();

    expect(await resolveAlias(store, nodeAt(tree, note)!)).toBeNull();
  });

  it('parseAliasRecord 拒绝损坏的形状', () => {
    expect(parseAliasRecord(bytes('{"target":["Users","ok"]}'))).toEqual({ target: ['Users', 'ok'] });
    expect(parseAliasRecord(bytes('{}'))).toBeNull();
    expect(parseAliasRecord(bytes('{"target":[]}'))).toBeNull();
    expect(parseAliasRecord(bytes('{"target":[1]}'))).toBeNull();
    expect(parseAliasRecord(bytes('nope'))).toBeNull();
  });
});
