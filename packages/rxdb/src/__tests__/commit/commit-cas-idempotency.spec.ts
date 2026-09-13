/**
 * @fileoverview T024 红测试：推进 HEAD 的 CAS 与提交幂等（FR-029/036）。
 *
 * @remarks
 * 契约见 `data-model.md` §2.5 与 `contracts/core-api.md` §4。实现目标是
 * `src/commit/write-commit.ts`（T035）与 `src/commit/commit-idempotency.ts`（T036）。
 *
 * 为什么这四组断言值得写：
 *
 * 1. **冲突是返回值，不是异常——这一条反过来决定了写入顺序**。若实现按「先插 commit 与
 *    ChangeSet，最后 CAS ref，命中 0 行就返回冲突」来写，那么返回的那一刻事务**没有**回滚，
 *    两张表里已经躺着孤儿行了。异常写法能靠外层事务回滚兜底，返回值写法不能。
 *    因此 CAS 必须**排在所有写入之前**：ref 抢到了才有资格写 commit。
 *    钉死的形式是「CAS 未命中时一行都没写」。
 * 2. **CAS 条件会漏掉 `generation` 或 `status`**。只比 `headRevision` 在单进程下永远是绿的：
 *    - 漏 `generation` = ABA。删掉分支再建同名分支，`headRevision` 从 0 重新开始，
 *      一个拿着旧 revision 的调用方会把提交写进一个**同名但不同世**的分支。
 *    - 漏 `status` = 守卫的检查—行动窗口。`assertCommitGraphIntact()` 与 CAS 之间，
 *      另一个 writer 可以把分支标成 `corrupted_read_only`；没有这个条件，本次提交照样落进
 *      一个已经只读的分支。把它并进 CAS 条件，窗口就不存在。
 * 3. **幂等键会退化成裸 `operationId`**。`operationId` 由调用方给，重建同名分支后调用方很可能
 *    复用同一批 id。真正的键是 `generation + operationId`——`generation` 全局单调不复用
 *    （data-model.md §2.2），所以它同时把 database 与 branch 两维都盖住了。
 *    裸 `operationId` 会让新分支的第一次提交被误判成旧分支那次提交的重放，直接返回旧节点。
 * 4. **唯一约束的捕获会被写成包住整段的 try/catch**。`isUniqueConstraintViolation()` 的 TSDoc
 *    已经写明它只说「这是唯一约束冲突」，说不了「冲突的是哪张表」。包大了，用户实体里一条
 *    无关的唯一约束错误会被读成「这次提交是重放」，于是**丢掉一次真实提交**且无任何报错。
 */

import { describe, expect, it } from 'vitest';
import type { CommitChangeUnit } from '../../commit/change-unit.js';
import { computeChangeUnitFingerprint } from '../../commit/change-unit.js';
import { CommitBranchRef } from '../../commit/commit-branch-ref.entity.js';
import { CommitChangeSet } from '../../commit/commit-change-set.entity.js';
import { CommitOperationMismatchError, deriveCommitOperationId } from '../../commit/commit-idempotency.js';
import { Commit } from '../../commit/commit.entity.js';
import type { WriteCommitInput } from '../../commit/write-commit.js';
import { buildCommitRows, writeCommit } from '../../commit/write-commit.js';
import type { EntityManager } from '../../entity/entity-manager.js';
import { SyncType } from '../../entity/metadata-options.interface.js';
import { getEntityMetadata } from '../../rxdb-utils.js';
import { RxDB } from '../../RxDB.js';
import { createMockAdapter } from '../fixtures/test-db-setup.js';
import { createCommitGraphProbe, normalizeSql, setClauseOf, whereClauseOf } from './fixtures/commit-graph-probe.js';

const REF_TABLE = getEntityMetadata(CommitBranchRef).tableName;
const CALLER_OPERATION_ID = '00000000-0000-4000-8000-0000000000aa';

