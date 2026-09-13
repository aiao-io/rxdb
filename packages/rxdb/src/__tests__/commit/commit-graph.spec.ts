/**
 * @fileoverview T023 红测试：提交图的落库形状与可达性遍历（FR-002/003/027）。
 *
 * @remarks
 * 契约见 `specs/001-working-tree-commits/data-model.md` §2.3 / §2.4 与
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

import { describe, expect, it } from 'vitest';
import type { CommitChangeUnit } from '../../commit/change-unit.js';
import { computeChangeUnitFingerprint, computeCommitContentFingerprint } from '../../commit/change-unit.js';
import { CommitBranchRef } from '../../commit/commit-branch-ref.entity.js';
import { Commit } from '../../commit/commit.entity.js';
import { listCommits } from '../../commit/list-commits.js';
import type { BuildCommitRowsInput } from '../../commit/write-commit.js';
import { buildCommitRows } from '../../commit/write-commit.js';
import type { EntityManager } from '../../entity/entity-manager.js';
import { SyncType } from '../../entity/metadata-options.interface.js';
import { RxDB } from '../../RxDB.js';
import { createMockAdapter } from '../fixtures/test-db-setup.js';
import { createCommitGraphProbe } from './fixtures/commit-graph-probe.js';

/** 只为拿一个真的 {@link EntityManager}——commit 行要靠它 `instantiate()` 出来。 */
function createEntityManager(): EntityManager {
  const database = new RxDB({
    dbName: `rxdb-commit-graph-${Math.random().toString(36).slice(2)}`,
    entities: [],
    sync: { local: { adapter: 'local' }, type: SyncType.None }
  });
  database.adapter('local', db => createMockAdapter(db));
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
    /** 把一条 `id → parentIds` 的链写进探针，并把 ref 指向 `head`。 */
    const seedGraph = (
      probe: ReturnType<typeof createCommitGraphProbe>,
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
});
