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
 * 4. **CAS 成功之后的写失败会被「降级」成返回值**。CAS 已经把 `headCommitId` 推到了本次的新 id，
 *    此时再把 INSERT 的失败读成「这次是重放」并正常返回，事务就会照常提交——HEAD 停在一个
 *    从未落库的 commit 上（幽灵 HEAD），下一次 `assertCommitGraphIntact()` 把分支 latch 成
 *    `corrupted_read_only`。CAS 之后只有一个诚实的出口：抛错，让调用方的事务整体回滚。
 *    连带地，那条「读回赢家」的恢复 SELECT 也不该存在：它跑在一条失败语句之后，
 *    Postgres/PGlite 上事务已进入 aborted 状态，后续语句一律 `25P02`
 *    （`system/migration-runner.ts` 的 TSDoc 早就写明了这条语义）。
 */

import type { EntityManager } from '@aiao/rxdb';
import { getEntityMetadata, RxDB, SyncType } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import type { CommitChangeUnit } from '../../commit/change-unit.js';
import { computeChangeUnitFingerprint } from '../../commit/change-unit.js';
import { CommitBranchRef } from '../../commit/commit-branch-ref.entity.js';
import { CommitChangeSet } from '../../commit/commit-change-set.entity.js';
import { CommitOperationMismatchError, deriveCommitOperationId } from '../../commit/commit-idempotency.js';
import { Commit } from '../../commit/commit.entity.js';
import type { WriteCommitInput } from '../../commit/write-commit.js';
import { buildCommitRows, writeCommit } from '../../commit/write-commit.js';
import { rxDBPluginWorkingTree } from '../../plugin.js';
import { createMockAdapter } from '../fixtures/test-db-setup.js';
import { createCommitGraphProbe, normalizeSql, setClauseOf, whereClauseOf } from './fixtures/commit-graph-probe.js';
import { plainCommitWriteContext } from './fixtures/commit-write-context.js';

const REF_TABLE = getEntityMetadata(CommitBranchRef).tableName;
const CALLER_OPERATION_ID = '00000000-0000-4000-8000-0000000000aa';

