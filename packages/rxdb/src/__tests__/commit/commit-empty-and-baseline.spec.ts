/**
 * @fileoverview T025 红测试：普通 commit 的必填项与空提交门禁，以及两种系统根节点的例外（FR-008/009）。
 *
 * @remarks
 * 契约见 `specs/001-working-tree-commits/spec.md` FR-008 / FR-009 与
 * `src/commit/commit.entity.ts` 里 {@link CommitKind} 的 TSDoc。实现目标是
 * `src/commit/write-commit.ts`（T035）。
 *
 * 为什么这四组断言值得写：
 *
 * 1. **「非空」会被写成 `if (!message)`**。空格串是 truthy，于是 `'   '` 一路进历史，
 *    列上是 not null、看着有值，人读起来是空白。FR-008 说的是 **trim 后**非空，
 *    这两者只在「全是空白」这一种输入上分岔，而那恰好是误点回车最常产生的那一种。
 * 2. **校验的位置比校验本身更容易写错**。放在 CAS 之后，一次空提交就白白推进了一格
 *    `headRevision`：别的 Tab 手里的 revision 全部失效，而实际上什么都没提交。
 *    因此每条失败路径都同时钉死「零语句、零写入」。
 * 3. **空提交门禁会被 `kind` 绕过**。`kind` 是调用方给的，`baseline` / `branch_baseline`
 *    是 FR-009 允许空 ChangeSet 的唯一例外——也就是说，任何人只要把 `kind` 填成
 *    `baseline` 就能塞进一个空节点。所以例外必须配一条反向约束：系统根节点**不得**携带
 *    用户作者或用户消息。带着自己的消息还想走例外通道的，本身就是在走私普通 commit。
 * 4. **根节点的消息会被写成空串**。列是 not null，空串能存下去，于是 `listCommits()`
 *    里出现一个既没作者也没消息的节点，与「作者恰好没记上的普通 commit」在 UI 上不可区分。
 *    系统文案是固定的、由库给出，不由调用方传。
 */

import { describe, expect, it } from 'vitest';
import type { CommitChangeUnit } from '../../commit/change-unit.js';
import { computeChangeUnitFingerprint } from '../../commit/change-unit.js';
import { CommitBranchRef } from '../../commit/commit-branch-ref.entity.js';
import { CommitChangeSet } from '../../commit/commit-change-set.entity.js';
import type { CommitKind } from '../../commit/commit.entity.js';
import { Commit } from '../../commit/commit.entity.js';
import type { WriteCommitInput } from '../../commit/write-commit.js';
import { CommitValidationError, SYSTEM_COMMIT_MESSAGES, writeCommit } from '../../commit/write-commit.js';
import type { EntityManager } from '../../entity/entity-manager.js';
import { SyncType } from '../../entity/metadata-options.interface.js';
import { RxDB } from '../../RxDB.js';
import { createMockAdapter } from '../fixtures/test-db-setup.js';
import { createCommitGraphProbe } from './fixtures/commit-graph-probe.js';

const CALLER_OPERATION_ID = '00000000-0000-4000-8000-0000000000bb';

