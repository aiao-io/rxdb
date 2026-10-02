/**
 * @fileoverview 从回放恢复到 commit（`specs/005-us-909-session-replay/research.md` D8、contracts/replay-plugin.md §6）。
 *
 * @remarks
 * 凭据必须在点下恢复的那一刻现取：回放里的标记是过去的事，拿录制时的 HEAD 去 CAS 只会稳定地撞 `conflict`。
 * 这里用假门面钉住「先 `status()` 再 `restore()`、凭据逐字段来自那次 `status()`」，真工作树的端到端在 e2e 里。
 */

import type { RxDB } from '@aiao/rxdb';
import type { WorkingTreeRestoreResult, WorkingTreeStatus } from '@aiao/rxdb-plugin-working-tree';
import { describe, expect, it, vi } from 'vitest';
import { replayRestoreHint, restoreToCommit } from '../restore.js';

const STATUS = {
  branchId: 'main',
  activationRevision: 2,
  headRevision: 7,
  workingTreeRevision: 11
} as unknown as WorkingTreeStatus;

/** 只带 `getPlugins` 与 `workingTree.status / restore` 的假库。 */
const fakeDb = (options: { installed: boolean; restore?: () => Promise<WorkingTreeRestoreResult> }) => {
  const calls: string[] = [];
  const status = vi.fn(async () => {
    calls.push('status');
    return STATUS;
  });
  const restore = vi.fn(async () => {
    calls.push('restore');
    return (options.restore ?? (async () => ({ ok: true, restoredCount: 1 }) as WorkingTreeRestoreResult))();
  });
  const db = {
    getPlugins: (name: string) => (name === 'workingTree' && options.installed ? [{}] : []),
    workingTree: { status, restore }
  } as unknown as RxDB;
  return { db, calls, status, restore };
};

describe('restoreToCommit', () => {
  it('先取 status()，再用它的四个凭据字段调 restore({ commitId })', async () => {
    const { db, calls, restore } = fakeDb({ installed: true });

    await restoreToCommit(db, 'c1');

    expect(calls).toEqual(['status', 'restore']);
    expect(restore).toHaveBeenCalledWith(
      { commitId: 'c1' },
      {
        expectedBranch: { branchId: 'main', activationRevision: 2 },
        expectedHeadRevision: 7,
        expectedWorkingTreeRevision: 11
      }
    );
  });

  it('结果原样透传（ok: true 与 ok: false 都是）', async () => {
    const rejected = { ok: false, reason: 'dirty_working_tree' } as WorkingTreeRestoreResult;
    const { db } = fakeDb({ installed: true, restore: async () => rejected });

    await expect(restoreToCommit(db, 'c1')).resolves.toBe(rejected);
  });

  it('没装工作树插件 → working_tree_unavailable，且不碰门面', async () => {
    const { db, status } = fakeDb({ installed: false });

    await expect(restoreToCommit(db, 'c1')).rejects.toThrow(
      expect.objectContaining({
        name: 'RxDBReplayError',
        code: 'working_tree_unavailable',
        // 前缀由 RxDBReplayError 自己加，不能叠两层
        message: expect.stringMatching(/^\[rxdb-plugin-replay\] (?!\[rxdb-plugin-replay\])/)
      })
    );
    expect(status).not.toHaveBeenCalled();
  });

  it('门面抛的错误（如未启用）原样透传', async () => {
    const disabled = new Error('working tree capability is disabled');
    const { db, status } = fakeDb({ installed: true });
    status.mockRejectedValueOnce(disabled);

    await expect(restoreToCommit(db, 'c1')).rejects.toBe(disabled);
  });
});

describe('replayRestoreHint（research D8 表逐字）', () => {
  it.each([
    ['conflict', 'The working tree changed while restoring. Try again.'],
    ['dirty_working_tree', 'There are uncommitted changes. Commit or discard them before restoring.'],
    ['incompatible_schema', 'This commit was written by an incompatible schema version and cannot be restored.'],
    ['unreachable_target', 'This commit is not on the current branch history.']
  ] as const)('%s', (reason, hint) => {
    expect(replayRestoreHint(reason)).toBe(hint);
  });
});
