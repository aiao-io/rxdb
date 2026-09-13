/**
 * @fileoverview T026 红测试：显式启用时的一次性初始化迁移（FR-021/049）。
 *
 * @remarks
 * 契约见 `spec.md` FR-021 / FR-049 与 `research.md` R11。实现目标是
 * `src/commit/enable-migration.ts`（T039）。
 *
 * 注意它**不是** `system/migrations/0004-working-tree-commits.ts`：那条建表迁移在
 * `enabled = false` 下就已经跑完（data-model.md §8），本文件说的是 `enable()` 之后
 * 为每个分支补根节点的那一次。两者同名叫「迁移」，做的事完全不同。
 *
 * 为什么这五组断言值得写：
 *
 * 1. **「为每个分支」会被写成「为激活分支」**。单分支库上两种写法行为完全一致，
 *    要到用户切到第二个分支才炸——那时 ref 的 `headCommitId` 还是 `null`，而库已经
 *    `enabled = true`，`commit()` 会往一个没有根的分支上挂节点。
 * 2. **metadata-only 远端分支会被一并补 baseline**。FR-049 说它此时**不**创建 baseline 或 ref，
 *    因为本地根本没有它的完整状态；提前伪造一个空 HEAD，等于宣称「这个远端分支在本地是空的」，
 *    而它真正的首次物化（US-308）会发现自己已经有根了，只能覆盖或放弃。
 *    「没有 ref」与「ref 的 HEAD 为空」必须可区分。
 * 3. **失败会留下部分状态**。FR-049 要求任一本地分支不可物化就整体失败。逐分支提交的写法在
 *    第三个分支上炸掉时，前两个的 baseline 已经落库且 ref 已推进——重试时它们会被当成
 *    「已初始化」跳过，于是库永久停在半启用：一部分分支有根，一部分没有，且没有任何报错。
 * 4. **可物化判定会被另写一套**。R11 明确禁止第二套重放引擎，理由是迁移期与运行期会对
 *    「同一条链能不能走通」给出不同答案。钉死的形式是：分支父链成环时迁移必须失败，
 *    而成环判定只有既有 `find_switch_branch_step` 会做。
 * 5. **旧数据会被顺手清理**。FR-021 要求保留旧 change 记录、保持激活分支与业务实体状态。
 *    「既然有了 commit 历史，旧 change 就是冗余」是很自然的念头，但 undo/redo 与
 *    `restoreEntity` 仍然靠它（FR-018/019），删掉等于把既有能力换成新能力。
 */

import { describe, expect, it } from 'vitest';
import { CommitBranchRef } from '../../commit/commit-branch-ref.entity.js';
import { CommitChangeSet } from '../../commit/commit-change-set.entity.js';
import { CommitErrorCode } from '../../commit/commit-error-codes.js';
import { Commit } from '../../commit/commit.entity.js';
import { BranchNotMaterializableError, runEnableMigration } from '../../commit/enable-migration.js';
import { SYSTEM_COMMIT_MESSAGES } from '../../commit/write-commit.js';
import type { EntityManager } from '../../entity/entity-manager.js';
import { SyncType } from '../../entity/metadata-options.interface.js';
import { getEntityMetadata } from '../../rxdb-utils.js';
import { RxDB } from '../../RxDB.js';
import { RxDBBranch } from '../../system/branch.js';
import { RxDBChange } from '../../system/change.js';
import { SYSTEM_ENTITIES } from '../../system/system-entities.js';
import { createMockAdapter } from '../fixtures/test-db-setup.js';
import { createCommitGraphProbe, normalizeSql } from './fixtures/commit-graph-probe.js';

const MIGRATION_OPERATION_ID = '00000000-0000-4000-8000-0000000000cc';
const REF_TABLE = getEntityMetadata(CommitBranchRef).tableName;
const SYSTEM_ENTITY_NAMES = new Set<string>(SYSTEM_ENTITIES.map(EntityClass => getEntityMetadata(EntityClass).name));

function createEntityManager(): EntityManager {
  const database = new RxDB({
    dbName: `rxdb-enable-migration-${Math.random().toString(36).slice(2)}`,
    entities: [],
    sync: { local: { adapter: 'local' }, type: SyncType.None }
  });
  database.adapter('local', db => createMockAdapter(db));
  database.init();
  return database.entityManager;
}

interface BranchSpec {
  readonly id: string;
  readonly activated?: boolean;
  readonly local?: boolean;
  readonly remote?: boolean;
  readonly parentId?: string | null;
  readonly fromChangeId?: number | null;
}

interface Scene {
  readonly probe: ReturnType<typeof createCommitGraphProbe>;
  readonly entityManager: EntityManager;
  readonly branches: RxDBBranch[];
  readonly changes: RxDBChange[];
  refOf(branchId: string): CommitBranchRef;
}

