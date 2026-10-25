/**
 * @fileoverview 提交的分叉点（US-314 阶段 A）：提交时记下的位置与回滚状态、读回、核对撤销 / 重做有没有改过那段谱系。
 *
 * @remarks
 * 真实 SQL 下的整条从提交建分支由 `worktreeConformanceSuite` 在六个后端上验；这里用替身钉住谱系的分段与计数口径：
 * 分叉点那一段到分叉点为止，往上每一段到下一级分支的分叉点为止，分叉点之后的变更一条都不算。
 */

import type { EntityManager } from '@aiao/rxdb';
import { RxDB, RxDBBranch, RxDBChange, SyncType } from '@aiao/rxdb';
import { beforeEach, describe, expect, it } from 'vitest';
import { CommitForkPoint } from '../../commit/commit-fork-point.entity.js';
import {
  isForkPointLineageRewritten,
  readCommitForkPoint,
  recordCommitForkPoint
} from '../../commit/commit-fork-point.js';
import { rxDBPluginWorkingTree } from '../../plugin.js';
import { createMockAdapter } from '../fixtures/test-db-setup.js';
import { createCommitGraphProbe, type CommitGraphProbe } from './fixtures/commit-graph-probe.js';

function createEntityManager(): EntityManager {
  const database = new RxDB({
    dbName: `rxdb-commit-fork-point-${Math.random().toString(36).slice(2)}`,
    entities: [],
    sync: { local: { adapter: 'local' }, type: SyncType.None }
  });
  database.adapter('local', db => createMockAdapter(db));
  database.use(rxDBPluginWorkingTree);
  database.init();
  return database.entityManager;
}

let entityManager: EntityManager;
let probe: CommitGraphProbe;

const branchRow = (id: string, parentId: string | null, fromChangeId: number | null): RxDBBranch => {
  const branch = entityManager.instantiate(RxDBBranch);
  branch.id = id;
  branch.activated = id === 'main';
  branch.local = true;
  branch.remote = false;
  branch.parentId = parentId;
  branch.fromChangeId = fromChangeId;
  return branch;
};

/** 一条变更行；`revertChangeId` 显式写出来，替身的 `!=` 不把 `undefined` 当成 `null`。 */
const changeRow = (id: number, branchId: string, revertChangeId: number | null = null): RxDBChange => {
  const change = entityManager.instantiate(RxDBChange);
  change.id = id;
  change.branchId = branchId;
  change.type = 'UPDATE';
  change.revertChangeId = revertChangeId;
  return change;
};

const changeOf = (id: number): RxDBChange => {
  const change = (probe.rowsOf(RxDBChange) as RxDBChange[]).find(row => row.id === id);
  if (!change) throw new Error(`布景里没有变更 ${id}`);
  return change;
};

const recordedOf = (commitId: string): CommitForkPoint => {
  const row = (probe.saved as unknown[]).find(
    (entity): entity is CommitForkPoint => entity instanceof CommitForkPoint && entity.id === commitId
  );
  if (!row) throw new Error(`没记下提交 ${commitId} 的分叉点`);
  return row;
};

/**
 * main 上 1～3 与 6，feature 在 3 处分出去，自有 4、7、8。
 *
 * - main 的 2 已回滚（回滚号 20）、6 已回滚（21，晚于 feature 的分叉点）；
 * - feature 的 8 已回滚（24），于是它未回滚的最大自有变更是 7。
 */
const seedLineage = (): void => {
  probe.seed(RxDBBranch, [branchRow('main', null, null), branchRow('feature', 'main', 3)]);
  probe.seed(RxDBChange, [
    changeRow(1, 'main'),
    changeRow(2, 'main', 20),
    changeRow(3, 'main'),
    changeRow(4, 'feature'),
    changeRow(6, 'main', 21),
    changeRow(7, 'feature'),
    changeRow(8, 'feature', 24)
  ]);
};

beforeEach(() => {
  entityManager = createEntityManager();
  probe = createCommitGraphProbe();
});

