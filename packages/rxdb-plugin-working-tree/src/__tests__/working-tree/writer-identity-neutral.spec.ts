/**
 * @fileoverview T074 红测试：工作树中的实体编辑**不按 writer 身份分叉**（FR-032、
 * spec.md 场景 22）。
 *
 * @remarks
 * 「按 writer 分叉」不会作为一个设计被提出来，它是从一个听起来很合理的小改动里长出来的：
 * 为了排查问题，给 `WorkingTreeEntry` 加一列 `writerId`。加完之后，唯一索引迟早要跟上
 * ——否则两个 Tab 编辑同一实体会撞唯一约束——而一旦 `writerId` 进了那条索引，同一个实体
 * 就有了两条未提交变更。于是 commit 必须决定提交谁的那条，`status()` 必须决定显示谁的
 * 那条，紧接着就需要一套「谁赢」的规则。FR-032 是在这条路的入口上立的牌子：
 * **并发保护只由 FR-031 的 revision CAS 提供**，不由身份提供。
 *
 * 所以这里钉三层：
 *
 * 1. **没有那一维**：唯一索引与字段集里都没有 writer 位，分叉在结构上无处落脚。
 * 2. **折叠不分身份**：两个 realm 先后写同一实体，折成**一条**，不是两条。
 * 3. **提交不看身份**：`CommitOptions.authorId` 是 commit 的元数据，不是选择器，
 *    也不参与 CAS——换个 authorId 不会让提交成功率变高或变低。
 *
 * 与 {@link file://./crud-not-captured-cas.spec.ts} 是同一条 FR 的两半：那边钉「并发不
 * 因 revision 失败」，这边钉「并发不因身份分叉」。
 */

import { getEntityMetadata } from '@aiao/rxdb';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { CommitChangeSet } from '../../commit/commit-change-set.entity.js';
import { Commit } from '../../commit/commit.entity.js';
import { commitWorkingTree, type CommitOptions, type CommitResult } from '../../working-tree/commit-command.js';
import { WorkingTreeEntry } from '../../working-tree/working-tree-entry.entity.js';
import {
  foldWorkingTreeEntry,
  type CapturedWrite,
  type FoldOutcome,
  type WorkingTreeEntryRow
} from '../../working-tree/write-entry.js';
import {
  createWorkingTreeScene,
  entryRowsOf,
  refRowOf,
  SCENE_BRANCH_ID,
  stateRowOf,
  type WorkingTreeScene
} from './fixtures/working-tree-scene.js';

/** 一组对得上场景初值的捕获型凭据。 */
const credentialsOf = (scene: WorkingTreeScene, overrides: Partial<CommitOptions> = {}): CommitOptions => ({
  authorId: 'alice',
  operationId: 'op-1',
  expectedBranch: { branchId: SCENE_BRANCH_ID, activationRevision: 0 },
  expectedHeadRevision: refRowOf(scene).headRevision,
  expectedWorkingTreeRevision: stateRowOf(scene).workingTreeRevision,
  ...overrides
});

/** 跑一次提交。 */
const commitOnce = (
  scene: WorkingTreeScene,
  message: string,
  overrides: Partial<CommitOptions> = {}
): Promise<CommitResult> =>
  commitWorkingTree(scene.probe.executor, scene.database.entityManager, message, credentialsOf(scene, overrides));

/** 取成功出口，拿到别的就直接炸。 */
const expectOk = (result: CommitResult): Extract<CommitResult, { ok: true }> => {
  if (!result.ok) throw new Error(`期望这次提交成功，实际拿到冲突：${JSON.stringify(result.conflict)}`);
  return result;
};

/** 同一个实体的两次写，只有来源与内容不同——模拟两个 realm 先后编辑。 */
const writeTo = (entityId: string, overrides: Partial<CapturedWrite> = {}): CapturedWrite => ({
  namespace: 'app',
  entity: 'Note',
  entityId,
  operation: 'update',
  patch: { title: '甲改的' },
  inversePatch: { title: '原值' },
  fingerprint: 'fingerprint-note',
  origin: 'local',
  unitId: `unit-${entityId}`,
  transactionId: null,
  sourceChangeId: null,
  ...overrides
});