/**
 * 造一个「建表迁移已经跑完」的库：每个分支都有一行空 ref，但都还没有根节点。
 *
 * @param branchSpecs - 分支清单，顺序即 generation 发放顺序
 * @param changeIds - `rxdb_change` 里现存的变更 id
 */
function createScene(branchSpecs: readonly BranchSpec[], changeIds: readonly number[] = []): Scene {
  const entityManager = createEntityManager();
  const probe = createCommitGraphProbe({ rowsAffected: 1 });

  const branches = branchSpecs.map(spec => {
    const branch = entityManager.instantiate(RxDBBranch);
    branch.id = spec.id;
    branch.activated = spec.activated ?? false;
    branch.local = spec.local ?? true;
    branch.remote = spec.remote ?? false;
    branch.parentId = spec.parentId ?? null;
    branch.fromChangeId = spec.fromChangeId ?? null;
    return branch;
  });
  probe.seed(RxDBBranch, branches);

  const changes = changeIds.map(id => {
    const change = entityManager.instantiate(RxDBChange);
    change.id = id;
    change.branchId = branchSpecs[0].id;
    change.type = 'UPDATE';
    return change;
  });
  probe.seed(RxDBChange, changes);

  const refs = branches.map((branch, index) => {
    const ref = entityManager.instantiate(CommitBranchRef);
    ref.id = branch.id;
    ref.branchId = branch.id;
    ref.generation = index + 1;
    ref.headCommitId = null;
    ref.headRevision = 0;
    ref.status = 'ok';
    ref.corruptedAt = null;
    return ref;
  });
  probe.seed(CommitBranchRef, refs);

  return {
    probe,
    entityManager,
    branches,
    changes,
    refOf(branchId) {
      const ref = refs.find(candidate => candidate.id === branchId);
      if (!ref) throw new Error(`no seeded ref for '${branchId}'`);
      return ref;
    }
  };
}

const run = (scene: Scene) =>
  runEnableMigration(scene.probe.executor, scene.entityManager, { operationId: MIGRATION_OPERATION_ID });

describe('为每个本地可完整物化分支生成 baseline（FR-021）', () => {
  it('三个本地分支各得一个根节点，一个都不少', async () => {
    const scene = createScene([{ id: 'main', activated: true }, { id: 'feature-1' }, { id: 'feature-2' }]);

    const result = await run(scene);

    // 只给激活分支建根：单分支库上完全看不出来，要到用户切到第二个分支才炸。
    expect([...result.baselineCommitIds.keys()].sort()).toEqual(['feature-1', 'feature-2', 'main']);
    expect(scene.probe.rowsOf(Commit)).toHaveLength(3);
  });

  it('根节点是 kind=baseline 的空系统节点', async () => {
    const scene = createScene([{ id: 'main', activated: true }]);

    await run(scene);

    const [baseline] = scene.probe.rowsOf(Commit) as Commit[];
    expect({
      kind: baseline.kind,
      author: baseline.author,
      message: baseline.message,
      parentIds: baseline.parentIds,
      firstParentId: baseline.firstParentId,
      changeSetCount: baseline.changeSetCount
    }).toEqual({
      kind: 'baseline',
      author: null,
      message: SYSTEM_COMMIT_MESSAGES.baseline,
      parentIds: [],
      firstParentId: null,
      changeSetCount: 0
    });
    expect(scene.probe.rowsOf(CommitChangeSet)).toEqual([]);
  });

  it('推进 HEAD 走的是同一条 CAS，不另开写 HEAD 的第二条路', async () => {
    const scene = createScene([{ id: 'main', activated: true }, { id: 'feature-1' }]);

    await run(scene);

    // 每个被初始化的分支恰好一条 ref 更新语句。另写一条「迁移专用」的 UPDATE 意味着
    // CAS 条件（generation / status）会在这条路上被悄悄放宽。
    expect(scene.probe.statements).toHaveLength(2);
    for (const sql of scene.probe.statements) {
      expect(normalizeSql(sql)).toMatch(new RegExp(`^update\\b[^]*\\b${REF_TABLE}\\b`));
    }
  });

  it('只读系统表——业务实体一个都不碰', async () => {
    const scene = createScene([{ id: 'main', activated: true }]);

    await run(scene);

    // Workspace 草稿在插件自己的 IndexedDB 里，本来就够不到；这条断言守的是更大的面：
    // 迁移不枚举任何接入方实体，因此没有任何业务数据能被读进 baseline。
    const touched = [...new Set(scene.probe.finds.map(call => call.entity))];
    expect(touched.filter(name => !SYSTEM_ENTITY_NAMES.has(name))).toEqual([]);
  });
});

