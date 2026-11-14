import { afterEach, describe, expect, it, vi } from 'vitest';
import { encodeBytes } from './bytes.js';
import { openDatabase, type DesktopDatabase } from './database.js';
import { createFile, deleteFile, moveFile, renameFile, restoreFile, trashFile, writeFile } from './files.js';
import { openOpfsDatabase, resetOpfs } from './opfs.js';

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});
async function fixture() {
  const name = `opfs-test-${crypto.randomUUID()}`;
  const origin = await navigator.storage.getDirectory();
  const root = await origin.getDirectoryHandle(name, { create: true });
  const raw = await openDatabase(() => true, 'windows', name);
  let database: DesktopDatabase = raw;
  cleanups.push(async () => {
    database.close();
    indexedDB.deleteDatabase(name);
    await origin.removeEntry(name, { recursive: true });
  });
  return { root, raw, open: async (owns = () => true) => (database = await openOpfsDatabase(raw, owns, root)) };
}
async function physical(root: FileSystemDirectoryHandle, name: string, text: string) {
  const file = await root.getFileHandle(name, { create: true });
  const writer = await file.createWritable();
  await writer.write(text);
  await writer.close();
}

async function contents(root: FileSystemDirectoryHandle, name: string) {
  return (await (await root.getFileHandle(name)).getFile()).text();
}

