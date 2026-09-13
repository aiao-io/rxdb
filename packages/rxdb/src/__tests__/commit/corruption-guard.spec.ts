/**
 * @fileoverview T028 红测试：commit 图损坏守卫（FR-022/051、SC-013）。
 *
 * @remarks
 * 实现目标是 `src/commit/commit-graph-guard.ts`（T038）。R10 要求它是**唯一**一份：
 * US-306 阶段 B 的 `commit()`、US-307 的 `restore()`、US-308 的 switch-to
 * 各自在自己的写事务内调用同一个符号。
 *
 * 这份测试钉的是那一份实现里最容易走偏的五处：
 *
 * 1. **只查 HEAD**。「HEAD 好着呢」是最省的检查，也是最没用的：重放要沿父链一路走到根，
 *    第三层祖先的指纹对不上，HEAD 这一层看不出任何异常。
 * 2. **只沿 `firstParentId` 走**。它是带索引的冗余列，遍历它比读 `parentIds` JSON 快，
 *    但 merge 节点的第二父整棵子树会被跳过——那恰好是最可能出问题的那部分历史。
 * 3. **把损坏标记写进调用方的事务**。守卫命中时调用方一定会回滚，标记跟着一起消失：
 *    用户看到操作失败，库里却什么记录都没留，下一次调用重新走一遍全链，永远诊断不出来。
 *    所以校验只读，落标记是另一个符号、另一个事务。
 * 4. **自动挑一个「还能用」的状态**。回退到上一个校验通过的 commit、清空工作树、
 *    或退化成内存模式，都能让界面继续转——代价是用户的数据在他不知情的时候被换掉了。
 *    FR-022 要的是 fail-closed：保留原 ref、不删记录、拒绝操作。
 * 5. **把孤立损坏当全库损坏**。一条谁都够不到的坏记录会让整个库停摆，
 *    而它对任何重放都没有影响。可达性是判定的全部依据。
 */

import { describe, expect, it } from 'vitest';
import type { CommitChangeUnit } from '../../commit/change-unit.js';
import { computeChangeUnitFingerprint } from '../../commit/change-unit.js';
import { CommitBranchRef } from '../../commit/commit-branch-ref.entity.js';
import { CommitChangeSet } from '../../commit/commit-change-set.entity.js';
import { CommitErrorCode } from '../../commit/commit-error-codes.js';
import {
  CommitGraphCorruptedError,
  assertCommitGraphIntact,
  markBranchCorrupted
} from '../../commit/commit-graph-guard.js';
import { Commit } from '../../commit/commit.entity.js';
import { buildCommitRows } from '../../commit/write-commit.js';
import type { EntityManager } from '../../entity/entity-manager.js';
import { SyncType } from '../../entity/metadata-options.interface.js';
import { RxDB } from '../../RxDB.js';
import { createMockAdapter } from '../fixtures/test-db-setup.js';
import { createCommitGraphProbe } from './fixtures/commit-graph-probe.js';

function createEntityManager(): EntityManager {
  const database = new RxDB({
    dbName: `rxdb-corruption-guard-${Math.random().toString(36).slice(2)}`,
    entities: [],
    sync: { local: { adapter: 'local' }, type: SyncType.None }
  });
  database.adapter('local', db => createMockAdapter(db));
  database.init();
  return database.entityManager;
}

function createUnit(overrides: Partial<CommitChangeUnit> = {}): CommitChangeUnit {
  const { fingerprint, ...rest } = overrides;
  const base: Omit<CommitChangeUnit, 'fingerprint'> = {
    unitId: 'unit-1',
    transactionId: null,
    namespace: 'app',
    entity: 'Recipe',
    entityId: 'recipe-1',
    operation: 'update',
    patch: { title: 'after' },
    inversePatch: { title: 'before' },
    baseFingerprint: 'fp-base',
    origin: 'local',
    ...rest
  };
  return { ...base, fingerprint: fingerprint ?? computeChangeUnitFingerprint(base) };
}

interface Scene {
  readonly probe: ReturnType<typeof createCommitGraphProbe>;
  readonly entityManager: EntityManager;
  /** 造一个**自洽**的 commit（指纹与 changeSetCount 都走真实口径），损坏由测试事后制造。 */
  addCommit(id: string, parentIds: readonly string[], unitCount?: number): Commit;
  addBranch(branchId: string, headCommitId: string | null): CommitBranchRef;
  commitOf(id: string): Commit;
  refOf(branchId: string): CommitBranchRef;
}