describe('recordCommitForkPoint', () => {
  it('分叉点取这条分支未回滚的最大自有变更；回滚状态只数谱系上不晚于分叉点的那几段', async () => {
    seedLineage();

    await recordCommitForkPoint(probe.executor, entityManager, 'commit-1', 'feature');

    // feature 那一段到 7 为止（8 晚于分叉点），main 那一段到 feature 的分叉点 3 为止（6 不算）
    const recorded = recordedOf('commit-1');
    expect({
      branchId: recorded.branchId,
      changeId: recorded.changeId,
      revertedCount: recorded.revertedCount,
      maxRevertChangeId: recorded.maxRevertChangeId
    }).toEqual({ branchId: 'feature', changeId: 7, revertedCount: 1, maxRevertChangeId: 20 });
  });

  it('这条分支一条自有变更都没有：分叉点是 null，只数父分支那一段', async () => {
    probe.seed(RxDBBranch, [branchRow('main', null, null), branchRow('empty', 'main', 3)]);
    probe.seed(RxDBChange, [changeRow(1, 'main'), changeRow(2, 'main', 20), changeRow(3, 'main')]);

    await recordCommitForkPoint(probe.executor, entityManager, 'commit-1', 'empty');

    const recorded = recordedOf('commit-1');
    expect([recorded.changeId, recorded.revertedCount, recorded.maxRevertChangeId]).toEqual([null, 1, 20]);
  });

  it('根分支上一条变更都没有：没有要数的段，不发计数', async () => {
    probe.seed(RxDBBranch, [branchRow('main', null, null)]);

    await recordCommitForkPoint(probe.executor, entityManager, 'commit-1', 'main');

    const recorded = recordedOf('commit-1');
    expect([recorded.changeId, recorded.revertedCount, recorded.maxRevertChangeId]).toEqual([null, 0, null]);
    expect(probe.trace).not.toContain('count:RxDBChange');
  });

  it('谱系有变更但没有回滚：记下零状态，不再查询最大回滚号', async () => {
    probe.seed(RxDBBranch, [branchRow('main', null, null)]);
    probe.seed(RxDBChange, [changeRow(1, 'main'), changeRow(2, 'main')]);

    await recordCommitForkPoint(probe.executor, entityManager, 'commit-1', 'main');

    const recorded = recordedOf('commit-1');
    expect([recorded.changeId, recorded.revertedCount, recorded.maxRevertChangeId]).toEqual([2, 0, null]);
    expect(probe.trace.filter(call => call === 'find:RxDBChange')).toHaveLength(1);
    expect(probe.trace.filter(call => call === 'count:RxDBChange')).toHaveLength(1);
  });

  it('分叉点所在的分支不在库里：抛错，不记', async () => {
    probe.seed(RxDBBranch, [branchRow('main', null, null)]);

    await expect(recordCommitForkPoint(probe.executor, entityManager, 'commit-1', 'ghost')).rejects.toThrow('ghost');
    expect(probe.saved).toEqual([]);
  });
});

describe('readCommitForkPoint', () => {
  it('读回记下的那一行；没记过的提交是 undefined', async () => {
    seedLineage();
    await recordCommitForkPoint(probe.executor, entityManager, 'commit-1', 'feature');

    await expect(readCommitForkPoint(probe.executor, 'commit-1')).resolves.toBe(recordedOf('commit-1'));
    await expect(readCommitForkPoint(probe.executor, 'commit-2')).resolves.toBeUndefined();
  });
});

describe('isForkPointLineageRewritten', () => {
  const recordFeature = async (): Promise<CommitForkPoint> => {
    seedLineage();
    await recordCommitForkPoint(probe.executor, entityManager, 'commit-1', 'feature');
    return recordedOf('commit-1');
  };

  it('之后什么都没动：没改过', async () => {
    const forkPoint = await recordFeature();

    await expect(isForkPointLineageRewritten(probe.executor, forkPoint)).resolves.toBe(false);
  });

  it('零回滚的谱系核对时只计数；之后发生回滚仍能识别改写', async () => {
    probe.seed(RxDBBranch, [branchRow('main', null, null)]);
    probe.seed(RxDBChange, [changeRow(1, 'main'), changeRow(2, 'main')]);
    await recordCommitForkPoint(probe.executor, entityManager, 'commit-1', 'main');
    const forkPoint = recordedOf('commit-1');
    probe.trace.length = 0;

    await expect(isForkPointLineageRewritten(probe.executor, forkPoint)).resolves.toBe(false);
    expect(probe.trace).toContain('count:RxDBChange');
    expect(probe.trace).not.toContain('find:RxDBChange');

    changeOf(1).revertChangeId = 25;
    await expect(isForkPointLineageRewritten(probe.executor, forkPoint)).resolves.toBe(true);
    expect(probe.trace).toContain('find:RxDBChange');
  });

  it('之后的撤销把那段谱系里的一条变更标成回滚：改过（最大回滚号变大）', async () => {
    const forkPoint = await recordFeature();
    changeOf(4).revertChangeId = 25;

    await expect(isForkPointLineageRewritten(probe.executor, forkPoint)).resolves.toBe(true);
  });

  it('之后的重做把父分支那一段的一条回滚清空：改过（条数变少）', async () => {
    const forkPoint = await recordFeature();
    changeOf(2).revertChangeId = null;

    await expect(isForkPointLineageRewritten(probe.executor, forkPoint)).resolves.toBe(true);
  });

  it('只动了分叉点之后的变更：没改过', async () => {
    const forkPoint = await recordFeature();
    // feature 的 8 被重做、main 的 6 被重做：两条都晚于各自那一段的分叉点
    changeOf(8).revertChangeId = null;
    changeOf(6).revertChangeId = null;

    await expect(isForkPointLineageRewritten(probe.executor, forkPoint)).resolves.toBe(false);
  });
});
