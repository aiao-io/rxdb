/**
 * @fileoverview T023 红测试：提交图的落库形状与可达性遍历（FR-002/003/027）。
 *
 * @remarks
 * 契约见 `docs/working-tree/data-model.md` §2.3 / §2.4 与
 * `contracts/core-api.md` §3。实现目标是 `src/commit/change-unit.ts`（T034）、
 * `src/commit/write-commit.ts`（T035）与 `src/commit/list-commits.ts`（T037）。
 *
 * 本文件守的是**行的形状与遍历的判据**，不是 SQL。真实持久化与跨重启恢复由
 * `workingTreeCommitConformanceSuite` 在六个后端上验证（T042/T043）。
 *
 * 为什么这五组断言值得写：
 *
 * 1. **`firstParentId` 是冗余列，冗余列就是第二份真相**。它之所以存在只是为了让祖先遍历走
 *    `idx_commit_first_parent`。两处各写各的迟早会分叉，而分叉的那天没有任何报错：
 *    遍历走索引列、校验走 `parentIds`，两边各自自洽，只是看见的图不是同一张。
 *    把 `firstParentId === parentIds[0] ?? null` 钉在**构造函数出口**，分叉就不可能发生。
 * 2. **`changeSetCount` 同理**。它是给 FR-022 图校验用的「应该有几行」，一旦与实际写入的
 *    `CommitChangeSet` 行数不一致，图校验就会把健康的 commit 判成损坏，或者把真损坏的放过去。
 *    `sequence` 必须是稠密的 `0..n-1`：留空洞等于让「少写了一行」和「本来就跳号」不可区分。
 * 3. **指纹会长出第二个口径**。`WorkingTreeEntry.fingerprint` 与 commit 的
 *    `contentFingerprint` 天然会被分别实现，而它们必须能互相推导——否则「工作树里这个单元
 *    和已提交的那个是不是同一个内容」这个问题会有两个答案。所以单元指纹只有
 *    `computeChangeUnitFingerprint()` 一处，commit 指纹必须由它合成。
 *    摘要还必须**排除** `id` / `operationId` / `createdAt`：前两者是身份不是内容（重试会换
 *    `id` 却是同一次提交），`createdAt` 由数据库时钟给，构造期根本不知道它的值。
 * 4. **`patch` 会被浅拷贝**。`Object.assign(row, unit)` 一行就能过全部形状断言，但它让
 *    `CommitChangeSet.patch` 与工作树条目共享同一个对象。commit 之后工作树条目照常被清理/
 *    复用，于是**已经不可变的历史**会跟着变。data-model.md §2.4 要求「复制完整不可变恢复
 *    数据」，复制就是复制。
 * 5. **`listCommits` 会退化成全表扫描**。`find({ where: 全真 })` 再按 `createdAt` 排序，
 *    在单分支库上和可达性遍历给出一模一样的结果——要到有第二个分支、或有一个被 CAS 丢弃的
 *    悬挂 commit 时才炸。历史必须是「从这个分支的 ref 沿父链能走到的」，不是「表里有的」。
 */

import type { EntityManager } from '@aiao/rxdb';
import { RxDB, SyncType } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import type { CommitChangeUnit } from '../../commit/change-unit.js';
import { computeChangeUnitFingerprint, computeCommitContentFingerprint } from '../../commit/change-unit.js';
import { CommitBranchRef } from '../../commit/commit-branch-ref.entity.js';
import { CommitChangeSet } from '../../commit/commit-change-set.entity.js';
import { Commit } from '../../commit/commit.entity.js';
import { getCommitDetail, listCommits } from '../../commit/list-commits.js';
import type { BuildCommitRowsInput } from '../../commit/write-commit.js';
import { buildCommitRows } from '../../commit/write-commit.js';
import { rxDBPluginWorkingTree } from '../../plugin.js';
import { encodeWorkingTreePatch } from '../../working-tree/working-tree-patch-codec.js';
import { createMockAdapter } from '../fixtures/test-db-setup.js';
import type { CommitGraphProbe } from './fixtures/commit-graph-probe.js';
import { createCommitGraphProbe } from './fixtures/commit-graph-probe.js';
import { codecWith } from './fixtures/encrypted-entities.js';