describe('OPFS 真实文件系统', () => {
  it('读取已有目录、二进制字节，外部改写提升版本且保持标识', async () => {
    const f = await fixture();
    const directory = await f.root.getDirectoryHandle('项目', { create: true });
    await physical(directory, '中文.txt', '原始内容');
    const db = await f.open();
    const first = (await db.read()).files;
    const file = first.find(file => file.name === '中文.txt')!;
    expect(first.find(item => item.id === file.parentId)?.name).toBe('项目');
    expect(file.bytes).toBe(encodeBytes(new TextEncoder().encode('原始内容')));
    await physical(directory, '中文.txt', '外部更新');
    const updated = (await db.read()).files.find(item => item.id === file.id)!;
    expect(updated.revision).toBe(file.revision + 1);
    expect(updated.bytes).toBe(encodeBytes(new TextEncoder().encode('外部更新')));
    const binary = await db.transact(state => createFile(state, { name: 'image.bin', bytes: '/wAB' }));
    const bytes = await (await (await f.root.getFileHandle(binary.name)).getFile()).arrayBuffer();
    expect([...new Uint8Array(bytes)]).toEqual([255, 0, 1]);
  });

  it('迁移旧 IndexedDB 文件，重命名、移动、回收、恢复和永久删除同步目录', async () => {
    const f = await fixture();
    const old = await f.raw.transact(state => createFile(state, { name: '旧文档.txt', bytes: 'QQ==' }));
    const db = await f.open();
    expect(await contents(f.root, old.name)).toBe('A');
    const folder = await db.transact(state => createFile(state, { name: '真实目录', kind: 'directory' }));
    await db.transact(state => {
      renameFile(state, old.id, '重命名.txt');
      moveFile(state, old.id, folder.id);
    });
    await expect(f.root.getFileHandle(old.name)).rejects.toThrow();
    const directory = await f.root.getDirectoryHandle(folder.name);
    expect(await contents(directory, '重命名.txt')).toBe('A');
    await db.transact(state => trashFile(state, folder.id));
    await expect(f.root.getDirectoryHandle(folder.name)).rejects.toThrow();
    expect((await db.read()).files.filter(file => file.deleted)).toHaveLength(2);
    await db.transact(state => restoreFile(state, folder.id));
    expect(await contents(await f.root.getDirectoryHandle(folder.name), '重命名.txt')).toBe('A');
    await db.transact(state => {
      trashFile(state, folder.id);
      deleteFile(state, folder.id);
    });
    expect((await db.read()).files).toEqual([]);
  });

  it('外部删除从列表移除，内部目录不可见且禁止创建同名根目录', async () => {
    const f = await fixture();
    const db = await f.open();
    await db.transact(state => createFile(state, { name: '删除.txt' }));
    await f.root.removeEntry('删除.txt');
    expect((await db.read()).files).toEqual([]);
    await expect(
      db.transact(state => createFile(state, { name: '.orbit-desktop', kind: 'directory' }))
    ).rejects.toThrow('INVALID');
  });

  it('变更校验失败或失去拥有权时保留 OPFS 和元数据', async () => {
    const f = await fixture();
    let owns = true;
    const db = await f.open(() => owns);
    const file = await db.transact(state => createFile(state, { name: '保留.txt', bytes: 'QQ==' }));
    await expect(
      db.transact(state => {
        writeFile(state, file.id, 1, 'Qg==');
        throw Error('取消');
      })
    ).rejects.toThrow('取消');
    expect(await contents(f.root, file.name)).toBe('A');
    owns = false;
    await expect(db.transact(state => renameFile(state, file.id, '错误.txt'))).rejects.toThrow('OWNERSHIP');
  });

  it('元数据提交失败时回滚已经写入的真实文件', async () => {
    const f = await fixture();
    const db = await f.open();
    const file = await db.transact(state => createFile(state, { name: '原子.txt', bytes: 'QQ==' }));
    vi.spyOn(f.raw, 'transact').mockRejectedValueOnce(new Error('提交失败'));
    await expect(db.transact(state => writeFile(state, file.id, 1, 'Qg=='))).rejects.toThrow('提交失败');
    expect(await contents(f.root, file.name)).toBe('A');
    expect((await db.read()).files[0].bytes).toBe('QQ==');
    vi.restoreAllMocks();
  });

  it.each([false, true])('崩溃恢复按元数据提交状态恢复文件：committed=%s', async committed => {
    const f = await fixture();
    const db = await f.open();
    const file = await db.transact(state => createFile(state, { name: '恢复.txt', bytes: 'QQ==' }));
    const before = (await f.raw.read()).files;
    const after = structuredClone(before);
    after[0].bytes = 'Qg==';
    after[0].revision++;
    const internal = await f.root.getDirectoryHandle('.orbit-desktop');
    await physical(internal, 'pending.json', JSON.stringify({ before, after }));
    await physical(f.root, file.name, 'B');
    if (committed)
      await f.raw.transact(state => {
        state.files = after;
      });
    await f.open();
    expect(await contents(f.root, file.name)).toBe(committed ? 'B' : 'A');
    await expect(internal.getFileHandle('pending.json')).rejects.toThrow();
  });

  it('迁移碰到不同内容的同名 OPFS 文件时明确报错，保留两侧数据', async () => {
    const f = await fixture();
    await f.raw.transact(state => createFile(state, { name: '冲突.txt', bytes: 'QQ==' }));
    await physical(f.root, '冲突.txt', 'B');
    await expect(f.open()).rejects.toThrow('EXISTS');
    expect(await contents(f.root, '冲突.txt')).toBe('B');
    expect((await f.raw.read()).files[0].bytes).toBe('QQ==');
  });
  it('目录重命名保留后代标识与文件内容，外部删除原目录后仍可恢复回收站文件', async () => {
    const f = await fixture();
    const db = await f.open();
    const folder = await db.transact(state => createFile(state, { name: '原目录', kind: 'directory' }));
    const file = await db.transact(state => createFile(state, { name: '保留.md', parentId: folder.id, bytes: 'QQ==' }));
    await db.transact(state => renameFile(state, folder.id, '新目录'));
    expect(await contents(await f.root.getDirectoryHandle('新目录'), file.name)).toBe('A');
    expect((await db.read()).files.find(item => item.id === file.id)?.parentId).toBe(folder.id);
    await db.transact(state => trashFile(state, file.id));
    await f.root.removeEntry('新目录', { recursive: true });
    expect((await db.read()).files.find(item => item.id === file.id)?.parentId).toBe(null);
    await db.transact(state => restoreFile(state, file.id));
    expect(await contents(f.root, file.name)).toBe('A');
  });

  it('同时提交操作按顺序串行执行，不丢失目录或配置', async () => {
    const f = await fixture();
    const db = await f.open();
    await Promise.all([
      db.transact(state => createFile(state, { name: '一.txt' })),
      db.transact(state => createFile(state, { name: '二.txt' })),
      db.transact(state => {
        state.profile.theme = 'dark';
      })
    ]);
    await db.flush();
    const state = await db.read();
    expect(state.files).toHaveLength(2);
    expect(state.profile.theme).toBe('dark');
    db.close();
    await expect(db.read()).rejects.toThrow('OWNERSHIP');
  });

  it('迁移中断后重试接受相同内容，不覆盖其他真实文件', async () => {
    const f = await fixture();
    const old = await f.raw.transact(state => createFile(state, { name: '旧.txt', bytes: 'QQ==' }));
    await physical(f.root, old.name, 'A');
    await physical(f.root, '其他.txt', 'B');
    const db = await f.open();
    expect((await db.read()).files.find(file => file.id === old.id)?.name).toBe(old.name);
    expect(await contents(f.root, '其他.txt')).toBe('B');
  });

  it('物理文件写入失败后回滚，清理恢复记录并保留旧内容', async () => {
    const f = await fixture();
    const db = await f.open();
    const file = await db.transact(state => createFile(state, { name: 'quota.txt', bytes: 'QQ==' }));
    vi.spyOn(f.root, 'getFileHandle').mockRejectedValueOnce(new DOMException('额度不足', 'QuotaExceededError'));
    await expect(db.transact(state => writeFile(state, file.id, 1, 'Qg=='))).rejects.toThrow('额度不足');
    expect(await contents(f.root, file.name)).toBe('A');
    expect((await db.read()).files[0].bytes).toBe('QQ==');
    vi.restoreAllMocks();
  });
  it('显式重置先检查拥有权，并删除用户文件及内部回收站', async () => {
    const f = await fixture();
    const db = await f.open();
    const file = await db.transact(state => createFile(state, { name: '删除全部.txt', bytes: 'QQ==' }));
    await expect(resetOpfs(() => false, f.root)).rejects.toThrow('OWNERSHIP');
    expect(await contents(f.root, file.name)).toBe('A');
    await resetOpfs(() => true, f.root);
    const entries: string[] = [];
    for await (const name of f.root.keys()) entries.push(name);
    expect(entries).toEqual([]);
  });
});
