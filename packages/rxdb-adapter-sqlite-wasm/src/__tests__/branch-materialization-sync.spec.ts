/**
 * metadata-only 远端分支的首次物化 —— 走官方同步插件的生产装配路径。
 *
 * 命题：只装官方插件（history + sync + working-tree），**一次都不手工登记物化来源**：
 *
 * 1. `syncBranches()` 落下的 metadata-only 分支，第一次 `switchBranch()` 就被完整物化并切过去；
 * 2. 网络失败、sync scope 漂移、分页中断都以稳定的 `BranchNotMaterializedError` 收场，
 *    来源分支保持 active、业务表一行不动；
 * 3. 中断之后重试（同进程，或重启之后换一个 RxDB 实例）从 durable staging 续传：
 *    冻结的水位不重算，已经落盘的页不重拉。
 *
 * 替身只在**远端**这一侧：本地 sqlite-wasm、工作树屏障、同步插件提供的来源全是真的。
 * 本文件不 import 任何「物化来源」相关的接口——在这里登记一个来源，等于在断言替身自己。
 */
import type {
  EntityType,
  IRepository,
  IRxDBAdapter,
  QueryCacheEntityMetadata,
  RemoteBranchInfo,
  RemoteChange,
  RuleGroup
} from '@aiao/rxdb';
import {
  Entity,
  EntityBase,
  getEntityMetadata,
  PropertyType,
  RxDB,
  RxDBAdapterRemoteBase,
  SyncType,
  uuid
} from '@aiao/rxdb';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { rxDBPluginSync } from '@aiao/rxdb-plugin-sync';
import { BranchNotMaterializedError, rxDBPluginWorkingTree } from '@aiao/rxdb-plugin-working-tree';
import sqliteWasmAsyncUrl from '@subframe7536/sqlite-wasm/wasm-async?url&inline';
import sqliteWasmUrl from '@subframe7536/sqlite-wasm/wasm?url&inline';
import { firstValueFrom, Observable, of } from 'rxjs';
import { afterEach, describe, expect, it } from 'vitest';
import { RxDBAdapterSqlite } from '../RxDBAdapterSqlite.js';

const LOCAL_ADAPTER = 'sqlite-wasm';
const REMOTE_ADAPTER = 'memory-remote';
const MAIN_BRANCH_ID = 'main';
const FEATURE_BRANCH_ID = 'feature';
const CASE_TIMEOUT = 30_000;

/**
 * `FilteredMemo` 的远端过滤条件
 *
 * @remarks
 * 故意是可变的模块级变量：scope 漂移用例要在「冻结意图之后、屏障之前」把它换掉，
 * 而实体元数据里的 `filter` 是个每次现取的函数——这正是真实应用里过滤条件随登录用户、
 * 权限等运行时状态变化的样子。每条用例开头都会复位。
 */
const VISIBLE_MEMOS: RuleGroup<Record<string, unknown>> = {
  combinator: 'and',
  rules: [{ field: 'body', operator: '=', value: 'visible' }]
};
let memoFilter: RuleGroup<Record<string, unknown>> = VISIBLE_MEMOS;

@Entity({
  name: 'MaterializedNote',
  tableName: 'materialized_notes',
  properties: [{ name: 'title', type: PropertyType.string }]
})
class MaterializedNote extends EntityBase {
  title!: string;
}

@Entity({
  name: 'MaterializedTag',
  tableName: 'materialized_tags',
  properties: [{ name: 'label', type: PropertyType.string }]
})
class MaterializedTag extends EntityBase {
  label!: string;
}

@Entity({
  name: 'FilteredMemo',
  tableName: 'filtered_memos',
  properties: [{ name: 'body', type: PropertyType.string }],
  sync: {
    type: SyncType.Filter,
    local: { adapter: LOCAL_ADAPTER },
    remote: { adapter: REMOTE_ADAPTER, filter: () => memoFilter }
  }
})
class FilteredMemo extends EntityBase {
  body!: string;
}

const ENTITIES: EntityType[] = [MaterializedNote, MaterializedTag, FilteredMemo];

/** 一张表在同步插件里的仓库键：`namespace:entity`，与 `pullChanges` 的 `repositoryFilter` 同形 */
const repositoryKeyOf = (EntityClass: EntityType): string => {
  const { namespace, name } = getEntityMetadata(EntityClass);
  return `${namespace}:${name}`;
};