describe('metadata-only 远端分支不建 baseline / ref（FR-049）', () => {
  it('跳过它，且不因此判失败', async () => {
    const scene = createScene([
      { id: 'main', activated: true },
      { id: 'origin/feature', local: false, remote: true }
    ]);

    const result = await run(scene);

    expect([...result.baselineCommitIds.keys()]).toEqual(['main']);
    expect(result.skippedBranchIds).toEqual(['origin/feature']);
  });

  it('它的 ref 一格都不动——「没有 ref」与「ref 的 HEAD 为空」必须可区分', async () => {
    const scene = createScene([
      { id: 'main', activated: true },
      { id: 'origin/feature', local: false, remote: true }
    ]);

    await run(scene);

    const ref = scene.refOf('origin/feature');
    expect({ headCommitId: ref.headCommitId, headRevision: ref.headRevision }).toEqual({
      headCommitId: null,
      headRevision: 0
    });
    // 提前伪造根节点，等于宣称「这个远端分支在本地是空的」；US-308 的首次物化
    // 会发现自己已经有根，只能覆盖或放弃。
    expect(scene.probe.statements).toHaveLength(1);
  });
});

describe('保留既有状态（FR-021）', () => {
  it('旧 change 记录一行不删、一行不改', async () => {
    const scene = createScene([{ id: 'main', activated: true }], [1, 2, 3]);
    const before = scene.changes.map(change => ({ id: change.id, type: change.type }));

    await run(scene);

    // undo/redo 与 restoreEntity 仍然靠它（FR-018/019）；删掉等于把既有能力换成新能力。
    const after = (scene.probe.rowsOf(RxDBChange) as RxDBChange[]).map(change => ({
      id: change.id,
      type: change.type
    }));
    expect(after).toEqual(before);
  });

  it('激活分支不变', async () => {
    const scene = createScene([{ id: 'main' }, { id: 'feature-1', activated: true }]);

    await run(scene);

    expect(scene.branches.filter(branch => branch.activated).map(branch => branch.id)).toEqual(['feature-1']);
  });
});

describe('全有或全无，且失败可重试（FR-049）', () => {
  it('某个本地分支的分叉点 change 已被清理时整体失败', async () => {
    const scene = createScene(
      [
        { id: 'main', activated: true },
        { id: 'feature-1', fromChangeId: 7 }
      ],
      [1, 2]
    );

    await expect(run(scene)).rejects.toBeInstanceOf(BranchNotMaterializableError);
  });

  it('失败时一个 baseline 都没落库，ref 也一格没动', async () => {
    const scene = createScene(
      [
        { id: 'main', activated: true },
        { id: 'feature-1', fromChangeId: 7 }
      ],
      [1, 2]
    );

    await run(scene).catch(() => undefined);

    // 逐分支提交的写法会在这里留下 main 的 baseline：重试时它被当成「已初始化」跳过，
    // 库永久停在半启用，且没有任何报错。
    expect(scene.probe.rowsOf(Commit)).toEqual([]);
    expect(scene.probe.statements).toEqual([]);
    expect(scene.refOf('main').headCommitId).toBeNull();
  });

  it('错误带 branch_not_materializable 码与出问题的分支 id', async () => {
    const scene = createScene(
      [
        { id: 'main', activated: true },
        { id: 'feature-1', fromChangeId: 7 }
      ],
      [1, 2]
    );

    await expect(run(scene)).rejects.toMatchObject({
      code: CommitErrorCode.branch_not_materializable,
      branchId: 'feature-1'
    });
  });

  it('分支父链成环时同样失败——可物化判定不另写一套', async () => {
    const scene = createScene([
      { id: 'main', activated: true },
      { id: 'a', parentId: 'b' },
      { id: 'b', parentId: 'a' }
    ]);

    // 成环判定只有既有 `find_switch_branch_step` 会做（research.md R11）。
    // 自己写一套简化遍历的实现会在这里安静地通过。
    await expect(run(scene)).rejects.toBeInstanceOf(BranchNotMaterializableError);
  });

  it('补回缺失的 change 后重跑即成功', async () => {
    const broken = createScene(
      [
        { id: 'main', activated: true },
        { id: 'feature-1', fromChangeId: 7 }
      ],
      [1, 2]
    );
    await run(broken).catch(() => undefined);

    const repaired = createScene(
      [
        { id: 'main', activated: true },
        { id: 'feature-1', fromChangeId: 7 }
      ],
      [1, 2, 7]
    );
    const result = await run(repaired);

    expect([...result.baselineCommitIds.keys()].sort()).toEqual(['feature-1', 'main']);
  });

  it('已经有根的分支不会被造出第二个根', async () => {
    const scene = createScene([{ id: 'main', activated: true }, { id: 'feature-1' }]);
    await run(scene);
    scene.probe.statements.length = 0;

    const again = await run(scene);

    // 重复 `enable()` 是幂等的（FR-037）；这里守的是它下游那次初始化也幂等。
    expect(again.baselineCommitIds.size).toBe(0);
    expect(scene.probe.rowsOf(Commit)).toHaveLength(2);
    expect(scene.probe.statements).toEqual([]);
  });
});
