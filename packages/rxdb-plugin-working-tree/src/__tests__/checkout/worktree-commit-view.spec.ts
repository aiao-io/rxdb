/**
 * @fileoverview 提交视图（US-313 阶段 B）：打不打得开的判定，与往回推的增量。
 *
 * @remarks
 * 可达性、损坏与恢复会话的判定换成替身，只验本模块的编排与拒绝原因；往回推的增量用真实的解码与折叠，
 * 钉死「先撤工作树条目、再从 HEAD 往回逐个撤提交」的次序。真后端上的逐行一致由 `worktreeConformanceSuite` 验。
 */

import type { EntityType, TransactionExecutor } from '@aiao/rxdb';
import { parseRxDBChangeKey } from '@aiao/rxdb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { commitViewActions, planCommitView } from '../../checkout/worktree-commit-view.js';
import { WorktreeUnavailableError } from '../../checkout/worktree-errors.js';
import { CommitChangeSet } from '../../commit/commit-change-set.entity.js';
import { assertCommitGraphIntact } from '../../commit/commit-graph-guard.js';
import { readCommitBranchRef } from '../../commit/list-commits.js';
import { readActiveBranchToken } from '../../working-tree/capture-runtime.js';
import { readActiveRestoreSession } from '../../working-tree/restore-command.js';
import { findFirstReplayIncompatibility, selectRestoreReplayPath } from '../../working-tree/restore-precheck.js';
import { WorkingTreeEntry } from '../../working-tree/working-tree-entry.entity.js';
import type { WorkingTreePatchCodecContext } from '../../working-tree/working-tree-patch-codec.js';

vi.mock('../../working-tree/capture-runtime.js', async importOriginal => ({
  ...(await importOriginal<typeof import('../../working-tree/capture-runtime.js')>()),
  readActiveBranchToken: vi.fn()
}));
vi.mock('../../commit/commit-graph-guard.js', async importOriginal => ({
  ...(await importOriginal<typeof import('../../commit/commit-graph-guard.js')>()),
  assertCommitGraphIntact: vi.fn()
}));
vi.mock('../../working-tree/restore-command.js', async importOriginal => ({
  ...(await importOriginal<typeof import('../../working-tree/restore-command.js')>()),
  readActiveRestoreSession: vi.fn()
}));
vi.mock('../../commit/list-commits.js', async importOriginal => ({
  ...(await importOriginal<typeof import('../../commit/list-commits.js')>()),
  readCommitBranchRef: vi.fn()
}));
vi.mock('../../working-tree/restore-precheck.js', async importOriginal => ({
  ...(await importOriginal<typeof import('../../working-tree/restore-precheck.js')>()),
  selectRestoreReplayPath: vi.fn(),
  findFirstReplayIncompatibility: vi.fn()
}));

/** 认不出任何实体：补丁按原样解码（浅拷贝），折叠只看身份与操作。 */
const codec = { resolveTargetMetadata: () => undefined } as unknown as WorkingTreePatchCodecContext;

const executorWith = (changeSets: readonly Partial<CommitChangeSet>[], entries: readonly Partial<WorkingTreeEntry>[]) =>
  ({
    getRepository: (EntityClass: EntityType) => ({
      find: async (options: { where: { rules: { field: string; value: unknown }[] } }) => {
        const [rule] = options.where.rules;
        const rows: readonly Record<string, unknown>[] = EntityClass === CommitChangeSet ? changeSets : entries;
        return rows.filter(row => row[rule.field] === rule.value);
      }
    })
  }) as unknown as TransactionExecutor;

const reasonOf = async (promise: Promise<unknown>): Promise<string> => {
  const error = await promise.then(
    () => undefined,
    (thrown: unknown) => thrown
  );
  expect(error).toBeInstanceOf(WorktreeUnavailableError);
  return (error as WorktreeUnavailableError).reason;
};