/** 远端一次 `pullChanges` 调用的记录 */
interface PullCall {
  readonly repository: string;
  readonly sinceId: number;
  readonly branchId: string | undefined;
  readonly filter: RuleGroup | undefined;
}

/**
 * 远端替身的全部状态
 *
 * @remarks
 * 抽成独立对象而不是挂在适配器实例上：重启用例要换一个 RxDB 实例（于是换一个适配器实例），
 * 远端却必须还是同一个——计数器要跨两次启动累计，才能断言「重启之后没有重新冻结水位」。
 */
interface RemoteState {
  readonly changes: RemoteChange[];
  readonly branches: RemoteBranchInfo[];
  readonly pullCalls: PullCall[];
  getChangeCountCalls: number;
  /** 每次 `pullChanges` 进来时先调它；抛出即模拟这一次请求失败 */
  beforePull?: (call: PullCall) => void;
}

const matchesRepository = (change: RemoteChange, repositoryFilter: readonly string[] | undefined): boolean =>
  repositoryFilter === undefined || repositoryFilter.includes(`${change.namespace}:${change.entity}`);

/**
 * 远端替身：只有版本化同步（changelog + 分支）用得到的成员有真实内容。
 *
 * @remarks
 * `pullChanges` / `getChangeCount` 照真实远端的口径实现：分支**精确匹配**、id 升序、
 * `latestChangeId` 在没有变更时回落成 `sinceId`（Supabase 的行为）。
 * 过滤条件只记录不求值——本文件断言的是「来源把冻结的条件原样交给了远端」，
 * 远端怎么解释这个条件不在命题之内。
 *
 * 写入口一律 reject：物化只读远端，真被调到就是接线错了，不能让它静默通过。
 */
class MemoryChangelogRemote extends RxDBAdapterRemoteBase implements IRxDBAdapter {
  readonly #state: RemoteState;
  readonly name = REMOTE_ADAPTER;

  constructor(rxdb: RxDB, state: RemoteState) {
    super(rxdb);
    this.#state = state;
  }

  connect(): Promise<IRxDBAdapter> {
    return Promise.resolve(this);
  }

  disconnect(): Promise<void> {
    return Promise.resolve();
  }

  version(): Promise<string> {
    return Promise.resolve(REMOTE_ADAPTER);
  }

  /**
   * 同步插件的 `getRemoteRepositories()` 会顺手取系统表仓库句柄，但物化与分支同步都只用
   * 适配器本身；这里交一个空对象，谁真去调它上面的方法谁就当场报错。
   */
  getRepository<T extends EntityType, RT extends IRepository<T> = IRepository<T>>(): RT {
    return {} as RT;
  }

  saveMany(): Promise<never> {
    return Promise.reject(new Error('memory-remote: 物化不写远端'));
  }

  removeMany(): Promise<never> {
    return Promise.reject(new Error('memory-remote: 物化不写远端'));
  }

  mutations(): Promise<never> {
    return Promise.reject(new Error('memory-remote: 物化不写远端'));
  }

  isTableExisted(): Promise<boolean> {
    return Promise.resolve(true);
  }

  async pullChanges(
    sinceId: number,
    limit?: number,
    repositoryFilter?: string[],
    filter?: RuleGroup,
    branchId?: string
  ): Promise<RemoteChange[]> {
    const call: PullCall = { repository: (repositoryFilter ?? []).join(','), sinceId, branchId, filter };
    this.#state.pullCalls.push(call);
    this.#state.beforePull?.(call);
    const matched = this.#state.changes
      .filter(
        change => change.branchId === branchId && change.id > sinceId && matchesRepository(change, repositoryFilter)
      )
      .sort((a, b) => a.id - b.id);
    return structuredClone(limit === undefined ? matched : matched.slice(0, limit));
  }

  async getChangeCount(
    sinceId: number,
    repositoryFilter?: string[],
    branchId?: string
  ): Promise<{ count: number; latestChangeId: number }> {
    this.#state.getChangeCountCalls += 1;
    const matched = this.#state.changes.filter(
      change => change.branchId === branchId && change.id > sinceId && matchesRepository(change, repositoryFilter)
    );
    const latestChangeId = matched.reduce((max, change) => Math.max(max, change.id), sinceId);
    return { count: matched.length, latestChangeId };
  }

  mergeChanges(): Promise<never> {
    return Promise.reject(new Error('memory-remote: 物化不推送'));
  }

  override async pullBranches(): Promise<RemoteBranchInfo[]> {
    return structuredClone(this.#state.branches);
  }

  fetchMetadata(): Observable<QueryCacheEntityMetadata[]> {
    return of([]);
  }

  findByIds<T>(): Observable<T[]> {
    return of([]);
  }
}

