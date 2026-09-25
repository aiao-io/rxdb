/**
 * @fileoverview 同步插件分支物化来源：分页、截止水位与续拉游标
 *
 * 端到端的切换（真实 sqlite、真实屏障、重启续传）在
 * `rxdb-adapter-sqlite-wasm/src/__tests__/branch-materialization-sync.spec.ts`。那边的远端每张表
 * 只有一两条变更，一页就拉完；本文件专测它碰不到的那一半——跨页、截到 cutoff、从半张表接着拉。
 * 这些都只依赖远端与冻结意图，不需要本地库。
 */

import {
  branchMaterializationPageFingerprint,
  getEntityMetadata,
  type BranchMaterializationIntent,
  type BranchMaterializationPage,
  type BranchMaterializationPagePayload,
  type RemoteChange,
  type RuleGroup,
  type TransactionExecutor
} from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import type { SyncManager } from '../SyncManager.js';
import { createSyncBranchMaterializationSource } from '../branch-materialization-source.js';
import { Tag, User } from './fixtures/test-entities.js';

const keyOf = (EntityClass: typeof User | typeof Tag): string => {
  const { namespace, name } = getEntityMetadata(EntityClass);
  return `${namespace}:${name}`;
};

const USER = keyOf(User);
const TAG = keyOf(Tag);

/** 远端一次 `pullChanges` 的记录 */
interface PullCall {
  readonly repository: string;
  readonly sinceId: number;
  readonly branchId: string | undefined;
}

/** 只实现 `pullChanges` 的远端替身：分支精确匹配、id 升序、截到 limit */
const createRemote = (changes: RemoteChange[]) => {
  const calls: PullCall[] = [];
  const remote = {
    async pullChanges(
      sinceId: number,
      limit: number,
      repositoryFilter: string[],
      _filter: RuleGroup | undefined,
      branchId: string | undefined
    ): Promise<RemoteChange[]> {
      calls.push({ repository: repositoryFilter.join(','), sinceId, branchId });
      return changes
        .filter(
          change =>
            change.branchId === branchId &&
            change.id > sinceId &&
            repositoryFilter.includes(`${change.namespace}:${change.entity}`)
        )
        .sort((a, b) => a.id - b.id)
        .slice(0, limit);
    }
  };
  return { remote, calls };
};

const changeOf = (EntityClass: typeof User | typeof Tag, id: number, branchId = 'main'): RemoteChange => {
  const { namespace, name } = getEntityMetadata(EntityClass);
  return {
    id,
    namespace,
    entity: name,
    entityId: `row-${id}`,
    branchId,
    type: 'INSERT',
    patch: { id: `row-${id}`, name: `n${id}` },
    inversePatch: null,
    createdAt: new Date(0),
    updatedAt: new Date(0)
  };
};

const range = (from: number, to: number): number[] => Array.from({ length: to - from + 1 }, (_, i) => from + i);

const createSource = (changes: RemoteChange[]) => {
  const { remote, calls } = createRemote(changes);
  const sm = {
    rxdb: { config: { entities: [User, Tag], sync: { remote: { adapter: 'remote' } } } },
    getRemoteRepositories: async () => ({ adapter: remote })
  } as unknown as SyncManager;
  return { source: createSyncBranchMaterializationSource(sm), calls };
};

const intentOf = (cutoffs: Record<string, number>, lineage = ['main']): BranchMaterializationIntent => ({
  syncScope: Object.keys(cutoffs),
  frozenRemoteWatermark: {
    lineage,
    cutoffs,
    filters: Object.fromEntries(Object.keys(cutoffs).map(key => [key, null]))
  }
});

const collect = async (pages: AsyncIterable<BranchMaterializationPagePayload>) => {
  const out: BranchMaterializationPagePayload[] = [];
  for await (const page of pages) out.push(page);
  return out;
};

const idsOf = (page: BranchMaterializationPagePayload): number[] =>
  (page.payload['changes'] as RemoteChange[]).map(change => change.id);

const asPage = (page: BranchMaterializationPagePayload, pageIndex: number): BranchMaterializationPage => ({
  ...page,
  pageIndex
});

