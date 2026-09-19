/**
 * @fileoverview 既有库接通（`RxDBSystemContribution.bootstrapExisting`）的连接期行为。
 *
 * @remarks
 * 这一组用例原本住在核心的 `RxDB.connect-lifecycle.spec.ts`
 * （`describe('连接握手校验 active 分支基数（FR-048）')`），跟着实现搬过来：
 * 握手曾经是 `RxDB.#assertActiveBranchCardinality`，抽包后核心那个私有方法整个没了，
 * 判定改由本包的贡献在 `bootstrapExisting` 里做。断言面一个字没改——改的只是**谁在被测**。
 *
 * 为什么必须搬而不是留在核心：核心今天已经读不到 `CommitCapabilityState`，
 * 「提交能力启没启用」这一问在包外没有答案，留下的用例只能靠断言一个它够不着的副作用来活。
 *
 * FR-048 的运行期那一半：schema 只拦得住「至多一个」（`RxDBBranch.activeKey` 可空唯一列），
 * 「至少一个」是空表也满足的条件，任何列约束都表达不了，只能在连接时判。
 * 判定放在**提交能力已启用**之后：未启用的库不该被一个它还没进入的语义拦在门外。
 *
 * 与 `commit/active-branch-cardinality.spec.ts` 的分工：那边直接调
 * `assertSingleActiveBranch` / `resolveSingleActiveBranch`，测的是**判定本身**；
 * 这边走完整的 `connect()`，测的是**判定有没有被接到连接路径上、以及那道启用门**。
 * 两边都绿而接线断掉，是判定函数单测唯一盖不住的形态。
 */

import {
  ACTIVE_BRANCH_KEY,
  AmbiguousActiveBranchError,
  NoActiveBranchError,
  RxDB,
  RxDBBranch,
  SyncType,
  type EntityType
} from '@aiao/rxdb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CommitCapabilityState } from '../../commit/commit-capability-state.entity.js';
import { rxDBPluginWorkingTree } from '../../plugin.js';
import { createCapabilityStateRow, createMockAdapter, type MockLocalAdapter } from '../fixtures/test-db-setup.js';

const databases = new Set<RxDB>();
let databaseSequence = 0;

const disposeDatabase = async (database: RxDB): Promise<void> => {
  databases.delete(database);
  await database.disconnectAll();
};

afterEach(async () => {
  const pending = Array.from(databases);
  databases.clear();
  await Promise.all(pending.map(database => database.disconnectAll()));
  vi.restoreAllMocks();
});

/**
 * 已启用的能力行；fixture 默认发的那行是未启用的（见 `createCapabilityStateRow`）。
 *
 * @remarks
 * 在 fixture 那一行上就地改两个字段，而不是另写一份字面量：三个版本号必须与进程常量
 * 逐一相等，否则 `assertSupportedCommitCapability` 会先于握手抛错，用例红在一个
 * 与 FR-048 无关的原因上。复制一份字面量就得手抄那三个号，抄完还会各自漂移。
 */
const createEnabledCapability = (): CommitCapabilityState => ({
  ...createCapabilityStateRow(),
  enabled: true,
  enabledAt: new Date()
});

/**
 * 造一行 active 分支。
 *
 * @remarks
 * 多 active 那条用例里两行都带着同一个 `activeKey` —— 真库上它撞唯一索引，进不来；
 * 而握手要覆盖的正是**索引补上之前**就已经两行 active 的既有库（见核心
 * `system/active-branch-guard.ts` 的 fileoverview 末段）。替身没有索引，正好造得出这个现场。
 */
const createActiveBranch = (id: string) =>
  ({
    id,
    activated: true,
    activeKey: ACTIVE_BRANCH_KEY,
    local: true,
    remote: false
  }) satisfies Partial<RxDBBranch>;

/** 只替换点名实体的仓库，其余原样走 fixture 的默认桩。 */
const stubRepositories = (adapter: MockLocalAdapter, rows: ReadonlyMap<EntityType, object[]>): void => {
  const defaultGetRepository = adapter.getRepository.getMockImplementation();
  adapter.getRepository.mockImplementation(EntityType => {
    const stubbed = rows.get(EntityType);
    if (!stubbed) return defaultGetRepository?.(EntityType) as never;
    return {
      find: vi.fn(async () => stubbed),
      count: vi.fn(async () => stubbed.length),
      create: vi.fn(async (entity: object) => entity),
      update: vi.fn(async (entity: object) => entity),
      remove: vi.fn(async (entity: object) => entity)
    } as never;
  });
};

/**
 * 造一个走**既有库**路径、且装了本插件的实例。
 *
 * @remarks
 * 两个前置都不可省：
 *
 * - `use()` 必须赶在 `init()` 之前——十张系统表是插件贡献的，晚了核心当场拒绝；
 * - `isTableExisted` 必须为真——`bootstrapExisting` 只在既有库路径上被调用。
 *   这不是为了绕开什么：「零 active」「两行 active」本来就只可能是别人留下的状态，
 *   首装路径那一行 `main` 是同一次 `createTables` 刚写下的。
 */
const createDatabaseWith = (rows: ReadonlyMap<EntityType, object[]>): RxDB => {
  databaseSequence += 1;
  const database = new RxDB({
    dbName: `rxdb-plugin-bootstrap-existing-${databaseSequence}`,
    entities: [],
    sync: { local: { adapter: 'local' }, type: SyncType.None }
  });
  const adapter = createMockAdapter(database);
  vi.mocked(adapter.isTableExisted).mockResolvedValue(true);
  stubRepositories(adapter, rows);
  database.adapter('local', () => adapter);
  database.use(rxDBPluginWorkingTree);
  database.init();
  databases.add(database);
  return database;
};

describe('既有库接通时校验 active 分支基数（FR-048）', () => {
  it('启用后零 active 分支的库连接被拒，而不是被静默挪到 main', async () => {
    const database = createDatabaseWith(
      new Map<EntityType, object[]>([
        [CommitCapabilityState, [createEnabledCapability()]],
        [RxDBBranch, []]
      ])
    );

    await expect(database.connect('local')).rejects.toBeInstanceOf(NoActiveBranchError);
  });

  it('启用后多 active 分支的库连接被拒，不猜一个当当前分支', async () => {
    const database = createDatabaseWith(
      new Map<EntityType, object[]>([
        [CommitCapabilityState, [createEnabledCapability()]],
        [RxDBBranch, [createActiveBranch('feature-x'), createActiveBranch('main')]]
      ])
    );

    await expect(database.connect('local')).rejects.toThrow(AmbiguousActiveBranchError);
  });

  it('启用后恰好一行 active 的库照常连上', async () => {
    const database = createDatabaseWith(
      new Map<EntityType, object[]>([
        [CommitCapabilityState, [createEnabledCapability()]],
        [RxDBBranch, [createActiveBranch('main')]]
      ])
    );

    await expect(database.connect('local')).resolves.toBeDefined();

    await disposeDatabase(database);
  });

  // 这一条才是「门」本身：未启用的库连一行分支都没有也得连得上，否则新不变量会把
  // 所有还没启用提交能力的既有库挡在外面——FR-048 的措辞是「启用后 MUST 保证」。
  it('未启用提交能力的库不被这个不变量拦住', async () => {
    const database = createDatabaseWith(new Map<EntityType, object[]>([[RxDBBranch, []]]));

    await expect(database.connect('local')).resolves.toBeDefined();

    await disposeDatabase(database);
  });
});