function createScene(): Scene {
  const entityManager = createEntityManager();
  const probe = createCommitGraphProbe({ rowsAffected: 1 });
  const commits = new Map<string, Commit>();
  const refs = new Map<string, CommitBranchRef>();

  return {
    probe,
    entityManager,
    addCommit(id, parentIds, unitCount = 1) {
      const units = Array.from({ length: unitCount }, (_, index) =>
        createUnit({ unitId: `${id}-unit-${index}`, entityId: `recipe-${index}` })
      );
      const { commit, changeSets } = buildCommitRows(entityManager, {
        id,
        kind: parentIds.length === 0 ? 'baseline' : 'normal',
        parentIds: [...parentIds],
        message: parentIds.length === 0 ? null : `commit ${id}`,
        author: parentIds.length === 0 ? null : 'jimmy',
        operationId: `00000000-0000-4000-8000-${id.replace(/\W/g, '').padStart(12, '0').slice(-12)}`,
        units
      });
      probe.seed(Commit, [commit]);
      probe.seed(CommitChangeSet, changeSets);
      commits.set(id, commit);
      return commit;
    },
    addBranch(branchId, headCommitId) {
      const ref = entityManager.instantiate(CommitBranchRef);
      ref.id = branchId;
      ref.branchId = branchId;
      ref.generation = refs.size + 1;
      ref.headCommitId = headCommitId;
      ref.headRevision = headCommitId === null ? 0 : 1;
      ref.status = 'ok';
      ref.corruptedAt = null;
      probe.seed(CommitBranchRef, [ref]);
      refs.set(branchId, ref);
      return ref;
    },
    commitOf(id) {
      const commit = commits.get(id);
      if (!commit) throw new Error(`no seeded commit '${id}'`);
      return commit;
    },
    refOf(branchId) {
      const ref = refs.get(branchId);
      if (!ref) throw new Error(`no seeded ref '${branchId}'`);
      return ref;
    }
  };
}

/** 三节点直链 `root → mid → head`，全部自洽。 */
function createChainScene(): Scene {
  const scene = createScene();
  scene.addCommit('root', []);
  scene.addCommit('mid', ['root']);
  scene.addCommit('head', ['mid']);
  scene.addBranch('main', 'head');
  return scene;
}

describe('沿完整可达父链遍历（FR-051）', () => {
  it('自洽的链通过', async () => {
    const scene = createChainScene();

    await expect(assertCommitGraphIntact(scene.probe.executor, 'main')).resolves.toBeUndefined();
  });

  it('空分支通过——`headCommitId` 为 null 不是损坏', async () => {
    const scene = createScene();
    scene.addBranch('empty', null);

    await expect(assertCommitGraphIntact(scene.probe.executor, 'empty')).resolves.toBeUndefined();
  });

  it('根节点的指纹被改也要抓到——只查 HEAD 会漏', async () => {
    const scene = createChainScene();
    scene.commitOf('root').contentFingerprint = 'fp-tampered';

    await expect(assertCommitGraphIntact(scene.probe.executor, 'main')).rejects.toMatchObject({
      commitId: 'root',
      reason: 'fingerprint_mismatch'
    });
  });

  it('`changeSetCount` 与实际行数对不上即损坏', async () => {
    const scene = createChainScene();
    // 指纹仍然对得上，但少一行 ChangeSet：重放会静默少还原一个单元。
    scene.commitOf('mid').changeSetCount = 5;

    await expect(assertCommitGraphIntact(scene.probe.executor, 'main')).rejects.toMatchObject({
      commitId: 'mid',
      reason: 'change_set_count_mismatch'
    });
  });

  it('父链指向不存在的 commit 即损坏', async () => {
    const scene = createScene();
    scene.addCommit('head', ['gone']);
    scene.addBranch('main', 'head');

    await expect(assertCommitGraphIntact(scene.probe.executor, 'main')).rejects.toMatchObject({
      commitId: 'gone',
      reason: 'missing_commit'
    });
  });

  it('merge 的第二父子树里的损坏也要抓到', async () => {
    const scene = createScene();
    scene.addCommit('root', []);
    scene.addCommit('left', ['root']);
    scene.addCommit('right', ['root']);
    scene.addCommit('merge', ['left', 'right']);
    scene.addBranch('main', 'merge');
    // `firstParentId` 是带索引的冗余列，沿它遍历更快——代价是整个 `right` 子树没被看过。
    scene.commitOf('right').contentFingerprint = 'fp-tampered';

    await expect(assertCommitGraphIntact(scene.probe.executor, 'main')).rejects.toMatchObject({
      commitId: 'right'
    });
  });

  it('父链成环时终止而不是挂死', async () => {
    const scene = createScene();
    // 两个节点都按「父是对方」建出来，因此各自的指纹与自己的 `parentIds` 自洽——
    // 环是这里唯一的异常。造完再改 `parentIds` 同样能成环，但那顺手也改掉了进摘要的
    // 父列表，守卫会先判成 `fingerprint_mismatch`，于是这个用例根本走不到遍历终止那一步。
    scene.addCommit('a', ['b']);
    scene.addCommit('b', ['a']);
    scene.addBranch('main', 'b');

    // 环本身不必判成损坏；这里只要求遍历带 visited 集合，别把守卫变成一次挂起。
    await expect(assertCommitGraphIntact(scene.probe.executor, 'main')).resolves.not.toThrow();
  });
});