beforeEach(() => {
  vi.mocked(readActiveBranchToken).mockResolvedValue({ branchId: 'main', activationRevision: 1 });
  vi.mocked(assertCommitGraphIntact).mockResolvedValue(undefined);
  vi.mocked(readActiveRestoreSession).mockResolvedValue(null);
  vi.mocked(readCommitBranchRef).mockResolvedValue({ headCommitId: 'c3' } as never);
  vi.mocked(selectRestoreReplayPath).mockResolvedValue(['c3', 'c2']);
  vi.mocked(findFirstReplayIncompatibility).mockResolvedValue(undefined);
});

afterEach(() => vi.clearAllMocks());

describe('planCommitView', () => {
  it('可达且兼容：交回 active 分支与要往回推的路', async () => {
    await expect(planCommitView(executorWith([], []), codec, 'c1')).resolves.toEqual({
      branchId: 'main',
      path: ['c3', 'c2']
    });
    expect(selectRestoreReplayPath).toHaveBeenCalledWith(expect.anything(), 'c3', 'c1');
    expect(assertCommitGraphIntact).toHaveBeenCalledWith(expect.anything(), 'main');
  });

  it('有进行中的恢复：restoring_working_tree，不再往下判', async () => {
    vi.mocked(readActiveRestoreSession).mockResolvedValue({ sessionId: 's' } as never);
    expect(await reasonOf(planCommitView(executorWith([], []), codec, 'c1'))).toBe('restoring_working_tree');
    expect(selectRestoreReplayPath).not.toHaveBeenCalled();
  });

  it('不在 HEAD 的可达父链上：unreachable_target', async () => {
    vi.mocked(selectRestoreReplayPath).mockResolvedValue(undefined);
    expect(await reasonOf(planCommitView(executorWith([], []), codec, 'elsewhere'))).toBe('unreachable_target');
  });

  it('路径上有认不出的实体：incompatible_schema', async () => {
    vi.mocked(findFirstReplayIncompatibility).mockResolvedValue({
      commitId: 'c2',
      direction: 'reverse',
      namespace: 'app',
      entity: 'Gone',
      manifest: { codecVersion: 1, entityResolved: false }
    });
    expect(await reasonOf(planCommitView(executorWith([], []), codec, 'c1'))).toBe('incompatible_schema');
  });
});

describe('commitViewActions', () => {
  it('先撤工作树条目，再从 HEAD 往回逐个撤提交；同一行取最早的旧值', async () => {
    const unit = (commitId: string, sequence: number, fields: Partial<CommitChangeSet>): Partial<CommitChangeSet> => ({
      commitId,
      sequence,
      unitId: `${commitId}-${sequence}`,
      transactionId: null,
      namespace: 'app',
      entity: 'Note',
      ...fields
    });
    const changeSets = [
      // 路径上较老的提交：x 的标题 a → b，新建 y
      unit('c2', 2, { entityId: 'y', operation: 'insert', patch: { id: 'y', title: 'y' }, inversePatch: null }),
      unit('c2', 1, { entityId: 'x', operation: 'update', patch: { title: 'b' }, inversePatch: { title: 'a' } }),
      // HEAD：删掉 z
      unit('c3', 1, { entityId: 'z', operation: 'delete', patch: null, inversePatch: { id: 'z', title: 'z' } })
    ];
    const entries: Partial<WorkingTreeEntry>[] = [
      // 未提交：x 的标题 b → c
      {
        branchId: 'main',
        namespace: 'app',
        entity: 'Note',
        entityId: 'x',
        operation: 'update',
        patch: { title: 'c' },
        inversePatch: { title: 'b' }
      }
    ];

    const actions = await commitViewActions(executorWith(changeSets, entries), codec, {
      branchId: 'main',
      path: ['c3', 'c2']
    });

    const keyOf = (map: ReadonlyMap<string, unknown>) => [...map.keys()].map(key => parseRxDBChangeKey(key)[2]);
    expect(keyOf(actions.deletes)).toEqual(['y']);
    expect(keyOf(actions.inserts)).toEqual(['z']);
    expect([...actions.inserts.values()][0]?.patch).toEqual({ id: 'z', title: 'z' });
    expect(keyOf(actions.updates)).toEqual(['x']);
    expect([...actions.updates.values()][0]?.patch).toEqual({ title: 'a' });
  });
});