const REMOTE_CREATED_AT = '2026-09-01T00:00:00.000Z';

/**
 * 一条远端 INSERT 变更
 *
 * @remarks
 * patch 是整行：真实远端交回来的 INSERT 就是整行（含 `EntityBase` 的五列），日期是 ISO 串。
 * 物化把它原样投影成本地行，缺列的话本地行会带着 `undefined` 落库，断言测到的就不是生产形状。
 */
const remoteInsert = (
  id: number,
  branchId: string,
  EntityClass: EntityType,
  fields: Record<string, unknown>
): RemoteChange => {
  const { namespace, name } = getEntityMetadata(EntityClass);
  const entityId = uuid();
  const createdAt = new Date(REMOTE_CREATED_AT);
  return {
    id,
    namespace,
    entity: name,
    entityId,
    branchId,
    type: 'INSERT',
    patch: {
      ...fields,
      id: entityId,
      createdAt: REMOTE_CREATED_AT,
      updatedAt: REMOTE_CREATED_AT,
      createdBy: null,
      updatedBy: null
    },
    inversePatch: null,
    clientId: 'remote-client',
    createdAt,
    updatedAt: createdAt
  };
};

/**
 * 远端现场：`main` 上一条笔记；`feature` 从 `main` 分出，带一条笔记、一条标签、一条备忘
 *
 * @remarks
 * `feature` 的 `fromChangeId` 必须是 `null`：非空时 `syncBranches()` 要把它翻译成本地的
 * `remoteId`，而本地一条远端变更都没拉过，翻译不出来的分支会被跳过（`unresolved-from-change-id`）。
 */
const createRemoteState = (): RemoteState => ({
  changes: [
    remoteInsert(1, MAIN_BRANCH_ID, MaterializedNote, { title: 'remote-main' }),
    remoteInsert(2, FEATURE_BRANCH_ID, MaterializedNote, { title: 'remote-feature' }),
    remoteInsert(3, FEATURE_BRANCH_ID, MaterializedTag, { label: 'remote-tag' }),
    remoteInsert(4, FEATURE_BRANCH_ID, FilteredMemo, { body: 'visible' })
  ],
  branches: [
    { id: MAIN_BRANCH_ID, parentId: null, fromChangeId: null },
    { id: FEATURE_BRANCH_ID, parentId: MAIN_BRANCH_ID, fromChangeId: null }
  ],
  pullCalls: [],
  getChangeCountCalls: 0
});

const openDatabases = new Set<RxDB>();

interface OpenDatabaseOptions {
  readonly dbName: string;
  readonly state: RemoteState;
  /** `true` 走 idb 持久化，给重启用例用；默认内存库 */
  readonly persistent?: boolean;
  /** 首次启动要 `enable()`；重启之后能力位已在库里，由插件连接期自举，不再调 */
  readonly enable?: boolean;
}

/**
 * 按生产装配顺序打开一个库：装插件 → 登记适配器 → 连接 → 取当前分支 → 启用提交能力
 *
 * @remarks
 * `getCurrentBranch()` 必须排在 `syncBranches()` 之前：本地 `main` 行只由它建，
 * 而远端 `feature` 以 `main` 为父，父不在本地时整批分支都落不了库。
 */
const openDatabase = async ({
  dbName,
  state,
  persistent = false,
  enable = true
}: OpenDatabaseOptions): Promise<RxDB> => {
  const rxdb = new RxDB({
    dbName,
    context: { userId: 'userId' },
    entities: ENTITIES,
    sync: { type: SyncType.Full, local: { adapter: LOCAL_ADAPTER }, remote: { adapter: REMOTE_ADAPTER } }
  });
  rxdb.use(rxDBPluginHistory);
  rxdb.use(rxDBPluginSync);
  rxdb.use(rxDBPluginWorkingTree);
  rxdb.adapter(
    LOCAL_ADAPTER,
    db =>
      new RxDBAdapterSqlite(db, {
        vfs: persistent ? 'idb' : 'memory',
        batchTimeout: 1,
        wasmUrl: persistent ? sqliteWasmAsyncUrl : sqliteWasmUrl
      })
  );
  rxdb.adapter(REMOTE_ADAPTER, db => new MemoryChangelogRemote(db, state));
  openDatabases.add(rxdb);

  await rxdb.connect(LOCAL_ADAPTER);
  await rxdb.connect(REMOTE_ADAPTER);
  await rxdb.versionManager.getCurrentBranch();
  if (enable) await rxdb.workingTree.enable();
  return rxdb;
};