function createEntityManager(): EntityManager {
  const database = new RxDB({
    dbName: `rxdb-commit-cas-${Math.random().toString(36).slice(2)}`,
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

/** 往探针里塞一行 ref。 */
function seedRef(
  probe: ReturnType<typeof createCommitGraphProbe>,
  entityManager: EntityManager,
  overrides: Partial<CommitBranchRef> = {}
): CommitBranchRef {
  const ref = entityManager.instantiate(CommitBranchRef);
  ref.id = 'main';
  ref.branchId = 'main';
  ref.generation = 1;
  ref.headCommitId = null;
  ref.headRevision = 0;
  ref.status = 'ok';
  ref.corruptedAt = null;
  Object.assign(ref, overrides);
  probe.seed(CommitBranchRef, [ref]);
  return ref;
}

/** 按某份入参造出「上一次已经成功提交」的那个 commit 行。 */
function seedExistingCommit(
  probe: ReturnType<typeof createCommitGraphProbe>,
  entityManager: EntityManager,
  input: WriteCommitInput,
  overrides: Partial<Commit> = {}
): Commit {
  const { commit } = buildCommitRows(entityManager, {
    id: 'commit-existing',
    kind: input.kind,
    parentIds: [],
    message: input.message,
    author: input.author,
    operationId: deriveCommitOperationId({
      branchGeneration: input.branchGeneration,
      operationId: input.operationId
    }),
    units: input.units
  });
  Object.assign(commit, overrides);
  probe.seed(Commit, [commit]);
  return commit;
}

describe('推进 HEAD 的 CAS（FR-029）', () => {
  it('CAS 恰好一条语句，条件含 id / generation / headRevision / status', async () => {
    const entityManager = createEntityManager();
    const probe = createCommitGraphProbe({ rowsAffected: 1 });
    seedRef(probe, entityManager, { generation: 7, headRevision: 3 });

    const outcome = await writeCommit(probe.executor, entityManager, {
      ...createWriteInput({ branchGeneration: 7, expectedHeadRevision: 3 })
    });

    expect(outcome.status).toBe('committed');
    expect(probe.statements).toHaveLength(1);
    const [sql] = probe.statements;
    expect(normalizeSql(sql)).toMatch(new RegExp(`^update\\b[^]*\\b${REF_TABLE}\\b`));
    const where = whereClauseOf(sql);
    expect(where).toContain(`'main'`);
    // 漏 generation = ABA：同名重建的分支会被当成同一个分支写进去。
    expect(where).toMatch(/\bgeneration\b[^]*=\s*7\b/);
    expect(where).toMatch(/\bheadrevision\b[^]*=\s*3\b/);
    // 漏 status = 守卫的检查—行动窗口没关上。
    expect(where).toMatch(/\bstatus\b[^]*=\s*'ok'/);
    // 六个后端共用这一份语句，占位符方言（`$1` 与 `?`）一旦进来就必须在这里分叉。
    expect(sql).not.toMatch(/[?]|\$\d/);
  });

  it('CAS 的 SET 把 headRevision 推进一格，并指向本次的新 commit', async () => {
    const entityManager = createEntityManager();
    const probe = createCommitGraphProbe({ rowsAffected: 1 });
    seedRef(probe, entityManager, { headRevision: 3 });

    const outcome = await writeCommit(probe.executor, entityManager, createWriteInput({ expectedHeadRevision: 3 }));

    if (outcome.status !== 'committed') throw new Error(`expected committed, got ${outcome.status}`);
    const setClause = setClauseOf(probe.statements[0]);
    expect(setClause).toMatch(/\bheadrevision\b[^]*=\s*4\b/);
    expect(setClause).toContain(outcome.commit.id.toLowerCase());
  });

  it('CAS 未命中时返回冲突值，且 commit / ChangeSet / ref 一行都没写', async () => {
    const entityManager = createEntityManager();
    const probe = createCommitGraphProbe({ rowsAffected: 0 });
    seedRef(probe, entityManager, { headRevision: 9 });

    const outcome = await writeCommit(probe.executor, entityManager, createWriteInput({ expectedHeadRevision: 3 }));

    // 冲突是返回值不是异常 ⇒ 返回的那一刻事务不会回滚 ⇒ CAS 必须排在所有写入之前，
    // 否则两张表里已经躺着孤儿行了。
    expect(outcome).toEqual({ status: 'head_revision_conflict', expectedHeadRevision: 3 });
    expect(probe.saved).toEqual([]);
    expect(probe.rowsOf(Commit)).toEqual([]);
    expect(probe.rowsOf(CommitChangeSet)).toEqual([]);
  });

  it('父 commit 取自 ref 当前的 headCommitId —— 调用方不重复声明一遍', async () => {
    const entityManager = createEntityManager();
    const probe = createCommitGraphProbe({ rowsAffected: 1 });
    seedRef(probe, entityManager, { headCommitId: 'commit-head', headRevision: 5 });

    const outcome = await writeCommit(probe.executor, entityManager, createWriteInput({ expectedHeadRevision: 5 }));

    if (outcome.status !== 'committed') throw new Error(`expected committed, got ${outcome.status}`);
    // 让调用方自带 parentIds 就是第二份真相：它与 expectedHeadRevision 可以互相矛盾，
    // 而 CAS 只认后者，于是父链会指向一个与本次修订无关的节点。
    expect(outcome.commit.parentIds).toEqual(['commit-head']);
    expect(outcome.commit.firstParentId).toBe('commit-head');
  });

  it('首次提交的父链为空数组，firstParentId 为 null', async () => {
    const entityManager = createEntityManager();
    const probe = createCommitGraphProbe({ rowsAffected: 1 });
    seedRef(probe, entityManager, { headCommitId: null });

    const outcome = await writeCommit(probe.executor, entityManager, createWriteInput());

    if (outcome.status !== 'committed') throw new Error(`expected committed, got ${outcome.status}`);
    expect({ parentIds: outcome.commit.parentIds, firstParentId: outcome.commit.firstParentId }).toEqual({
      parentIds: [],
      firstParentId: null
    });
  });

  it('CAS 命中后 commit 与全部 ChangeSet 一起落库', async () => {
    const entityManager = createEntityManager();
    const probe = createCommitGraphProbe({ rowsAffected: 1 });
    seedRef(probe, entityManager);
    const units = ['recipe-1', 'recipe-2'].map(entityId => createUnit({ entityId }));

    const outcome = await writeCommit(probe.executor, entityManager, createWriteInput({ units }));

    if (outcome.status !== 'committed') throw new Error(`expected committed, got ${outcome.status}`);
    expect(probe.rowsOf(Commit)).toHaveLength(1);
    expect(probe.rowsOf(CommitChangeSet)).toHaveLength(2);
    expect(outcome.commit.changeSetCount).toBe(2);
  });
});

describe('提交幂等（FR-036）', () => {
  it('幂等键由 generation 与调用方 operationId 共同决定，且是合法 uuid', () => {
    const first = deriveCommitOperationId({ branchGeneration: 1, operationId: CALLER_OPERATION_ID });
    const again = deriveCommitOperationId({ branchGeneration: 1, operationId: CALLER_OPERATION_ID });
    const nextGeneration = deriveCommitOperationId({ branchGeneration: 2, operationId: CALLER_OPERATION_ID });

    expect(again).toBe(first);
    // `rxdb_commit."operationId"` 是 uuid 列，组合键只能哈希进 uuid，不能拼成 `main:1:xxx`。
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    // generation 全局单调不复用，因此它同时盖住了 database 与 branch 两维。
    expect(nextGeneration).not.toBe(first);
  });

  it('相同 operationId 重试返回原 commit，不发 CAS、不写新行', async () => {
    const entityManager = createEntityManager();
    const probe = createCommitGraphProbe({ rowsAffected: 1 });
    seedRef(probe, entityManager);
    const input = createWriteInput();
    const existing = seedExistingCommit(probe, entityManager, input);

    const outcome = await writeCommit(probe.executor, entityManager, input);

    expect(outcome).toEqual({ status: 'reused', commit: existing });
    // 重放推进 HEAD = 同一次提交被算了两次修订，另一个 Tab 手里的 revision 平白失效。
    expect(probe.statements).toEqual([]);
    expect(probe.saved).toEqual([]);
  });

  it('同 operationId 但内容不同时稳定报错，既不覆盖也不静默返回旧节点', async () => {
    const entityManager = createEntityManager();
    const probe = createCommitGraphProbe({ rowsAffected: 1 });
    seedRef(probe, entityManager);
    const input = createWriteInput();
    const existing = seedExistingCommit(probe, entityManager, input, { contentFingerprint: 'fp-other' });

    // 静默返回旧节点 = 用户以为这次改动提交了，实际没有，且历史里查不出差别。
    await expect(writeCommit(probe.executor, entityManager, input)).rejects.toThrow(CommitOperationMismatchError);
    expect(probe.statements).toEqual([]);
    expect(probe.saved).toEqual([]);
    expect(existing.contentFingerprint).toBe('fp-other');
  });

  it('同名重建分支用新 generation，不被误判成旧分支那次提交的重放', async () => {
    const entityManager = createEntityManager();
    const probe = createCommitGraphProbe({ rowsAffected: 1 });
    seedRef(probe, entityManager, { generation: 2, headRevision: 0 });
    // 旧世的那次提交还在表里（commit 不随分支删除而消失）。
    seedExistingCommit(probe, entityManager, createWriteInput({ branchGeneration: 1 }));

    const outcome = await writeCommit(probe.executor, entityManager, createWriteInput({ branchGeneration: 2 }));

    expect(outcome.status).toBe('committed');
    expect(probe.rowsOf(Commit)).toHaveLength(2);
  });

  it('INSERT 撞唯一约束时读回获胜的那个 commit（并发重放的兜底）', async () => {
    const entityManager = createEntityManager();
    const input = createWriteInput();
    let winner: Commit | null = null;
    const probe = createCommitGraphProbe({
      rowsAffected: 1,
      saveMany: async () => {
        // 模拟「本次查过之后、写之前」另一个 writer 抢先提交完成。
        winner ??= seedExistingCommit(probe, entityManager, input);
        throw new Error('UNIQUE constraint failed: rxdb_commit.operationId');
      }
    });
    seedRef(probe, entityManager);

    const outcome = await writeCommit(probe.executor, entityManager, input);

    expect(outcome).toEqual({ status: 'reused', commit: winner });
  });

  it('非唯一约束的写失败原样上抛，不被当成重放吞掉', async () => {
    const entityManager = createEntityManager();
    const failure = new Error('database or disk is full');
    const probe = createCommitGraphProbe({
      rowsAffected: 1,
      saveMany: async () => {
        throw failure;
      }
    });
    seedRef(probe, entityManager);

    // 包住整段的 try/catch 会把用户实体里一条无关的唯一约束错误读成「这次是重放」，
    // 于是丢掉一次真实提交且无任何报错。捕获只能钉在自己发出的那一条 INSERT 上。
    await expect(writeCommit(probe.executor, entityManager, createWriteInput())).rejects.toThrow(failure);
  });
});