function createEntityManager(): EntityManager {
  const database = new RxDB({
    dbName: `rxdb-commit-cas-${Math.random().toString(36).slice(2)}`,
    entities: [],
    sync: { local: { adapter: 'local' }, type: SyncType.None }
  });
  database.adapter('local', db => createMockAdapter(db));
  // 十张系统表由插件贡献，必须赶在 `init()` 之前 `use()`：晚了核心会当场拒绝，
  // 而这些实体进不了 `config.entities` 时 `instantiate()` 抛的是「need init rxdb」。
  database.use(rxDBPluginWorkingTree);
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

    const outcome = await writeCommit(probe.executor, plainCommitWriteContext(entityManager), {
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

    const outcome = await writeCommit(
      probe.executor,
      plainCommitWriteContext(entityManager),
      createWriteInput({ expectedHeadRevision: 3 })
    );

    if (outcome.status !== 'committed') throw new Error(`expected committed, got ${outcome.status}`);
    const setClause = setClauseOf(probe.statements[0]);
    expect(setClause).toMatch(/\bheadrevision\b[^]*=\s*4\b/);
    expect(setClause).toContain(outcome.commit.id.toLowerCase());
  });

  it('CAS 未命中时返回冲突值，且 commit / ChangeSet / ref 一行都没写', async () => {
    const entityManager = createEntityManager();
    const probe = createCommitGraphProbe({ rowsAffected: 0 });
    seedRef(probe, entityManager, { headRevision: 9 });

    const outcome = await writeCommit(
      probe.executor,
      plainCommitWriteContext(entityManager),
      createWriteInput({ expectedHeadRevision: 3 })
    );

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

    const outcome = await writeCommit(
      probe.executor,
      plainCommitWriteContext(entityManager),
      createWriteInput({ expectedHeadRevision: 5 })
    );

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

    const outcome = await writeCommit(probe.executor, plainCommitWriteContext(entityManager), createWriteInput());

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

    const outcome = await writeCommit(
      probe.executor,
      plainCommitWriteContext(entityManager),
      createWriteInput({ units })
    );

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

    const outcome = await writeCommit(probe.executor, plainCommitWriteContext(entityManager), input);

    expect(outcome).toEqual({ status: 'reused', commit: existing });
    // 重放推进 HEAD = 同一次提交被算了两次修订，另一个 Tab 手里的 revision 平白失效。
    expect(probe.statements).toEqual([]);
    expect(probe.saved).toEqual([]);
  });

  it('author 的首尾空白不参与幂等判定（与 message 同口径）', async () => {
    const entityManager = createEntityManager();
    const probe = createCommitGraphProbe({ rowsAffected: 1 });
    seedRef(probe, entityManager);
    const existing = seedExistingCommit(probe, entityManager, createWriteInput());

    // `message` 早就 trim 过（`resolveCommitMessage`），`author` 却原样进哈希。于是同一个人
    // 多打一个尾随空格，一次货真价实的重放被判成内容不符直接抛错——幂等恰好在它唯一要起
    // 作用的那条路径（上一次到底成没成功？重放一次看看）上失效。
    const outcome = await writeCommit(
      probe.executor,
      plainCommitWriteContext(entityManager),
      createWriteInput({ author: 'jimmy ' })
    );

    expect(outcome).toEqual({ status: 'reused', commit: existing });
  });

  it('落库的 author 也是归一化后的值，守卫按落库值重算才对得上', async () => {
    const entityManager = createEntityManager();
    const probe = createCommitGraphProbe({ rowsAffected: 1 });
    seedRef(probe, entityManager);

    const outcome = await writeCommit(
      probe.executor,
      plainCommitWriteContext(entityManager),
      createWriteInput({ author: '  jimmy  ' })
    );

    // 只在查重那一侧归一化是不够的：落库值与指纹用的值必须是同一个，否则
    // `commit-graph-guard.ts` 拿落库值重算会算出第三个指纹，健康的历史被判成损坏。
    if (outcome.status !== 'committed') expect.unreachable(`期望落库，实际 ${outcome.status}`);
    expect(outcome.commit.author).toBe('jimmy');
  });

  it('同 operationId 但内容不同时稳定报错，既不覆盖也不静默返回旧节点', async () => {
    const entityManager = createEntityManager();
    const probe = createCommitGraphProbe({ rowsAffected: 1 });
    seedRef(probe, entityManager);
    const input = createWriteInput();
    const existing = seedExistingCommit(probe, entityManager, input, { contentFingerprint: 'fp-other' });

    // 静默返回旧节点 = 用户以为这次改动提交了，实际没有，且历史里查不出差别。
    await expect(writeCommit(probe.executor, plainCommitWriteContext(entityManager), input)).rejects.toThrow(
      CommitOperationMismatchError
    );
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

    const outcome = await writeCommit(
      probe.executor,
      plainCommitWriteContext(entityManager),
      createWriteInput({ branchGeneration: 2 })
    );

    expect(outcome.status).toBe('committed');
    expect(probe.rowsOf(Commit)).toHaveLength(2);
  });

  it('CAS 成功后 INSERT 撞唯一约束 —— 原样抛出，不留下幽灵 HEAD', async () => {
    const entityManager = createEntityManager();
    const input = createWriteInput();
    const failure = new Error('UNIQUE constraint failed: rxdb_commit.operationId');
    const probe = createCommitGraphProbe({
      rowsAffected: 1,
      saveMany: async () => {
        // 就算「赢家」真的读得回来也不许降级：HEAD 已经指向我们这次的新 id，
        // 返回赢家等于让事务带着一个指向不存在 commit 的 ref 提交。
        seedExistingCommit(probe, entityManager, input);
        throw failure;
      }
    });
    seedRef(probe, entityManager);

    // CAS 命中意味着 headRevision 仍等于 expected。任何写下同一 operationId 的并发赢家，
    // 必然也已用自己的 CAS 把 headRevision 推到了 expected+1，我们的 CAS 就会先返回 0 行。
    // 所以「CAS 成功 + operationId 冲突」不可达；真发生了就是库态自相矛盾，只能整体回滚。
    await expect(writeCommit(probe.executor, plainCommitWriteContext(entityManager), input)).rejects.toThrow(failure);
    // 已经发过 CAS（HEAD 推进了）而本次的 commit 没落库 —— 任何 resolve 都会让外层事务提交。
    expect(probe.statements).toHaveLength(1);
    expect(probe.rowsOf(Commit).map(row => (row as Commit).id)).toEqual(['commit-existing']);
  });

  it('写失败之后不再补发任何恢复 SELECT（PGlite 的 aborted 事务里它必然二次报错）', async () => {
    const entityManager = createEntityManager();
    const probe = createCommitGraphProbe({
      rowsAffected: 1,
      saveMany: async () => {
        throw new Error('UNIQUE constraint failed: rxdb_commit.operationId');
      }
    });
    seedRef(probe, entityManager);

    await expect(
      writeCommit(probe.executor, plainCommitWriteContext(entityManager), createWriteInput())
    ).rejects.toThrow();

    // 只允许 CAS 之前那两次读：ref 一次、幂等探测一次。第三次读发生在一条失败语句之后，
    // Postgres/PGlite 上事务已 aborted，那条 SELECT 会把原始错误换成一条 25P02，
    // 真正的失败原因就此丢失。
    expect(probe.finds.map(call => call.entity)).toEqual(['CommitBranchRef', 'Commit']);
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
    await expect(
      writeCommit(probe.executor, plainCommitWriteContext(entityManager), createWriteInput())
    ).rejects.toThrow(failure);
  });
});