function createEntityManager(): EntityManager {
  const database = new RxDB({
    dbName: `rxdb-commit-empty-${Math.random().toString(36).slice(2)}`,
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

function createWriteInput(overrides: Partial<WriteCommitInput> = {}): WriteCommitInput {
  return {
    branchId: 'main',
    branchGeneration: 1,
    expectedHeadRevision: 0,
    kind: 'normal',
    message: 'first',
    author: 'jimmy',
    operationId: CALLER_OPERATION_ID,
    units: [createUnit()],
    ...overrides
  };
}

interface Scene {
  readonly probe: ReturnType<typeof createCommitGraphProbe>;
  readonly entityManager: EntityManager;
}

/** 造一个「CAS 必然命中」的场景——这样失败只可能来自校验本身。 */
function createScene(): Scene {
  const entityManager = createEntityManager();
  const probe = createCommitGraphProbe({ rowsAffected: 1 });
  const ref = entityManager.instantiate(CommitBranchRef);
  ref.id = 'main';
  ref.branchId = 'main';
  ref.generation = 1;
  ref.headCommitId = null;
  ref.headRevision = 0;
  ref.status = 'ok';
  ref.corruptedAt = null;
  probe.seed(CommitBranchRef, [ref]);
  return { probe, entityManager };
}

/** 断言一次入参被拒，且拒绝发生在任何写入与 CAS 之前。 */
async function expectRejectedBeforeWriting(scene: Scene, input: WriteCommitInput, reason: string): Promise<void> {
  await expect(writeCommit(scene.probe.executor, scene.entityManager, input)).rejects.toMatchObject({
    name: 'CommitValidationError',
    reason
  });
  // 校验排在 CAS 之后的话，一次被拒的提交照样推进了一格 headRevision：
  // 别的 Tab 手里的 revision 全部失效，而实际上什么都没提交。
  expect(scene.probe.statements).toEqual([]);
  expect(scene.probe.saved).toEqual([]);
  expect(scene.probe.rowsOf(Commit)).toEqual([]);
  expect(scene.probe.rowsOf(CommitChangeSet)).toEqual([]);
}

describe('普通 commit 的必填项（FR-008）', () => {
  it('message 只有空白时被拒，且什么都没写', async () => {
    const scene = createScene();
    // `if (!message)` 放不住这一条：空格串是 truthy。
    await expectRejectedBeforeWriting(scene, createWriteInput({ message: '   \n\t ' }), 'empty_message');
  });

  it('message 为空串或 null 时被拒', async () => {
    await expectRejectedBeforeWriting(createScene(), createWriteInput({ message: '' }), 'empty_message');
    await expectRejectedBeforeWriting(createScene(), createWriteInput({ message: null }), 'empty_message');
  });

  it('message 落库前 trim，首尾空白不进历史', async () => {
    const scene = createScene();

    const outcome = await writeCommit(
      scene.probe.executor,
      scene.entityManager,
      createWriteInput({ message: '  修好了导入  ' })
    );

    if (outcome.status !== 'committed') throw new Error(`expected committed, got ${outcome.status}`);
    expect(outcome.commit.message).toBe('修好了导入');
  });

  it('author 缺失或只有空白时被拒', async () => {
    await expectRejectedBeforeWriting(createScene(), createWriteInput({ author: null }), 'missing_author');
    await expectRejectedBeforeWriting(createScene(), createWriteInput({ author: '  ' }), 'missing_author');
  });

  it('operationId 缺失时被拒', async () => {
    // 没有幂等键 = 这次提交无法被安全重放，网络/进程抖一下就可能落两份。
    await expectRejectedBeforeWriting(createScene(), createWriteInput({ operationId: '' }), 'missing_operation_id');
  });

  it('CommitValidationError 是 Error 的子类，带可判别的 reason', async () => {
    const scene = createScene();
    const error = await writeCommit(scene.probe.executor, scene.entityManager, createWriteInput({ message: ' ' })).then(
      () => null,
      (caught: unknown) => caught
    );
    expect(error).toBeInstanceOf(CommitValidationError);
    expect(error).toBeInstanceOf(Error);
    expect((error as CommitValidationError).reason).toBe('empty_message');
  });
});

describe('普通 commit 不得为空（FR-009）', () => {
  it('无变更单元时失败，且不产生空节点', async () => {
    const scene = createScene();
    await expectRejectedBeforeWriting(scene, createWriteInput({ units: [] }), 'empty_commit');
  });

  it('空提交不推进 headRevision', async () => {
    const scene = createScene();
    await writeCommit(scene.probe.executor, scene.entityManager, createWriteInput({ units: [] })).catch(
      () => undefined
    );
    // 唯一能推进 HEAD 的语句就是那条 CAS；一条都没发 = 一格都没推进。
    expect(scene.probe.statements).toEqual([]);
  });
});

describe('两种系统根节点是唯一例外（FR-008/009）', () => {
  const systemKinds: Exclude<CommitKind, 'normal'>[] = ['baseline', 'branch_baseline'];

  for (const kind of systemKinds) {
    it(`${kind} 允许无作者、无用户消息且 ChangeSet 为空`, async () => {
      const scene = createScene();

      const outcome = await writeCommit(
        scene.probe.executor,
        scene.entityManager,
        createWriteInput({ kind, message: null, author: null, units: [] })
      );

      if (outcome.status !== 'committed') throw new Error(`expected committed, got ${outcome.status}`);
      expect({
        kind: outcome.commit.kind,
        author: outcome.commit.author,
        changeSetCount: outcome.commit.changeSetCount
      }).toEqual({ kind, author: null, changeSetCount: 0 });
      expect(scene.probe.rowsOf(CommitChangeSet)).toEqual([]);
    });

    it(`${kind} 的消息是库给的固定文案，不是空串`, async () => {
      const scene = createScene();

      const outcome = await writeCommit(
        scene.probe.executor,
        scene.entityManager,
        createWriteInput({ kind, message: null, author: null, units: [] })
      );

      if (outcome.status !== 'committed') throw new Error(`expected committed, got ${outcome.status}`);
      // 空串存得下去，于是历史里出现一个既没作者也没消息的节点，
      // 与「作者恰好没记上的普通 commit」在 UI 上不可区分。
      expect(outcome.commit.message).toBe(SYSTEM_COMMIT_MESSAGES[kind]);
      expect(SYSTEM_COMMIT_MESSAGES[kind].trim()).not.toBe('');
    });

    it(`${kind} 带用户作者或用户消息时被拒——例外通道不能用来走私普通 commit`, async () => {
      await expectRejectedBeforeWriting(
        createScene(),
        createWriteInput({ kind, message: null, author: 'jimmy', units: [] }),
        'user_authored_system_commit'
      );
      await expectRejectedBeforeWriting(
        createScene(),
        createWriteInput({ kind, message: '我自己写的', author: null, units: [] }),
        'user_authored_system_commit'
      );
    });

    it(`${kind} 照常推进 HEAD——它是分支的根，不是旁路`, async () => {
      const scene = createScene();

      const outcome = await writeCommit(
        scene.probe.executor,
        scene.entityManager,
        createWriteInput({ kind, message: null, author: null, units: [] })
      );

      expect(outcome.status).toBe('committed');
      expect(scene.probe.statements).toHaveLength(1);
    });
  }

  it('系统根节点带变更单元时照常写 ChangeSet——例外只放宽「允许为空」', async () => {
    const scene = createScene();

    const outcome = await writeCommit(
      scene.probe.executor,
      scene.entityManager,
      createWriteInput({ kind: 'branch_baseline', message: null, author: null, units: [createUnit()] })
    );

    if (outcome.status !== 'committed') throw new Error(`expected committed, got ${outcome.status}`);
    expect(outcome.commit.changeSetCount).toBe(1);
    expect(scene.probe.rowsOf(CommitChangeSet)).toHaveLength(1);
  });

  it('SYSTEM_COMMIT_MESSAGES 只覆盖两种系统根节点，且两条文案互不相同', () => {
    // 同一条文案 = 两种根节点在历史里长得一样，FR-044 的物化屏障就认不出 branch_baseline。
    expect(Object.keys(SYSTEM_COMMIT_MESSAGES).sort()).toEqual(['baseline', 'branch_baseline']);
    expect(SYSTEM_COMMIT_MESSAGES.baseline).not.toBe(SYSTEM_COMMIT_MESSAGES.branch_baseline);
  });
});
