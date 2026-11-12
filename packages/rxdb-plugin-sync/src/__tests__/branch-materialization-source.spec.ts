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
  createEntitySyncResolver,
  getEntityMetadata,
  RxDBSync,
  SyncType,
  type BranchMaterializationIntent,
  type BranchMaterializationPage,
  type BranchMaterializationPagePayload,
  type RemoteChange,
  type RuleGroup,
  type SyncOptions,
  type TransactionExecutor
} from '@aiao/rxdb';
import { describe, expect, it, vi } from 'vitest';
import type { SyncManager } from '../SyncManager.js';
import { createSyncBranchMaterializationSource } from '../branch-materialization-source.js';
import { RemoteBackendMismatchError } from '../remote-backend.js';
import { Tag, User } from './fixtures/test-entities.js';

/** 冻结时远端的身份 */
const BACKEND = 'backend-a';

/** 远端被重建之后的身份 */
const REBUILT_BACKEND = 'backend-b';

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

/**
 * 只实现 `pullChanges` 与 `backendId` 的远端替身：分支精确匹配、id 升序、截到 limit
 *
 * @remarks
 * 身份放在可变的 `identity` 上：用例在某一次拉取里把它换掉，模拟分页途中远端被重建。
 */
const createRemote = (changes: RemoteChange[]) => {
  const calls: PullCall[] = [];
  const identity = { backendId: BACKEND };
  const remote = {
    backendId: vi.fn(async (): Promise<string> => identity.backendId),
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
  return { remote, calls, identity };
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
  const { remote, calls, identity } = createRemote(changes);
  const verifyRemoteBackend = vi.fn(async () => undefined);
  const reportError = vi.fn();
  const sm = {
    rxdb: {
      config: { entities: [User, Tag], sync: { remote: { adapter: 'remote' } } },
      syncState: { reportError }
    },
    verifyRemoteBackend,
    getRemoteRepositories: async () => ({ adapter: remote })
  } as unknown as SyncManager;
  return {
    source: createSyncBranchMaterializationSource(sm),
    calls,
    identity,
    remote,
    reportError,
    verifyRemoteBackend
  };
};

const intentOf = (
  cutoffs: Record<string, number>,
  lineage = ['main'],
  backendId = BACKEND
): BranchMaterializationIntent => ({
  syncScope: Object.keys(cutoffs),
  frozenRemoteWatermark: {
    backendId,
    lineage,
    cutoffs,
    filters: Object.fromEntries(Object.keys(cutoffs).map(key => [key, null]))
  }
});

/** 把一次 `pages()` 拉到抛错为止，交出抛错之前已经交出的页与那个错误 */
const collectUntilError = async (pages: AsyncIterable<BranchMaterializationPagePayload>) => {
  const out: BranchMaterializationPagePayload[] = [];
  try {
    for await (const page of pages) out.push(page);
  } catch (error) {
    return { pages: out, error };
  }
  return { pages: out, error: undefined };
};

const FULL_SYNC: SyncOptions = { type: SyncType.Full, local: { adapter: 'local' }, remote: { adapter: 'remote' } };

/**
 * 冻结与屏障两头都走得通的来源：本地读者、远端替身、同步记录表都是同一份
 *
 * @remarks
 * 目标分支取 `main`：血缘不必回读分支表，用例只关心冻结下来的远端身份怎么被后面几步使用。
 * 同步记录表按 id 存取，`settle` 新建与更新的行都留在 `records` 里供断言。
 */
const createFreezingSource = (remoteBackendId: string | null) => {
  const records = new Map<string, RxDBSync>();
  const syncReader = {
    find: vi.fn(async (options: { where: { rules: Array<{ field: string; value: unknown }> } }) => {
      const id = options.where.rules.find(rule => rule.field === 'id')?.value;
      const record = typeof id === 'string' ? records.get(id) : undefined;
      return record ? [record] : [];
    }),
    create: vi.fn(async (record: RxDBSync) => {
      records.set(record.id, record);
      return record;
    }),
    update: vi.fn(async (record: RxDBSync, patch: Partial<RxDBSync>) => Object.assign(record, patch))
  };
  const readers = {
    getRepository: (EntityClass: unknown) => (EntityClass === RxDBSync ? syncReader : { find: async () => [] })
  };
  const remote = {
    backendId: vi.fn(async (): Promise<string> => BACKEND),
    getChangeCount: vi.fn(async () => ({ count: 1, latestChangeId: 7 }))
  };
  const sm = {
    remoteBackendId,
    rxdb: {
      config: { entities: [User, Tag], sync: FULL_SYNC },
      entitySync: createEntitySyncResolver(FULL_SYNC),
      entityManager: { instantiate: () => Object.create(RxDBSync.prototype) as RxDBSync }
    },
    verifyRemoteBackend: vi.fn(async () => undefined),
    getLocalRepositories: async () => ({ adapter: readers }),
    getRemoteRepositories: async () => ({ adapter: remote })
  } as unknown as SyncManager;
  return {
    sm,
    records,
    remote,
    source: createSyncBranchMaterializationSource(sm),
    executor: readers as unknown as TransactionExecutor
  };
};

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
  describe('远端身份', () => {
    it('续拉之前先核对远端身份：冻结与续拉之间远端可能被重建', async () => {
      const { source, calls, verifyRemoteBackend } = createSource([changeOf(User, 1)]);

      await collect(
        source.pages({
          targetBranchId: 'feature',
          intent: intentOf({ [USER]: 1 }),
          fromPageIndex: 0,
          previousPage: null
        })
      );

      expect(verifyRemoteBackend).toHaveBeenCalledTimes(1);
      expect(calls.length).toBeGreaterThan(0);
    });

    it('远端身份对不上时一次远端请求都不发', async () => {
      const { source, calls, verifyRemoteBackend } = createSource([changeOf(User, 1)]);
      const mismatch = new Error('remote backend changed');
      verifyRemoteBackend.mockRejectedValue(mismatch);

      await expect(
        collect(
          source.pages({
            targetBranchId: 'feature',
            intent: intentOf({ [USER]: 1 }),
            fromPageIndex: 0,
            previousPage: null
          })
        )
      ).rejects.toBe(mismatch);
      expect(calls).toEqual([]);
    });

    // 首次物化时本地一条同步记录都没有，按记录核对的那一关拦不住：冻结在意图里的身份是唯一的凭据。
    it('远端已不是冻结时的那一个：一页都不拉，抛 RemoteBackendMismatchError 并写进 lastError', async () => {
      const { source, calls, identity, reportError } = createSource([changeOf(User, 1)]);
      identity.backendId = REBUILT_BACKEND;

      const { pages, error } = await collectUntilError(
        source.pages({
          targetBranchId: 'feature',
          intent: intentOf({ [USER]: 1 }),
          fromPageIndex: 0,
          previousPage: null
        })
      );

      expect(error).toBeInstanceOf(RemoteBackendMismatchError);
      expect(error).toMatchObject({ backendId: REBUILT_BACKEND, boundBackendIds: [BACKEND] });
      expect(reportError).toHaveBeenCalledWith(error);
      expect(pages).toEqual([]);
      expect(calls).toEqual([]);
    });

    // 冻结的截止 id 只在 A 的 id 空间里有意义：拿它去 B 上拉，交出来的是 B 的一段，续拉还会跳过 B 的另一段。
    it('分页途中远端被重建：重建之后拉到的那一页不交出去', async () => {
      const { source, remote, identity } = createSource(range(1, 1500).map(id => changeOf(User, id)));
      const pullChanges = remote.pullChanges.bind(remote);
      remote.pullChanges = async (sinceId, ...rest) => {
        if (sinceId >= 1000) identity.backendId = REBUILT_BACKEND;
        return pullChanges(sinceId, ...rest);
      };

      const { pages, error } = await collectUntilError(
        source.pages({
          targetBranchId: 'feature',
          intent: intentOf({ [USER]: 1500 }),
          fromPageIndex: 0,
          previousPage: null
        })
      );

      expect(pages.map(page => page.payload['lastId'])).toEqual([1000]);
      expect(error).toBeInstanceOf(RemoteBackendMismatchError);
      expect(error).toMatchObject({ backendId: REBUILT_BACKEND, boundBackendIds: [BACKEND] });
    });

    it('冻结时把远端身份与截止 id 一起冻进水位，身份先于截止 id 读取', async () => {
      const { source, remote } = createFreezingSource(BACKEND);

      const intent = await source.freezeIntent('main');

      expect(intent.frozenRemoteWatermark).toMatchObject({ backendId: BACKEND, cutoffs: { [USER]: 7, [TAG]: 7 } });
      expect(remote.backendId.mock.invocationCallOrder[0]).toBeLessThan(
        remote.getChangeCount.mock.invocationCallOrder[0]
      );
    });

    // 截止 id 写进游标，身份就得一起写：只写游标的话，新行盖的是本实例此刻认的身份，
    // 冻结之后远端被重建过，A 的截止 id 就会被当成 B 的游标，B 上那一段永远拉不到。
    it('settle 把截止 id 与冻结时的远端身份一起落进同步记录', async () => {
      const { source, records, executor } = createFreezingSource(REBUILT_BACKEND);
      const intent = intentOf({ [USER]: 7, [TAG]: 3 });

      await source.settle({ targetBranchId: 'feature', intent, executor });

      expect(records.get(`${USER}:feature`)).toMatchObject({ lastPullRemoteChangeId: 7, remoteBackendId: BACKEND });
      expect(records.get(`${TAG}:feature`)).toMatchObject({ lastPullRemoteChangeId: 3, remoteBackendId: BACKEND });
    });

    // 改绑（或首次核实）之后本实例认的是另一个远端：旧意图续不下去，报漂移让工作树作废它、按新远端重冻。
    it('本实例核实过的远端身份与冻结时不同：报漂移', async () => {
      const { sm, source, executor } = createFreezingSource(BACKEND);
      const intent = await source.freezeIntent('main');
      Object.assign(sm, { remoteBackendId: REBUILT_BACKEND });

      const drift = await source.resolveIntentDrift({ targetBranchId: 'main', intent, executor });

      expect(drift).toBe(`远端身份变了：冻结时 ${BACKEND}，现在 ${REBUILT_BACKEND}`);
    });

    // 新会话里还没跟远端打过照面，答不出远端变没变；交给 pages() 开拉之前那一次比对。
    it('本实例还没核实过远端身份：不凭它判漂移', async () => {
      const { sm, source, executor } = createFreezingSource(BACKEND);
      const intent = await source.freezeIntent('main');
      Object.assign(sm, { remoteBackendId: null });

      await expect(source.resolveIntentDrift({ targetBranchId: 'main', intent, executor })).resolves.toBeUndefined();
    });

    // 升级之前冻结、还没物化完的意图不带身份，认不出它属于哪个远端：按形状不符报漂移，作废重冻。
    it('不带远端身份的旧意图：报形状不符的漂移', async () => {
      const { source } = createSource([]);
      const legacy = { lineage: ['main'], cutoffs: { [USER]: 1 }, filters: { [USER]: null } };

      const drift = await source.resolveIntentDrift({
        targetBranchId: 'feature',
        intent: { syncScope: [USER], frozenRemoteWatermark: legacy },
        executor: {} as TransactionExecutor
      });

      expect(drift).toMatch(/不是同步插件冻结的形状/);
    });
  });

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

  describe('冻结意图', () => {
    // US-026：物化范围里的行级条件是租户边界，必须取实例覆盖后的生效 filter
    it('filters 取实例覆盖的生效 filter，不回读装饰器', async () => {
      const rule: RuleGroup = { combinator: 'and', rules: [{ field: 'name', operator: '=', value: 'mine' }] };
      const databaseSync: SyncOptions = {
        type: SyncType.Full,
        local: { adapter: 'local' },
        remote: { adapter: 'remote' }
      };
      const override: SyncOptions = {
        type: SyncType.Filter,
        local: { adapter: 'local' },
        remote: { adapter: 'remote', filter: () => rule }
      };
      const reader = { find: async () => [] };
      const remote = { backendId: async () => BACKEND, getChangeCount: async () => ({ latestChangeId: 0 }) };
      const sm = {
        rxdb: {
          config: { entities: [User, Tag], sync: databaseSync },
          entitySync: createEntitySyncResolver(databaseSync, new Map([[getEntityMetadata(User), override]]))
        },
        verifyRemoteBackend: async () => undefined,
        getLocalRepositories: async () => ({ adapter: { getRepository: () => reader } }),
        getRemoteRepositories: async () => ({ adapter: remote })
      } as unknown as SyncManager;

      const intent = await createSyncBranchMaterializationSource(sm).freezeIntent('main');

      expect((intent.frozenRemoteWatermark as { filters: Record<string, unknown> }).filters).toEqual({
        [USER]: rule,
        [TAG]: null
      });
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
