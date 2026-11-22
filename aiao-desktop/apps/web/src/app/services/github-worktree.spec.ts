import { describe, expect, it } from 'vitest';
import { MemoryDiskStore } from '../disk/memory-disk-store';
import { projectionHashes, recoverWorkingFiles, worktreeFiles } from './github-worktree';

const root = ['Users', 'dev', 'project'];
const file = (path: string, value: string) => ({ path, bytes: new TextEncoder().encode(value) });

describe('卷内 Git 工作目录', () => {
  it('中断的检出只补写本次 Git 改动，保留其他终端文件', async () => {
    const store = new MemoryDiskStore();
    const before = [file('old', 'remove'), file('a', 'base')];
    for (const item of [...before, file('extra', 'terminal')]) await store.write([...root, item.path], item.bytes);
    const files = await worktreeFiles(store, root);
    const touched = await recoverWorkingFiles(store, root, await projectionHashes(before), files, [file('a', 'next')]);
    expect(touched).toHaveLength(2);
    expect(await store.kindOf([...root, 'old'])).toBeNull();
    expect(await store.read([...root, 'extra'])).toEqual(file('', 'terminal').bytes);
  });
  it('恢复前整批检查冲突，保留两个入口的版本', async () => {
    const store = new MemoryDiskStore();
    const before = [file('a', 'base')];
    await store.write([...root, 'a'], file('', 'local').bytes);
    await expect(
      recoverWorkingFiles(store, root, await projectionHashes(before), await worktreeFiles(store, root), [
        file('a', 'git')
      ])
    ).rejects.toThrow('a');
    expect(await store.read([...root, 'a'])).toEqual(file('', 'local').bytes);
  });
});