const closeDatabase = async (rxdb: RxDB): Promise<void> => {
  openDatabases.delete(rxdb);
  await rxdb.disconnectAll();
};

/**
 * 库名要短：idb VFS 把它拼成 `/<库名>.sqlite.db`，再挂 `-journal` 之类的后缀，
 * 整条路径受 wa-sqlite `mxPathname = 64` 约束，超了 `sqlite3_open_v2` 直接失败。
 */
const uniqueDbName = (): string => `bm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const ALL_ROWS = { combinator: 'and' as const, rules: [] };

const readBranches = async (rxdb: RxDB) => {
  const { branchRepository } = await rxdb.versionManager.getLocalRepositories();
  return branchRepository.find({ where: ALL_ROWS });
};

const activeBranchIdOf = async (rxdb: RxDB): Promise<string | undefined> =>
  (await readBranches(rxdb)).find(branch => branch.activated)?.id;

const noteTitlesOf = async (rxdb: RxDB): Promise<string[]> => {
  const rows = await firstValueFrom(rxdb.entityManager.getRepository(MaterializedNote).find({ where: ALL_ROWS }));
  return rows.map(row => row.title).sort();
};

const tagLabelsOf = async (rxdb: RxDB): Promise<string[]> => {
  const rows = await firstValueFrom(rxdb.entityManager.getRepository(MaterializedTag).find({ where: ALL_ROWS }));
  return rows.map(row => row.label).sort();
};

const memoBodiesOf = async (rxdb: RxDB): Promise<string[]> => {
  const rows = await firstValueFrom(rxdb.entityManager.getRepository(FilteredMemo).find({ where: ALL_ROWS }));
  return rows.map(row => row.body).sort();
};

const saveNote = async (title: string): Promise<MaterializedNote> => {
  const note = new MaterializedNote();
  note.title = title;
  await note.save();
  return note;
};

/** 某一行在本地变更日志里记在哪些分支上 */
const changeBranchIdsOf = async (rxdb: RxDB, entityId: string): Promise<(string | undefined)[]> => {
  const { changeRepository } = await rxdb.versionManager.getLocalRepositories();
  const changes = await changeRepository.find({ where: ALL_ROWS });
  return changes.filter(change => change.entityId === entityId).map(change => change.branchId);
};

/** 断言一次切换以 `BranchNotMaterializedError` 失败，并交出它供进一步断言 */
const expectNotMaterialized = async (pending: Promise<unknown>): Promise<BranchNotMaterializedError> => {
  const error: unknown = await pending.then(
    () => undefined,
    (reason: unknown) => reason
  );
  expect(error).toBeInstanceOf(BranchNotMaterializedError);
  return error as BranchNotMaterializedError;
};

/**
 * 让第二张出现在拉取序列里的表的第一次拉取失败一次
 *
 * @returns 注入的错误；断言用它核对 `cause`
 *
 * @remarks
 * 不写死是哪张表：scope 的顺序由同步插件按依赖拓扑排出来，那是它的实现细节。
 * 「第二张表的第一次拉取」保证第一张表的页已经落盘，中断发生在分页中途。
 */
const failFirstPullOfSecondRepository = (state: RemoteState): Error => {
  const seen = new Set<string>();
  const failure = new TypeError('Failed to fetch');
  let failed = false;
  state.beforePull = call => {
    seen.add(call.repository);
    if (failed || seen.size < 2) return;
    failed = true;
    throw failure;
  };
  return failure;
};

/** 中断之前已经完整拉过的那张表；续传不得再从头拉它 */
const firstPulledRepositoryOf = (state: RemoteState): string => {
  const [first] = state.pullCalls;
  if (!first) throw new Error('远端一次 pullChanges 都没有收到');
  return first.repository;
};

/** 先 `syncBranches()`，并确认 `feature` 确实是以 metadata-only 形态落的库 */
const syncMetadataOnlyFeature = async (rxdb: RxDB): Promise<void> => {
  const result = await rxdb.syncManager.syncBranches();
  expect(result.created, 'syncBranches 没有落下远端分支').toBe(1);
  const feature = (await readBranches(rxdb)).find(branch => branch.id === FEATURE_BRANCH_ID);
  expect(feature, 'feature 分支没有落库').toMatchObject({ local: false, remote: true, activated: false });
};

describe('metadata-only 远端分支的首次物化（官方 sync + working-tree 装配）', () => {
  afterEach(async () => {
    memoFilter = VISIBLE_MEMOS;
    for (const rxdb of [...openDatabases]) await closeDatabase(rxdb);
  });

  it(
    'syncBranches 之后第一次 switchBranch 完整物化并切过去，切完的分支照常可写、可切回',
    async () => {
      const state = createRemoteState();
      const rxdb = await openDatabase({ dbName: uniqueDbName(), state });
      await saveNote('local-main');
      await syncMetadataOnlyFeature(rxdb);

      await rxdb.versionManager.switchBranch(FEATURE_BRANCH_ID);

      expect(await activeBranchIdOf(rxdb)).toBe(FEATURE_BRANCH_ID);
      // `remote-main` 在场是因为 feature 的祖先链整条都在 scope 里——与 `pull()` 的口径一致；
      // `local-main` 不在场是因为它是 main 上未推送的本地改动，切走时被回退。
      expect(await noteTitlesOf(rxdb)).toEqual(['remote-feature', 'remote-main']);
      expect(await tagLabelsOf(rxdb)).toEqual(['remote-tag']);
      expect(await memoBodiesOf(rxdb)).toEqual(['visible']);
      const memoPulls = state.pullCalls.filter(call => call.repository === repositoryKeyOf(FilteredMemo));
      expect(memoPulls.length, 'FilteredMemo 不在物化的 sync scope 里').toBeGreaterThan(0);
      expect(
        memoPulls.every(call => JSON.stringify(call.filter) === JSON.stringify(VISIBLE_MEMOS)),
        '拉取 FilteredMemo 时没有带上实体声明的过滤条件'
      ).toBe(true);

      // 物化出来的分支必须是一条正常分支：触发器按新 active 重建，新写入记在 feature 上。
      const featureNote = await saveNote('feature-local');
      expect(await changeBranchIdsOf(rxdb, featureNote.id)).toEqual([FEATURE_BRANCH_ID]);

      await rxdb.versionManager.switchBranch(MAIN_BRANCH_ID);

      expect(await activeBranchIdOf(rxdb)).toBe(MAIN_BRANCH_ID);
      const mainTitles = await noteTitlesOf(rxdb);
      expect(mainTitles).toContain('local-main');
      expect(mainTitles).not.toContain('feature-local');
      // 不断言 remote-* 行在 main 上的去留：拉取落下的行不进本地变更日志，
      // 切分支不会回退它们——这是 `pull()` 既有的口径，不是本条命题。
    },
    CASE_TIMEOUT
  );

  it(
    '拉取时网络失败：稳定地以 source_failed 拒绝，来源分支保持 active',
    async () => {
      const state = createRemoteState();
      const rxdb = await openDatabase({ dbName: uniqueDbName(), state });
      await saveNote('local-main');
      await syncMetadataOnlyFeature(rxdb);
      const failure = new TypeError('Failed to fetch');
      state.beforePull = () => {
        throw failure;
      };

      const error = await expectNotMaterialized(rxdb.versionManager.switchBranch(FEATURE_BRANCH_ID));

      expect(error.reason).toBe('source_failed');
      expect(error.branchId).toBe(FEATURE_BRANCH_ID);
      expect(error.cause).toBe(failure);
      expect(await activeBranchIdOf(rxdb)).toBe(MAIN_BRANCH_ID);
      expect(await noteTitlesOf(rxdb)).toEqual(['local-main']);
    },
    CASE_TIMEOUT
  );

  it(
    'sync scope 在冻结之后漂移：屏障以 intent_drift 拒绝；漂移稳定之后重试会重新冻结并成功',
    async () => {
      const state = createRemoteState();
      const rxdb = await openDatabase({ dbName: uniqueDbName(), state });
      await syncMetadataOnlyFeature(rxdb);
      const DRIFTED: RuleGroup<Record<string, unknown>> = {
        combinator: 'and',
        rules: [{ field: 'body', operator: '=', value: 'drifted' }]
      };
      // 第一次拉取时意图早已冻结：此刻换掉过滤条件，冻结的 scope 与屏障里现算的 scope 必然对不上。
      state.beforePull = () => {
        memoFilter = DRIFTED;
      };

      const error = await expectNotMaterialized(rxdb.versionManager.switchBranch(FEATURE_BRANCH_ID));

      expect(error.reason).toBe('intent_drift');
      expect(await activeBranchIdOf(rxdb)).toBe(MAIN_BRANCH_ID);
      expect(await noteTitlesOf(rxdb)).toEqual([]);

      state.beforePull = undefined;
      const freezesBeforeRetry = state.getChangeCountCalls;
      await rxdb.versionManager.switchBranch(FEATURE_BRANCH_ID);

      expect(await activeBranchIdOf(rxdb)).toBe(FEATURE_BRANCH_ID);
      expect(state.getChangeCountCalls, '漂移过的 staging 被原样续用了，没有重新冻结').toBeGreaterThan(
        freezesBeforeRetry
      );
      const retriedMemoPulls = state.pullCalls.filter(call => call.repository === repositoryKeyOf(FilteredMemo));
      expect(JSON.stringify(retriedMemoPulls.at(-1)?.filter)).toBe(JSON.stringify(DRIFTED));
    },
    CASE_TIMEOUT
  );

  it(
    '分页中断：以 source_failed 拒绝；重试从 staging 续传，不重算水位、不重拉已落盘的页',
    async () => {
      const state = createRemoteState();
      const rxdb = await openDatabase({ dbName: uniqueDbName(), state });
      await syncMetadataOnlyFeature(rxdb);
      const failure = failFirstPullOfSecondRepository(state);

      const error = await expectNotMaterialized(rxdb.versionManager.switchBranch(FEATURE_BRANCH_ID));

      expect(error.reason).toBe('source_failed');
      expect(error.cause).toBe(failure);
      expect(await activeBranchIdOf(rxdb)).toBe(MAIN_BRANCH_ID);
      const completedRepository = firstPulledRepositoryOf(state);
      const freezesBeforeRetry = state.getChangeCountCalls;
      const pullsBeforeRetry = state.pullCalls.length;

      await rxdb.versionManager.switchBranch(FEATURE_BRANCH_ID);

      expect(await activeBranchIdOf(rxdb)).toBe(FEATURE_BRANCH_ID);
      expect(await noteTitlesOf(rxdb)).toEqual(['remote-feature', 'remote-main']);
      expect(await tagLabelsOf(rxdb)).toEqual(['remote-tag']);
      expect(await memoBodiesOf(rxdb)).toEqual(['visible']);
      expect(state.getChangeCountCalls, '续传时重新冻结了水位').toBe(freezesBeforeRetry);
      const retriedRepositories = state.pullCalls.slice(pullsBeforeRetry).map(call => call.repository);
      expect(retriedRepositories, '续传把已落盘的那张表又拉了一遍').not.toContain(completedRepository);
    },
    CASE_TIMEOUT
  );

  it(
    '进程重启：换一个 RxDB 实例打开同一个持久化库，从 durable staging 续传',
    async () => {
      const state = createRemoteState();
      const dbName = uniqueDbName();
      const first = await openDatabase({ dbName, state, persistent: true });
      await syncMetadataOnlyFeature(first);
      failFirstPullOfSecondRepository(state);
      const error = await expectNotMaterialized(first.versionManager.switchBranch(FEATURE_BRANCH_ID));
      expect(error.reason).toBe('source_failed');
      const completedRepository = firstPulledRepositoryOf(state);
      await closeDatabase(first);
      state.beforePull = undefined;
      const freezesBeforeRestart = state.getChangeCountCalls;
      const pullsBeforeRestart = state.pullCalls.length;

      const second = await openDatabase({ dbName, state, persistent: true, enable: false });
      expect(await activeBranchIdOf(second)).toBe(MAIN_BRANCH_ID);
      await second.versionManager.switchBranch(FEATURE_BRANCH_ID);

      expect(await activeBranchIdOf(second)).toBe(FEATURE_BRANCH_ID);
      expect(await noteTitlesOf(second)).toEqual(['remote-feature', 'remote-main']);
      expect(await tagLabelsOf(second)).toEqual(['remote-tag']);
      expect(await memoBodiesOf(second)).toEqual(['visible']);
      expect(state.getChangeCountCalls, '重启之后重新冻结了水位').toBe(freezesBeforeRestart);
      const resumedRepositories = state.pullCalls.slice(pullsBeforeRestart).map(call => call.repository);
      expect(resumedRepositories, '重启之后把已落盘的那张表又拉了一遍').not.toContain(completedRepository);
    },
    CASE_TIMEOUT
  );
});