/**
 * 跑一次守卫，把它抛出的那个错误拿回来。
 *
 * @param scene - 已经被做坏的布景
 * @param branchId - 待校验分支
 * @returns 守卫抛出的损坏错误
 * @throws {@link Error} 守卫**没有**报损坏时
 *
 * @remarks
 * 不写成 `.catch(caught => caught as CommitGraphCorruptedError)`：那个形态在守卫意外通过时
 * 会把 `undefined` 一路喂进 `markBranchCorrupted()`，用例红在一个与真正病因无关的断言上，
 * 而真正的病因（布景没坏 / 守卫漏判）不会出现在任何一条错误信息里。类型上它也只能是
 * `void | CommitGraphCorruptedError`，断言前还得再收一次窄。
 */
async function captureCorruption(scene: Scene, branchId: string): Promise<CommitGraphCorruptedError> {
  try {
    await assertCommitGraphIntact(scene.probe.executor, branchId);
  } catch (caught) {
    return caught as CommitGraphCorruptedError;
  }
  throw new Error(`Expected branch '${branchId}' to be reported as corrupted, but the guard passed.`);
}

describe('孤立损坏只隔离记录（FR-022/051）', () => {
  it('谁都够不到的损坏节点不影响任何分支', async () => {
    const scene = createChainScene();
    scene.addCommit('orphan', []);
    scene.commitOf('orphan').contentFingerprint = 'fp-tampered';

    await expect(assertCommitGraphIntact(scene.probe.executor, 'main')).resolves.toBeUndefined();
  });

  it('孤立损坏的记录不被删除', async () => {
    const scene = createChainScene();
    scene.addCommit('orphan', []);
    scene.commitOf('orphan').contentFingerprint = 'fp-tampered';

    await assertCommitGraphIntact(scene.probe.executor, 'main');

    // 「顺手清掉坏记录」会让事后诊断失去唯一的证据。
    expect((scene.probe.rowsOf(Commit) as Commit[]).map(commit => commit.id)).toContain('orphan');
  });

  it('一个分支的可达损坏不牵连另一个分支', async () => {
    const scene = createScene();
    scene.addCommit('root', []);
    scene.addCommit('broken', ['root']);
    scene.addCommit('clean', ['root']);
    scene.addBranch('sick', 'broken');
    scene.addBranch('well', 'clean');
    scene.commitOf('broken').contentFingerprint = 'fp-tampered';

    await expect(assertCommitGraphIntact(scene.probe.executor, 'sick')).rejects.toBeInstanceOf(
      CommitGraphCorruptedError
    );
    await expect(assertCommitGraphIntact(scene.probe.executor, 'well')).resolves.toBeUndefined();
    expect(scene.refOf('well').status).toBe('ok');
  });
});

