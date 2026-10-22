import { parseRxDBChangeKey, type SwitchVersionActions, type TransactionExecutor } from '@aiao/rxdb';
import { expect, it } from 'vitest';
import { preview_merge } from '../branch-compare.js';
import { merge_branch } from '../merge-branch.js';
import type { VersionManager } from '../VersionManager.js';
import { MemoryBranchHistory } from './fixtures/memory-branch-history.js';

it('normal 预览不列两边都不存在的幽灵删除，仍计入实际重放的变更条数', async () => {
  const history = new MemoryBranchHistory();
  history.insert('main', 'existing', { title: 'base' });
  history.branch('feature', 'main');
  history.update('feature', 'existing', { title: 'feature' });
  history.insert('feature', 'ghost', { title: 'temporary' });
  history.delete('feature', 'ghost');
  history.update('main', 'existing', { title: 'main-edit' });

  const normal = await preview_merge(history.readers(), 'feature', 'main', { strategy: 'normal' });
  expect(normal.merged).toBe(3);
  expect(normal.entries).toEqual([
    expect.objectContaining({
      entityId: 'existing',
      operation: 'UPDATE',
      patch: { title: 'feature' },
      inversePatch: { title: 'main-edit' },
      conflict: { kind: 'overwrite', fields: ['title'] }
    })
  ]);
});

it('normal 保留既有的双方已删条目，不把非幽灵删除一起过滤', async () => {
  const history = new MemoryBranchHistory();
  history.insert('main', 'existing', { title: 'base' });
  history.branch('feature', 'main');
  history.delete('feature', 'existing');
  history.delete('main', 'existing');

  const normal = await preview_merge(history.readers(), 'feature', 'main', { strategy: 'normal' });
  expect(normal.entries).toEqual([
    expect.objectContaining({ entityId: 'existing', operation: 'DELETE', inversePatch: null, conflict: null })
  ]);
});

it('normal 预览应列出源幽灵操作实际删除的目标记录', async () => {
  const history = new MemoryBranchHistory();
  history.branch('feature', 'main');
  history.insert('feature', 'same-id', { title: 'temporary' });
  history.delete('feature', 'same-id');
  history.insert('main', 'same-id', { title: 'keep me' });
  const readers = history.readers();
  const target = history.stateOf('main');
  const adapter = {
    transaction: async (fun: (executor: TransactionExecutor) => Promise<unknown>) => {
      const executor = {
        mergeChanges: async (actions: SwitchVersionActions) => {
          for (const key of actions.deletes.keys()) target.delete(String(parseRxDBChangeKey(key)[2]));
          for (const [key, value] of actions.inserts)
            target.set(String(parseRxDBChangeKey(key)[2]), { ...value.patch });
        }
      } as unknown as TransactionExecutor;
      return fun(executor);
    }
  };
  const version = {
    getLocalRepositories: async () => ({ ...readers, adapter })
  } as unknown as VersionManager;

  const preview = await preview_merge(readers, 'feature', 'main', { strategy: 'normal' });
  const result = await merge_branch(version, 'feature', 'main', { strategy: 'normal' });
  expect(result.merged).toBe(2);
  expect(target.has('same-id')).toBe(false);
  expect(preview.entries).toEqual([
    expect.objectContaining({
      entityId: 'same-id',
      operation: 'DELETE',
      inversePatch: { title: 'keep me' },
      conflict: { kind: 'delete_edited', fields: ['title'] }
    })
  ]);
  const squash = await preview_merge(readers, 'feature', 'main', { strategy: 'squash' });
  expect(squash.entries).toEqual([]);
  expect(squash.merged).toBe(0);
});

it('normal 预览保留源分支删后重建再删除的终态，压缩策略照旧过滤', async () => {
  const history = new MemoryBranchHistory();
  history.insert('main', 'same-id', { title: 'base' });
  history.branch('feature', 'main');
  history.delete('feature', 'same-id');
  history.insert('feature', 'same-id', { title: 'temporary' });
  history.delete('feature', 'same-id');
  history.update('main', 'same-id', { title: 'main-edit' });

  const normal = await preview_merge(history.readers(), 'feature', 'main', { strategy: 'normal' });
  expect(normal.merged).toBe(3);
  expect(normal.entries).toEqual([
    expect.objectContaining({
      entityId: 'same-id',
      operation: 'DELETE',
      inversePatch: { title: 'main-edit' },
      conflict: { kind: 'delete_edited', fields: ['title'] }
    })
  ]);
  expect((await preview_merge(history.readers(), 'feature', 'main')).entries).toEqual([]);
});