describe('工作树里根本没有 writer 这一维（FR-032）', () => {
  it('唯一索引是 (branchId, namespace, entity, entityId) 四列，没有第五列', () => {
    const identity = getEntityMetadata(WorkingTreeEntry).indexes.find(
      index => index.name === 'idx_working_tree_entry_identity'
    );

    expect(identity?.unique).toBe(true);
    // 这条索引就是「一个实体在一条分支上只有一份未提交变更」的物理保证。
    // 多一列 writer，同一实体立刻可以有 N 份，分叉就从这里开始。
    expect(identity?.properties).toEqual(['branchId', 'namespace', 'entity', 'entityId']);
  });

  it('CapturedWrite 的键集里没有身份位', () => {
    // 键集而不是点名：点名只挡得住 writerId / authorId / realmId / clientId 这几个
    // 想得到的名字，挡不住下一个人起的第五个名字。
    expectTypeOf<keyof CapturedWrite>().toEqualTypeOf<
      | 'namespace'
      | 'entity'
      | 'entityId'
      | 'operation'
      | 'patch'
      | 'inversePatch'
      | 'fingerprint'
      | 'origin'
      | 'unitId'
      | 'transactionId'
      | 'sourceChangeId'
    >();
  });

  it('落库行的键集同样没有——不能靠「先加列再进索引」绕进来', () => {
    expectTypeOf<keyof WorkingTreeEntryRow>().toEqualTypeOf<
      | 'namespace'
      | 'entity'
      | 'entityId'
      | 'operation'
      | 'patch'
      | 'inversePatch'
      | 'fingerprint'
      | 'origin'
      | 'unitId'
      | 'transactionId'
      | 'sourceChangeId'
    >();
  });

  it('origin 只认「本地编辑还是远端同步」，不认「哪个 writer」', () => {
    // `origin` 是这张表上唯一带来源意味的列，所以它最容易被扩成身份位。
    // 它的取值是封闭的二元，且两个值都不是身份——remote_sync 说的是**通道**，
    // 不是「某某人」（硬裁决 6：远端同步照样弄脏工作树）。
    expectTypeOf<CapturedWrite['origin']>().toEqualTypeOf<'local' | 'remote_sync'>();
  });
});

describe('两个 realm 编辑同一实体，折成同一份未提交变更（场景 22）', () => {
  const firstRow: WorkingTreeEntryRow = {
    namespace: 'app',
    entity: 'Note',
    entityId: 'note-1',
    operation: 'update',
    patch: { title: '甲改的' },
    inversePatch: { title: '原值' },
    fingerprint: 'fingerprint-note',
    origin: 'local',
    unitId: 'unit-note-1',
    transactionId: null,
    sourceChangeId: null
  };

  /** 取折叠后仍留在工作树里的那一行；折成 `remove` 时直接炸，免得断言在 `undefined` 上继续。 */
  const foldedRowOf = (outcome: FoldOutcome): WorkingTreeEntryRow => {
    if (outcome.kind === 'remove') throw new Error('期望折叠后仍留下一行，实际折成了 remove');
    return outcome.entry;
  };

  it('第二个 realm 的写落在同一条上：是 update，不是第二条 insert', () => {
    const outcome = foldWorkingTreeEntry(firstRow, writeTo('note-1', { patch: { title: '乙改的' } }));

    expect(outcome.kind).toBe('update');
    // delta 为 0 才说明没开出第二行；开出第二行的实现会给 +1。
    expect(outcome.entryCountDelta).toBe(0);
  });

  it('远端同步写落在本地编辑之上，照样折成一条', () => {
    const outcome = foldWorkingTreeEntry(
      firstRow,
      writeTo('note-1', { origin: 'remote_sync', sourceChangeId: 77, patch: { title: '远端改的' } })
    );

    expect(outcome.kind).toBe('update');
    expect(outcome.entryCountDelta).toBe(0);
    // 跨 realm 与本 realm **平等**：后到的那次照常覆盖 patch 与 origin，
    // 没有「远端的要另起一条等人裁决」这回事。
    expect(foldedRowOf(outcome).patch).toEqual({ title: '远端改的' });
    expect(foldedRowOf(outcome).origin).toBe('remote_sync');
  });

  it('inversePatch 保持首次捕获值：回滚的基线是 HEAD，不是「上一个 writer」', () => {
    const outcome = foldWorkingTreeEntry(firstRow, writeTo('note-1', { inversePatch: { title: '甲改的' } }));

    // 后到的 writer 把 inversePatch 换成「甲改的」的话，这条单元的逆操作就指向了
    // 另一个 writer 的中间态，而不是 HEAD——工作树对 HEAD 的定义会随 writer 漂移。
    expect(foldedRowOf(outcome).inversePatch).toEqual({ title: '原值' });
  });
});