describe('校验只读，落标记是另一件事（FR-051、R10）', () => {
  it('命中损坏时守卫本身不写任何东西', async () => {
    const scene = createChainScene();
    scene.commitOf('mid').contentFingerprint = 'fp-tampered';

    await assertCommitGraphIntact(scene.probe.executor, 'main').catch(() => undefined);

    // 守卫跑在调用方的写事务里，而调用方命中损坏后一定回滚：
    // 标记写在这里会跟着一起消失，用户于是永远拿不到一个持久的诊断。
    expect(scene.probe.statements).toEqual([]);
    expect(scene.probe.saved).toEqual([]);
    expect({ status: scene.refOf('main').status, corruptedAt: scene.refOf('main').corruptedAt }).toEqual({
      status: 'ok',
      corruptedAt: null
    });
  });

  it('`markBranchCorrupted()` 才把分支置为 corrupted_read_only', async () => {
    const scene = createChainScene();
    scene.commitOf('mid').contentFingerprint = 'fp-tampered';
    const error = await captureCorruption(scene, 'main');

    await markBranchCorrupted(scene.probe.executor, error);

    expect(scene.refOf('main').status).toBe('corrupted_read_only');
    expect(scene.refOf('main').corruptedAt).toBeInstanceOf(Date);
  });

  it('落标记不动 HEAD——不自动回退到较早 commit', async () => {
    const scene = createChainScene();
    scene.commitOf('mid').contentFingerprint = 'fp-tampered';
    const before = { ...scene.refOf('main') };
    const error = await captureCorruption(scene, 'main');

    await markBranchCorrupted(scene.probe.executor, error);

    const after = scene.refOf('main');
    expect({
      headCommitId: after.headCommitId,
      headRevision: after.headRevision,
      generation: after.generation
    }).toEqual({
      headCommitId: before.headCommitId,
      headRevision: before.headRevision,
      generation: before.generation
    });
  });

  it('落标记不删任何 commit 与 ChangeSet 记录', async () => {
    const scene = createChainScene();
    scene.commitOf('mid').contentFingerprint = 'fp-tampered';
    const commitCount = scene.probe.rowsOf(Commit).length;
    const changeSetCount = scene.probe.rowsOf(CommitChangeSet).length;
    const error = await captureCorruption(scene, 'main');

    await markBranchCorrupted(scene.probe.executor, error);

    // 「清空重来」能让界面继续转，代价是用户的历史在他不知情时被丢掉。
    expect(scene.probe.rowsOf(Commit)).toHaveLength(commitCount);
    expect(scene.probe.rowsOf(CommitChangeSet)).toHaveLength(changeSetCount);
  });

  it('重复落标记不刷新首次发现时刻', async () => {
    const scene = createChainScene();
    scene.commitOf('mid').contentFingerprint = 'fp-tampered';
    const error = await captureCorruption(scene, 'main');
    await markBranchCorrupted(scene.probe.executor, error);
    const firstDetection = scene.refOf('main').corruptedAt;

    await markBranchCorrupted(scene.probe.executor, error);

    // `corruptedAt` 是诊断用的「什么时候开始坏的」；每次拒绝都刷新等于把它变成「最后一次尝试时间」。
    expect(scene.refOf('main').corruptedAt).toBe(firstDetection);
  });

  it('已标记 corrupted_read_only 的分支继续被拒绝', async () => {
    const scene = createChainScene();
    scene.commitOf('mid').contentFingerprint = 'fp-tampered';
    scene.refOf('main').status = 'corrupted_read_only';
    scene.refOf('main').corruptedAt = new Date(0);

    await expect(assertCommitGraphIntact(scene.probe.executor, 'main')).rejects.toBeInstanceOf(
      CommitGraphCorruptedError
    );
  });

  it('干净分支重复校验不会被误伤', async () => {
    const scene = createChainScene();

    await assertCommitGraphIntact(scene.probe.executor, 'main');
    await assertCommitGraphIntact(scene.probe.executor, 'main');

    expect({ status: scene.refOf('main').status, corruptedAt: scene.refOf('main').corruptedAt }).toEqual({
      status: 'ok',
      corruptedAt: null
    });
  });
});

describe('拒绝码三入口同一份（SC-013）', () => {
  it('错误带 commit_graph_corrupted 码与分支 id', async () => {
    const scene = createChainScene();
    scene.commitOf('mid').contentFingerprint = 'fp-tampered';

    await expect(assertCommitGraphIntact(scene.probe.executor, 'main')).rejects.toMatchObject({
      code: CommitErrorCode.commit_graph_corrupted,
      branchId: 'main'
    });
  });

  it('错误是带名字的 Error', async () => {
    const scene = createChainScene();
    scene.commitOf('mid').contentFingerprint = 'fp-tampered';

    const error = await assertCommitGraphIntact(scene.probe.executor, 'main').catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).name).toBe('CommitGraphCorruptedError');
  });
});