/** 只为拿一个真的 {@link EntityManager}——commit 行要靠它 `instantiate()` 出来。 */
function createEntityManager(): EntityManager {
  const database = new RxDB({
    dbName: `rxdb-commit-graph-${Math.random().toString(36).slice(2)}`,
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

/** 造一个变更单元；`fingerprint` 走真实口径，不手填字面量。 */
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

/** 造一份 `buildCommitRows()` 入参；默认是一个单父的普通 commit。 */
function createInput(overrides: Partial<BuildCommitRowsInput> = {}): BuildCommitRowsInput {
  return {
    id: 'commit-1',
    kind: 'normal',
    parentIds: ['commit-0'],
    message: 'first',
    author: 'jimmy',
    operationId: '00000000-0000-4000-8000-000000000001',
    units: [createUnit()],
    ...overrides
  };
}

/**
 * 把一条 `id → parentIds` 的链写进探针，并把 ref 指向 `head`。
 *
 * @param probe - 目标探针
 * @param entityManager - 用来 `instantiate()` ref 行
 * @param graph - 每项是 `[id, parentIds]`；`parentIds` 的第 0 个就是第一父
 * @param head - ref 的 `headCommitId`，`null` 表示这个分支一次都没提交过
 *
 * @remarks
 * 它只写 `Commit` 与 `CommitBranchRef` 两张表，**不写 `CommitChangeSet`**。可达性问的是
 * 「沿父链走得到谁」，那是 commit 行之间的事；要变更集的用例自己用 {@link changeSetOf}
 * 补，因为那些用例要的正是「同一条历史里只有某几个 commit 动过某个实体」这种不齐整的布景，
 * 而顺手给每个 commit 都配一行只会让「筛掉了谁」无从分辨。
 */
const seedGraph = (
  probe: CommitGraphProbe,
  entityManager: EntityManager,
  graph: readonly (readonly [string, readonly string[]])[],
  head: string | null
): void => {
  probe.seed(
    Commit,
    graph.map(([id, parentIds]) => {
      const { commit } = buildCommitRows(
        entityManager,
        createInput({ id, parentIds: [...parentIds], operationId: `op-${id}` })
      );
      return commit;
    })
  );
  const ref = entityManager.instantiate(CommitBranchRef);
  ref.id = 'main';
  ref.branchId = 'main';
  ref.generation = 1;
  ref.headCommitId = head;
  ref.headRevision = graph.length;
  ref.status = 'ok';
  ref.corruptedAt = null;
  probe.seed(CommitBranchRef, [ref]);
};

/**
 * 造一行 `CommitChangeSet`，用来说明「这次提交动过哪个实体」。
 *
 * @param entityManager - 用来 `instantiate()`
 * @param commitId - 归属的 commit
 * @param entity - 这一行落在哪个实体上
 * @param sequence - 本行在该 commit 内的重放序号
 *
 * @remarks
 * 不走 `buildCommitRows()`：那条路一次只能给一个 commit 造**整组**行，而这里要的恰恰是
 * 逐行摆布——`id` 也因此写成可读的 `${commitId}-cs-${sequence}` 而不是 uuid，
 * 断言失败时能一眼看出是哪个 commit 的第几行。
 */
const changeSetOf = (entityManager: EntityManager, commitId: string, entity: string, sequence = 0): CommitChangeSet => {
  const row = entityManager.instantiate(CommitChangeSet);
  row.id = `${commitId}-cs-${sequence}`;
  row.commitId = commitId;
  row.sequence = sequence;
  row.unitId = `${commitId}-unit-${sequence}`;
  row.transactionId = null;
  row.namespace = 'app';
  row.entity = entity;
  row.entityId = `${entity.toLowerCase()}-1`;
  row.operation = 'update';
  row.patch = { title: 'after' };
  row.inversePatch = { title: 'before' };
  row.origin = 'local';
  return row;
};

/**
 * 给已落库的 commit 行补上「数据库时钟写的 `createdAt`」。
 *
 * @param probe - 目标探针；表里的每一行都必须在 `stamps` 里有值
 * @param stamps - commit id → 时间戳
 *
 * @remarks
 * `buildCommitRows()` 刻意不写 `createdAt`（时钟归数据库，见上面那条同名用例），所以探针里的行
 * 拿到的是 `undefined`。而 `undefined < date` 与 `undefined > date` **同时为假**——时间窗过滤
 * 会整体退化成「谁都放行」，于是一个把 `<` 写成 `>` 的实现在未补时钟的布景下照样全绿。
 * 补进去的就是真实库里 `CURRENT_TIMESTAMP` 写的那一列。
 *
 * 漏一行直接抛：漏掉的那行会安静地留在上面那个退化态里，而退化态不会让任何断言变红。
 */
const stampClock = (probe: CommitGraphProbe, stamps: Readonly<Record<string, Date>>): void => {
  for (const row of probe.rowsOf(Commit) as Commit[]) {
    const stamp = stamps[row.id];
    if (!stamp) throw new Error(`stampClock: commit '${row.id}' has no timestamp`);
    row.createdAt = stamp;
  }
};

describe('提交图（FR-002/003/027）', () => {
  describe('firstParentId 的不变量', () => {
    it('恒等于 parentIds[0] ?? null —— 0 / 1 / 2 父都成立', () => {
      const entityManager = createEntityManager();
      const cases: readonly (readonly [readonly string[], string | null])[] = [
        [[], null],
        [['commit-0'], 'commit-0'],
        [['commit-a', 'commit-b'], 'commit-a']
      ];

      for (const [parentIds, expected] of cases) {
        const { commit } = buildCommitRows(entityManager, createInput({ parentIds: [...parentIds] }));
        expect({ parentIds: commit.parentIds, firstParentId: commit.firstParentId }).toEqual({
          parentIds: [...parentIds],
          firstParentId: expected
        });
      }
    });

    it('父链是副本，改入参不会回写进已构造的行', () => {
      const entityManager = createEntityManager();
      const parentIds = ['commit-0'];
      const { commit } = buildCommitRows(entityManager, createInput({ parentIds }));

      parentIds.push('commit-x');

      // 共享数组会让「已经不可变的 commit」跟着调用方的临时变量变形。
      expect(commit.parentIds).toEqual(['commit-0']);
    });
  });

  describe('changeSetCount 与 sequence', () => {
    it('changeSetCount 等于实际写出的 ChangeSet 行数', () => {
      const entityManager = createEntityManager();
      const units = [
        createUnit({ unitId: 'unit-1', entityId: 'recipe-1' }),
        createUnit({ unitId: 'unit-1', entityId: 'recipe-2' }),
        createUnit({ unitId: 'unit-2', entityId: 'recipe-3' })
      ];

      const { commit, changeSets } = buildCommitRows(entityManager, createInput({ units }));

      // 图校验拿它当「应该有几行」。对不上就会把健康 commit 判成损坏，或放过真损坏。
      expect(commit.changeSetCount).toBe(changeSets.length);
      expect(changeSets).toHaveLength(3);
    });

    it('sequence 是稠密的 0..n-1，且按入参顺序排', () => {
      const entityManager = createEntityManager();
      const units = ['recipe-1', 'recipe-2', 'recipe-3'].map(entityId => createUnit({ entityId }));

      const { changeSets } = buildCommitRows(entityManager, createInput({ units }));

      // 留空洞 = 让「少写一行」与「本来就跳号」不可区分。
      expect(changeSets.map(row => row.sequence)).toEqual([0, 1, 2]);
      expect(changeSets.map(row => row.entityId)).toEqual(['recipe-1', 'recipe-2', 'recipe-3']);
      expect(new Set(changeSets.map(row => row.id)).size).toBe(3);
    });

    it('每行都指回本 commit，且 unitId / 事务归属原样带过', () => {
      const entityManager = createEntityManager();
      const units = [
        createUnit({ unitId: 'unit-1', transactionId: 'tx-1', entityId: 'recipe-1' }),
        createUnit({ unitId: 'unit-1', transactionId: 'tx-1', entityId: 'recipe-2' })
      ];

      const { changeSets } = buildCommitRows(entityManager, createInput({ id: 'commit-9', units }));

      expect(changeSets.map(row => row.commitId)).toEqual(['commit-9', 'commit-9']);
      // 完整事务共享同一个 unitId —— 拆散它就等于把原子写入拆成两笔独立变更。
      expect(changeSets.map(row => [row.unitId, row.transactionId])).toEqual([
        ['unit-1', 'tx-1'],
        ['unit-1', 'tx-1']
      ]);
    });
  });

  describe('contentFingerprint 的口径', () => {
    it('由 computeCommitContentFingerprint 合成，不是 buildCommitRows 自己再算一遍', () => {
      const entityManager = createEntityManager();
      const input = createInput();

      const { commit } = buildCommitRows(entityManager, input);

      // 两处各算各的迟早分叉，而分叉那天图校验会把健康 commit 判成损坏。
      expect(commit.contentFingerprint).toBe(
        computeCommitContentFingerprint({
          kind: input.kind,
          parentIds: input.parentIds,
          message: input.message,
          author: input.author,
          units: input.units
        })
      );
    });

    it('内容相同则指纹相同，内容任一处变化则指纹变化', () => {
      const entityManager = createEntityManager();
      const fingerprintOf = (overrides: Partial<BuildCommitRowsInput>): string =>
        buildCommitRows(entityManager, createInput(overrides)).commit.contentFingerprint;

      const baseline = fingerprintOf({});
      expect(fingerprintOf({})).toBe(baseline);

      const variants: readonly (readonly [string, Partial<BuildCommitRowsInput>])[] = [
        ['kind', { kind: 'baseline' }],
        ['parentIds', { parentIds: ['commit-other'] }],
        ['message', { message: 'second' }],
        ['author', { author: null }],
        ['units', { units: [createUnit({ patch: { title: 'different' } })] }]
      ];
      for (const [field, overrides] of variants) {
        expect({ field, fingerprint: fingerprintOf(overrides) }).not.toEqual({ field, fingerprint: baseline });
      }
    });

    it('单元顺序进摘要 —— 换序即换指纹', () => {
      const entityManager = createEntityManager();
      const first = createUnit({ entityId: 'recipe-1' });
      const second = createUnit({ entityId: 'recipe-2' });

      const forward = buildCommitRows(entityManager, createInput({ units: [first, second] }));
      const reversed = buildCommitRows(entityManager, createInput({ units: [second, first] }));

      // `sequence` 有序即语义有序：恢复要按序重放，摘要不认序就盖不住重放结果。
      expect(forward.commit.contentFingerprint).not.toBe(reversed.commit.contentFingerprint);
    });

    it('排除 id 与 operationId —— 它们是身份不是内容', () => {
      const entityManager = createEntityManager();

      const original = buildCommitRows(entityManager, createInput());
      const retried = buildCommitRows(
        entityManager,
        createInput({ id: 'commit-2', operationId: '00000000-0000-4000-8000-000000000002' })
      );

      expect(retried.commit.contentFingerprint).toBe(original.commit.contentFingerprint);
    });

    it('不写 createdAt —— 时钟归数据库，构造期不知道它的值', () => {
      const entityManager = createEntityManager();

      const { commit } = buildCommitRows(entityManager, createInput());

      // 构造期塞一个 `new Date()` 进去，同一份内容每次构造都会得到不同的行，
      // 而 `createdAt` 又不在摘要里——两处不一致就此固化，谁都发现不了。
      expect(commit.createdAt).not.toBeInstanceOf(Date);
    });
  });

  describe('ChangeSet 复制的是不可变恢复数据', () => {
    it('patch / inversePatch 按值深拷贝，事后改源单元不影响已构造的行', () => {
      const entityManager = createEntityManager();
      const patch: Record<string, unknown> = { title: 'after', tags: ['a'] };
      const inversePatch: Record<string, unknown> = { title: 'before', tags: [] };
      const units = [createUnit({ patch, inversePatch })];

      const { changeSets } = buildCommitRows(entityManager, createInput({ units }));
      patch['title'] = 'mutated';
      (patch['tags'] as string[]).push('b');
      inversePatch['title'] = 'mutated';

      const [row] = changeSets;
      // 共享引用 = commit 之后工作树条目被清理/复用时，已不可变的历史跟着变形。
      expect(row.patch).toEqual({ title: 'after', tags: ['a'] });
      expect(row.inversePatch).toEqual({ title: 'before', tags: [] });
      expect(row.patch).not.toBe(patch);
      expect(row.inversePatch).not.toBe(inversePatch);
    });

    it('null patch 原样保留为 null，不被补成空对象', () => {
      const entityManager = createEntityManager();
      const units = [createUnit({ operation: 'delete', patch: null })];

      const { changeSets } = buildCommitRows(entityManager, createInput({ units }));

      // 补成 `{}` 会让「删除」与「什么都没改的更新」在重放时不可区分。
      expect({ operation: changeSets[0].operation, patch: changeSets[0].patch }).toEqual({
        operation: 'delete',
        patch: null
      });
    });

    it('origin 原样带过 —— 远端同步来的单元照常入历史', () => {
      const entityManager = createEntityManager();
      const units = [createUnit({ origin: 'remote_sync' })];

      const { changeSets } = buildCommitRows(entityManager, createInput({ units }));

      expect(changeSets[0].origin).toBe('remote_sync');
    });
  });

  describe('listCommits 走可达性，不扫全表', () => {
    it('从 ref 的 head 沿父链回溯，最新在前', async () => {
      const entityManager = createEntityManager();
      const probe = createCommitGraphProbe();
      seedGraph(
        probe,
        entityManager,
        [
          ['c1', []],
          ['c2', ['c1']],
          ['c3', ['c2']]
        ],
        'c3'
      );

      const commits = await listCommits(probe.executor, { branchId: 'main' });

      expect(commits.map(commit => commit.id)).toEqual(['c3', 'c2', 'c1']);
    });

    it('不可达的 commit 不出现 —— 表里有 ≠ 这个分支的历史里有', async () => {
      const entityManager = createEntityManager();
      const probe = createCommitGraphProbe();
      seedGraph(
        probe,
        entityManager,
        [
          ['c1', []],
          ['c2', ['c1']],
          // CAS 丢掉的那一次提交：行还在表里，但没有任何 ref 指向它。
          ['dangling', ['c1']]
        ],
        'c2'
      );

      const commits = await listCommits(probe.executor, { branchId: 'main' });

      expect(commits.map(commit => commit.id)).toEqual(['c2', 'c1']);
    });

    it('每次查 Commit 都带 id 条件，不发全真 where', async () => {
      const entityManager = createEntityManager();
      const probe = createCommitGraphProbe();
      seedGraph(
        probe,
        entityManager,
        [
          ['c1', []],
          ['c2', ['c1']]
        ],
        'c2'
      );

      await listCommits(probe.executor, { branchId: 'main' });

      const commitFinds = probe.finds.filter(call => call.entity === 'Commit');
      expect(commitFinds.length).toBeGreaterThan(0);
      for (const call of commitFinds) {
        // 全真 where 在单分支库上给出一模一样的结果，要到有悬挂 commit 时才炸。
        expect(JSON.stringify(call.where)).toContain('"id"');
        expect(call.where.rules.length).toBeGreaterThan(0);
      }
    });

    it('多父 commit 的两条父链都可达', async () => {
      const entityManager = createEntityManager();
      const probe = createCommitGraphProbe();
      seedGraph(
        probe,
        entityManager,
        [
          ['root', []],
          ['left', ['root']],
          ['right', ['root']],
          ['merge', ['left', 'right']]
        ],
        'merge'
      );

      const commits = await listCommits(probe.executor, { branchId: 'main' });

      // 只走 `firstParentId` 会漏掉 `right` —— 而 FR-022 的损坏判定要求「完整可达父链」。
      expect(commits[0].id).toBe('merge');
      expect(new Set(commits.map(commit => commit.id))).toEqual(new Set(['merge', 'left', 'right', 'root']));
    });

    it('head 为 null 时返回空历史，不报错', async () => {
      const entityManager = createEntityManager();
      const probe = createCommitGraphProbe();
      seedGraph(probe, entityManager, [['orphan', []]], null);

      // 刚迁移完、一次都没提交过的库就是这个状态（`0004` 写的 ref 是 headCommitId=null）。
      await expect(listCommits(probe.executor, { branchId: 'main' })).resolves.toEqual([]);
    });

    it('limit 从 head 端截断', async () => {
      const entityManager = createEntityManager();
      const probe = createCommitGraphProbe();
      seedGraph(
        probe,
        entityManager,
        [
          ['c1', []],
          ['c2', ['c1']],
          ['c3', ['c2']]
        ],
        'c3'
      );

      const commits = await listCommits(probe.executor, { branchId: 'main', limit: 2 });

      expect(commits.map(commit => commit.id)).toEqual(['c3', 'c2']);
    });

    it('ChangeSet 只在按 commit 查时出现，listCommits 不顺手拉全部变更', async () => {
      const entityManager = createEntityManager();
      const probe = createCommitGraphProbe();
      seedGraph(probe, entityManager, [['c1', []]], 'c1');

      await listCommits(probe.executor, { branchId: 'main' });

      // 历史列表是元数据视图。顺手 join 变更集会让 100 个 commit 的列表拉出上万行。
      expect(probe.finds.filter(call => call.entity === 'CommitChangeSet')).toEqual([]);
    });
  });

  describe('listCommits 的后置过滤：先走完可达图，再筛（FR-012）', () => {
    /** 三节点线性历史 `c1 → c2 → c3`；**只有最老的 `c1`** 动过 `Note`。 */
    const seedChainWhereOnlyOldestTouchesNote = (probe: CommitGraphProbe, entityManager: EntityManager): void => {
      seedGraph(
        probe,
        entityManager,
        [
          ['c1', []],
          ['c2', ['c1']],
          ['c3', ['c2']]
        ],
        'c3'
      );
      probe.seed(CommitChangeSet, [
        changeSetOf(entityManager, 'c1', 'Note'),
        changeSetOf(entityManager, 'c2', 'Recipe'),
        changeSetOf(entityManager, 'c3', 'Recipe')
      ]);
    };

    /** 同一条链，三个节点的库时钟依次落在这三天上。 */
    const DAY_1 = new Date('2026-01-01T00:00:00.000Z');
    const DAY_2 = new Date('2026-02-01T00:00:00.000Z');
    const DAY_3 = new Date('2026-03-01T00:00:00.000Z');

    it('entity 过滤发生在遍历之后 —— 不匹配的节点仍然要把父指针交出来', async () => {
      const entityManager = createEntityManager();
      const probe = createCommitGraphProbe();
      seedChainWhereOnlyOldestTouchesNote(probe, entityManager);

      const commits = await listCommits(probe.executor, { branchId: 'main', entity: 'Note' });

      // 把 entity 下推进取 commit 的 WHERE，`c3` / `c2` 根本不会被取回来，它们的父指针跟着
      // 消失，于是 `c1` 不可达 —— 结果是 `[]`，长得像「这个实体从来没被改过」，而不像一个 bug。
      expect(commits.map(commit => commit.id)).toEqual(['c1']);
    });

    it('有后置过滤时 limit 不参与提前收兵 —— 否则「前 N 个里恰好没有」会被报成「一个都没有」', async () => {
      const entityManager = createEntityManager();
      const probe = createCommitGraphProbe();
      seedChainWhereOnlyOldestTouchesNote(probe, entityManager);

      const commits = await listCommits(probe.executor, { branchId: 'main', entity: 'Note', limit: 1 });

      // 拿 limit 当遍历预算的话，收够 `c3` 就停了，筛完是空的。limit 只能作用在**筛完之后**。
      expect(commits.map(commit => commit.id)).toEqual(['c1']);
    });

    it('没有任何节点动过那个实体时给空历史，而不是给全部', async () => {
      const entityManager = createEntityManager();
      const probe = createCommitGraphProbe();
      seedChainWhereOnlyOldestTouchesNote(probe, entityManager);

      // 「一个都没匹配上」与「没写过滤条件」必须给出不同的答案；筛不动就整份放行是最常见的退化。
      await expect(listCommits(probe.executor, { branchId: 'main', entity: 'Ingredient' })).resolves.toEqual([]);
    });

    it('since / until 都是闭区间 —— 边界上那一刻算在窗内', async () => {
      const entityManager = createEntityManager();
      const probe = createCommitGraphProbe();
      seedGraph(
        probe,
        entityManager,
        [
          ['c1', []],
          ['c2', ['c1']],
          ['c3', ['c2']]
        ],
        'c3'
      );
      stampClock(probe, { c1: DAY_1, c2: DAY_2, c3: DAY_3 });

      const since = await listCommits(probe.executor, { branchId: 'main', since: DAY_2 });
      const until = await listCommits(probe.executor, { branchId: 'main', until: DAY_2 });

      // 边界取在 `c2` 上，两侧各问一次：开区间会把 `c2` 从**两边同时**挤掉，
      // 而只问一侧的用例分不出「边界被排除」和「这一侧本来就没有」。
      expect(since.map(commit => commit.id)).toEqual(['c3', 'c2']);
      expect(until.map(commit => commit.id)).toEqual(['c2', 'c1']);
    });

    it('since 与 until 同时给时取交集，且不改变最新在前的顺序', async () => {
      const entityManager = createEntityManager();
      const probe = createCommitGraphProbe();
      seedGraph(
        probe,
        entityManager,
        [
          ['c1', []],
          ['c2', ['c1']],
          ['c3', ['c2']]
        ],
        'c3'
      );
      stampClock(probe, { c1: DAY_1, c2: DAY_2, c3: DAY_3 });

      const commits = await listCommits(probe.executor, { branchId: 'main', since: DAY_2, until: DAY_2 });

      expect(commits.map(commit => commit.id)).toEqual(['c2']);
    });

    it('时间窗先把结果筛空时，不再发那条按 commitId 的 in 查询', async () => {
      const entityManager = createEntityManager();
      const probe = createCommitGraphProbe();
      seedChainWhereOnlyOldestTouchesNote(probe, entityManager);
      stampClock(probe, { c1: DAY_1, c2: DAY_2, c3: DAY_3 });

      const commits = await listCommits(probe.executor, {
        branchId: 'main',
        entity: 'Note',
        until: new Date('2025-12-31T00:00:00.000Z')
      });

      expect(commits).toEqual([]);
      // 空 id 列表拼出来是 `IN ()`：那在几个后端上是**语法错误**而不是「零命中」，
      // 于是一次本该返回空历史的正常查询会以一条 SQL 报错收场。
      expect(probe.finds.filter(call => call.entity === 'CommitChangeSet')).toEqual([]);
    });
  });

  describe('getCommitDetail（FR-012）', () => {
    it('变更单元在 JS 侧按 sequence 升序，不依赖后端的返回顺序', async () => {
      const entityManager = createEntityManager();
      const probe = createCommitGraphProbe();
      seedGraph(probe, entityManager, [['c1', []]], 'c1');
      // 故意逆序塞进表里：不加 ORDER BY 时后端按什么顺序还行是它自己的事，实现不能指望它。
      probe.seed(CommitChangeSet, [
        changeSetOf(entityManager, 'c1', 'Recipe', 2),
        changeSetOf(entityManager, 'c1', 'Note', 0),
        changeSetOf(entityManager, 'c1', 'Ingredient', 1)
      ]);

      const detail = await getCommitDetail(probe.executor, codecWith(), 'c1');

      // 顺序错了就是把「先删后建」重放成「先建后删」——重放完的数据看起来完整，只是内容是错的。
      // `sequence` 本身不进 units（它是落库行的列，不是变更单元的内容），顺序就是它的全部语义，
      // 所以这里按 `unitId` 与 `entity` 两路各钉一遍。
      expect(detail.units.map(unit => unit.unitId)).toEqual(['c1-unit-0', 'c1-unit-1', 'c1-unit-2']);
      expect(detail.units.map(unit => unit.entity)).toEqual(['Note', 'Ingredient', 'Recipe']);
    });

    it('只带回本 commit 的变更集与它自己的父关系', async () => {
      const entityManager = createEntityManager();
      const probe = createCommitGraphProbe();
      seedGraph(
        probe,
        entityManager,
        [
          ['c1', []],
          ['c2', ['c1']]
        ],
        'c2'
      );
      probe.seed(CommitChangeSet, [
        changeSetOf(entityManager, 'c1', 'Note'),
        changeSetOf(entityManager, 'c2', 'Recipe')
      ]);

      const detail = await getCommitDetail(probe.executor, codecWith(), 'c2');

      expect(detail.commit.id).toBe('c2');
      expect(detail.units.map(unit => unit.unitId)).toEqual(['c2-unit-0']);
      // `parentIds` 转自 commit 行本身，不是另查一遍关系表 —— 两处各读各的迟早会分叉。
      expect(detail.parentIds).toEqual(['c1']);
    });

    it('patch 经 codec 解码后才交出去 —— bigint 不会退化成十进制串', async () => {
      const entityManager = createEntityManager();
      const probe = createCommitGraphProbe();
      seedGraph(probe, entityManager, [['c1', []]], 'c1');
      const codec = codecWith();
      // 落库态是 codec 编出来的那份，不是手写的字面量：手写一份就等于第二份编码口径。
      const target = { namespace: 'app', entity: 'Plain' };
      const row = changeSetOf(entityManager, 'c1', 'Plain');
      row.patch = encodeWorkingTreePatch(codec, target, { amount: 9007199254740993n });
      row.inversePatch = encodeWorkingTreePatch(codec, target, { amount: 1n });
      probe.seed(CommitChangeSet, [row]);

      const detail = await getCommitDetail(probe.executor, codec, 'c1');

      // 原样交出编码态的话，调用方要么自己再写一份解码器（第二份真相），要么把
      // `{$rxdbChangeValue:…}` 当成业务字段展示出去。两种都不会报错。
      expect(detail.units[0]?.patch).toEqual({ amount: 9007199254740993n });
      expect(detail.units[0]?.inversePatch).toEqual({ amount: 1n });
    });

    it('目标实体没在本进程注册时原样返回，不猜着解', async () => {
      const entityManager = createEntityManager();
      const probe = createCommitGraphProbe();
      seedGraph(probe, entityManager, [['c1', []]], 'c1');
      probe.seed(CommitChangeSet, [changeSetOf(entityManager, 'c1', 'Note')]);

      const detail = await getCommitDetail(probe.executor, codecWith(), 'c1');

      // 另一个 Tab / 另一个宿主可能只注册了部分实体；猜着解只会把值改坏。
      expect(detail.units[0]?.patch).toEqual({ title: 'after' });
    });

    it('commit 不存在时抛错并把 id 写进消息，不降级成空详情', async () => {
      const entityManager = createEntityManager();
      const probe = createCommitGraphProbe();
      seedGraph(probe, entityManager, [['c1', []]], 'c1');

      // 返回一个 units 为空的壳会让「这次提交什么都没改」与「这个 id 根本不存在」
      // 在调用方眼里一模一样，而后者意味着调用方手里的 id 来路不明。
      await expect(getCommitDetail(probe.executor, codecWith(), 'missing')).rejects.toThrow(
        "Commit 'missing' does not exist."
      );
    });
  });
});