describe('同步插件的分支物化来源', () => {
  describe('分页', () => {
    it('按 1000 条一页跨页拉，截到冻结的 cutoff 为止，最后一页收口', async () => {
      const { source } = createSource(range(1, 2500).map(id => changeOf(User, id)));
      const intent = intentOf({ [USER]: 2100 });

      const pages = await collect(
        source.pages({ targetBranchId: 'feature', intent, fromPageIndex: 0, previousPage: null })
      );

      expect(pages.map(page => [page.payload['lastId'], page.payload['done']])).toEqual([
        [1000, false],
        [2000, false],
        [2100, true]
      ]);
      expect(pages.flatMap(idsOf)).toEqual(range(1, 2100));
    });

    // 冻结之后远端又长出来的变更属于下一个时刻：交出去就与冻结水位对不上，settle 结算的
    // 水位会落在已经物化过的变更前面，下一次 pull 再拉一遍。
    it('冻结之后远端新增的变更不进页', async () => {
      const { source } = createSource([...range(1, 3), 9].map(id => changeOf(User, id)));

      const pages = await collect(
        source.pages({
          targetBranchId: 'feature',
          intent: intentOf({ [USER]: 3 }),
          fromPageIndex: 0,
          previousPage: null
        })
      );

      expect(pages.flatMap(idsOf)).toEqual([1, 2, 3]);
      expect(pages.at(-1)?.payload['done']).toBe(true);
    });

    it('满页恰好停在 cutoff 时直接收口，不再为这张表多发一次请求', async () => {
      const { source, calls } = createSource(range(1, 1000).map(id => changeOf(User, id)));

      await collect(
        source.pages({
          targetBranchId: 'feature',
          intent: intentOf({ [USER]: 1000 }),
          fromPageIndex: 0,
          previousPage: null
        })
      );

      expect(calls).toHaveLength(1);
    });

    it('cutoff 为 0 的表一次请求都不发', async () => {
      const { source, calls } = createSource([changeOf(Tag, 1)]);

      const pages = await collect(
        source.pages({
          targetBranchId: 'feature',
          intent: intentOf({ [USER]: 0, [TAG]: 1 }),
          fromPageIndex: 0,
          previousPage: null
        })
      );

      expect(calls.map(call => call.repository)).toEqual([TAG]);
      expect(pages.flatMap(idsOf)).toEqual([1]);
    });

    // 分支是 patch 模型：feature 上可见的数据 = 父分支的变更 + feature 自己的变更，
    // 父分支那些记录物理上仍归属 main。只拉 feature 会物化出一个缺了半截的快照。
    it('同一个水位对整条血缘各拉一次，合并后按 id 交', async () => {
      const { source, calls } = createSource([changeOf(User, 1, 'main'), changeOf(User, 2, 'feature')]);

      const pages = await collect(
        source.pages({
          targetBranchId: 'feature',
          intent: intentOf({ [USER]: 2 }, ['feature', 'main']),
          fromPageIndex: 0,
          previousPage: null
        })
      );

      expect(calls.map(call => call.branchId).sort()).toEqual(['feature', 'main']);
      expect(pages.flatMap(idsOf)).toEqual([1, 2]);
    });

    it('每一页都带着按公开口径算出的指纹', async () => {
      const { source } = createSource([changeOf(User, 1)]);

      const [page] = await collect(
        source.pages({
          targetBranchId: 'feature',
          intent: intentOf({ [USER]: 1 }),
          fromPageIndex: 0,
          previousPage: null
        })
      );

      expect(page.fingerprint).toBe(branchMaterializationPageFingerprint(page.payload));
    });
  });

  describe('续拉', () => {
    it('上一页没收口：同一张表从它的 lastId 接着拉', async () => {
      const changes = range(1, 1500).map(id => changeOf(User, id));
      const intent = intentOf({ [USER]: 1500 });
      const first = createSource(changes);
      const [firstPage] = await collect(
        first.source.pages({ targetBranchId: 'feature', intent, fromPageIndex: 0, previousPage: null })
      );

      const resumed = createSource(changes);
      const rest = await collect(
        resumed.source.pages({
          targetBranchId: 'feature',
          intent,
          fromPageIndex: 1,
          previousPage: asPage(firstPage, 0)
        })
      );

      expect(resumed.calls[0]).toMatchObject({ repository: USER, sinceId: 1000 });
      expect(rest.flatMap(idsOf)).toEqual(range(1001, 1500));
    });

    it('上一页已收口：换下一张表从头拉，已拉完的表不再请求', async () => {
      const changes = [changeOf(User, 1), changeOf(Tag, 2)];
      const intent = intentOf({ [USER]: 1, [TAG]: 2 });
      const first = createSource(changes);
      const [userPage] = await collect(
        first.source.pages({ targetBranchId: 'feature', intent, fromPageIndex: 0, previousPage: null })
      );

      const resumed = createSource(changes);
      const rest = await collect(
        resumed.source.pages({ targetBranchId: 'feature', intent, fromPageIndex: 1, previousPage: asPage(userPage, 0) })
      );

      expect(resumed.calls.map(call => call.repository)).toEqual([TAG]);
      expect(rest.flatMap(idsOf)).toEqual([2]);
    });

    it('游标指向冻结范围之外的表：抛，不猜从哪接', async () => {
      const { source } = createSource([]);
      const stray: BranchMaterializationPage = {
        pageIndex: 0,
        payload: { repository: 'public:Gone', sinceId: 0, lastId: 0, done: true, changes: [] },
        fingerprint: 'unused'
      };

      await expect(
        collect(
          source.pages({
            targetBranchId: 'feature',
            intent: intentOf({ [USER]: 1 }),
            fromPageIndex: 1,
            previousPage: stray
          })
        )
      ).rejects.toThrow(/public:Gone/);
    });
  });

  describe('屏障内成员', () => {
    it('projectPage 把页内变更压成一份切换动作', async () => {
      const { source } = createSource([]);
      const insert = changeOf(User, 1);
      const update: RemoteChange = {
        ...changeOf(User, 2),
        entityId: insert.entityId,
        type: 'UPDATE',
        patch: { name: 'renamed' },
        inversePatch: { name: 'n1' }
      };
      const payload = { repository: USER, sinceId: 0, lastId: 2, done: true, changes: [insert, update] };
      const intent = intentOf({ [USER]: 2 });

      const actions = await source.projectPage({
        targetBranchId: 'feature',
        intent,
        executor: {} as TransactionExecutor,
        page: { pageIndex: 0, payload, fingerprint: branchMaterializationPageFingerprint(payload) }
      });

      expect(actions.updates.size).toBe(0);
      expect([...actions.inserts.values()].map(action => action.patch)).toEqual([{ id: 'row-1', name: 'renamed' }]);
    });

    // 形状不对的意图接不下去；报成漂移，工作树就会作废它、重冻一份——而不是让每次切换都抛在同一处。
    it('意图不是本来源冻结的形状：报漂移，不碰执行器', async () => {
      const { source } = createSource([]);

      const drift = await source.resolveIntentDrift({
        targetBranchId: 'feature',
        intent: { syncScope: [USER], frozenRemoteWatermark: { cursor: 42 } },
        executor: {} as TransactionExecutor
      });

      expect(drift).toMatch(/不是同步插件冻结的形状/);
    });
  });
});