describe('writer 身份不是提交正确性的必要条件（FR-032）', () => {
  it('来源混合的三条单元一起被提交，没有按来源分批', async () => {
    const scene = createWorkingTreeScene();
    scene.addEntry({ unitId: 'unit-a', entityId: 'note-a', origin: 'local' });
    scene.addEntry({ unitId: 'unit-b', entityId: 'note-b', origin: 'remote_sync', sourceChangeId: 12 });
    scene.addEntry({ unitId: 'unit-c', entityId: 'note-c', origin: 'local', transactionId: 'tx-9' });

    expectOk(await commitOnce(scene, '混合来源'));

    expect(scene.probe.rowsOf(CommitChangeSet)).toHaveLength(3);
    expect(entryRowsOf(scene)).toHaveLength(0);
  });

  it('authorId 换一个人，提交范围一模一样', async () => {
    const byAlice = createWorkingTreeScene();
    byAlice.addEntry({ unitId: 'unit-a', entityId: 'note-a' });
    byAlice.addEntry({ unitId: 'unit-b', entityId: 'note-b', origin: 'remote_sync', sourceChangeId: 3 });

    const byBob = createWorkingTreeScene();
    byBob.addEntry({ unitId: 'unit-a', entityId: 'note-a' });
    byBob.addEntry({ unitId: 'unit-b', entityId: 'note-b', origin: 'remote_sync', sourceChangeId: 3 });

    expectOk(await commitOnce(byAlice, '同样的两条', { authorId: 'alice' }));
    expectOk(await commitOnce(byBob, '同样的两条', { authorId: 'bob' }));

    // authorId 若参与了筛选（「只提交我写的那部分」），两边的条数会分家。
    expect(byBob.probe.rowsOf(CommitChangeSet)).toHaveLength(byAlice.probe.rowsOf(CommitChangeSet).length);
    expect(entryRowsOf(byBob)).toHaveLength(0);
  });

  it('authorId 只作为 commit 的元数据落库，不落到 ChangeSet 上', async () => {
    const scene = createWorkingTreeScene();
    scene.addEntry({ unitId: 'unit-a', entityId: 'note-a' });

    expectOk(await commitOnce(scene, '一条', { authorId: 'carol' }));

    const [commit] = scene.probe.rowsOf(Commit) as Commit[];
    expect(commit.author).toBe('carol');
    // ChangeSet 上有 author 的话，重放时就有了「谁的变更」这个维度，
    // 而重放只需要「变成什么样」。
    expect(Object.keys(scene.probe.rowsOf(CommitChangeSet)[0] as object)).not.toContain('author');
  });

  it('提交别人写进来的那条，不需要先「认领」它', async () => {
    const scene = createWorkingTreeScene();
    // 整个工作树都来自远端同步通道，本 realm 一笔没写。
    scene.addEntry({ unitId: 'unit-a', entityId: 'note-a', origin: 'remote_sync', sourceChangeId: 1 });
    scene.addEntry({ unitId: 'unit-b', entityId: 'note-b', origin: 'remote_sync', sourceChangeId: 2 });

    expectOk(await commitOnce(scene, '全是远端来的'));

    expect(scene.probe.rowsOf(CommitChangeSet)).toHaveLength(2);
  });
});

describe('并发保护只由 revision CAS 提供（FR-031/032）', () => {
  it('三个 revision 全对上，authorId 与 operationId 随便换都成功', async () => {
    const scene = createWorkingTreeScene();
    scene.addEntry({ unitId: 'unit-a', entityId: 'note-a' });

    const result = await commitOnce(scene, '换个人换个操作 id', {
      authorId: '另一个 realm 的人',
      operationId: 'op-from-another-realm'
    });

    // 身份不参与 CAS：它对不上也不该有「冲突」这个出口。
    expect(result.ok).toBe(true);
  });

  it('revision 对不上就失败，而失败原因里没有身份这一项', async () => {
    const scene = createWorkingTreeScene();
    scene.addEntry({ unitId: 'unit-a', entityId: 'note-a' });

    const result = await commitOnce(scene, '过期的工作树 revision', {
      expectedWorkingTreeRevision: stateRowOf(scene).workingTreeRevision - 1
    });

    expect(result.ok).toBe(false);
    // 三个 kind 全是 revision，没有第四个 `writer_identity`。
    if (!result.ok) expect(result.conflict.kind).toBe('working_tree_revision');
  });
});
