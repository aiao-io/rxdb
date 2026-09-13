/**
 * @fileoverview T022 红测试：数据库级提交能力的一次性启用与版本协商（FR-037）。
 *
 * @remarks
 * 契约见 `specs/001-working-tree-commits/contracts/core-api.md` §2 与
 * `data-model.md` §2.1。实现目标是 `src/commit/commit-capability.ts`（T031）。
 *
 * 本文件守的是**仲裁者只有一个**这件事，不是 SQL 方言。真实建表与执行行为由
 * `workingTreeCommitConformanceSuite` 在六个后端上验证（T042/T043）；unit 层再复制一份
 * 内存 SQL 引擎只会多出一个谁都不信的第三方版本。
 *
 * 为什么这几组断言值得写：
 *
 * 1. **CAS 会退化成「读一下再写」**。`enabled` 是布尔、行是单行，最自然的写法就是
 *    `if (!row.enabled) row.enabled = true`。它在单测里、在单 Tab 里、在六个后端上
 *    全都是绿的——只有两个 Tab 同时首次启用时才会各写一次，把 `enabledAt` 覆盖成
 *    后到的那个，而 `enabledAt` 是唯一能回答「这个库什么时候进的 v1 语义」的字段。
 *    把「恰好一条语句、条件恰好是 `id='default' AND enabled=false`」钉死，读改写写法
 *    过不了。
 * 2. **幂等会被写成「先查再决定」**。查到 `enabled=true` 就 return 看起来同样幂等，
 *    但它把仲裁权从数据库挪回进程：查与写之间的窗口里，另一个 writer 的首次启用会被
 *    本次调用覆盖。这里要求的幂等是**命中 0 行**，即数据库自己说的「你不是第一个」。
 * 3. **版本字段会被顺手重写**。启用时手边就有三个进程常量，把它们一起 `SET` 进去是
 *    一行的事，而且在版本没变的那天完全看不出来——要到某个客户端带着新常量连上旧库、
 *    把旧库的版本行悄悄改成新版本时才炸，那时 fail-closed 已经失效了。
 * 4. **不匹配会被写成「大于才拒」**。`assertSupportedRxDBSystemVersions()` 就是那么写的，
 *    照抄它是最可能的实现。但系统 schema 有迁移阶梯把 `<` 的缺口补上，能力三元组在 v1
 *    **没有任何阶梯**：存低于进程常量的值意味着这行是旧库写的、且永远不会有人更新它。
 *    严格相等是唯一诚实的答案。
 */

import { describe, expect, it, vi } from 'vitest';
import {
  COMMIT_CAPABILITY_STATE_ID,
  COMMIT_GRAPH_SCHEMA_VERSION,
  COMMIT_PROTOCOL_VERSION,
  CommitCapabilityState
} from '../../commit/commit-capability-state.entity.js';
import type { CommitCapabilityInfo } from '../../commit/commit-capability.js';
import {
  assertSupportedCommitCapability,
  enableCommitCapability,
  isCommitCapabilityEnabled,
  readCommitCapability,
  SUPPORTED_COMMIT_CAPABILITY_VERSIONS
} from '../../commit/commit-capability.js';
import type { EntityManager } from '../../entity/entity-manager.js';
import type { EntityType } from '../../entity/entity.interface.js';
import { SyncType } from '../../entity/metadata-options.interface.js';
import type { IRepository } from '../../repository/repository.interface.js';
import { getEntityMetadata } from '../../rxdb-utils.js';
import { RxDB } from '../../RxDB.js';
import { RXDB_CHANGE_CODEC_VERSION } from '../../system/change-codec.js';
import { UnsupportedRxDBSystemVersionError } from '../../system/migration.js';
import type { TransactionExecutor } from '../../transaction/transaction-executor.interface.js';
import { createMockAdapter } from '../fixtures/test-db-setup.js';

/** 只为拿一个真的 {@link EntityManager}——能力行要靠它 `instantiate()` 出来。 */
function createEntityManager(): EntityManager {
  const database = new RxDB({
    dbName: `rxdb-commit-capability-${Math.random().toString(36).slice(2)}`,
    entities: [],
    sync: { local: { adapter: 'local' }, type: SyncType.None }
  });
  database.adapter('local', db => createMockAdapter(db));
  database.init();
  return database.entityManager;
}

/** 造一行能力行；默认是 `0004` 迁移刚写完的样子：表已建、版本已填、尚未启用。 */
function createCapabilityRow(
  entityManager: EntityManager,
  overrides: Partial<CommitCapabilityState> = {}
): CommitCapabilityState {
  const row = entityManager.instantiate(CommitCapabilityState);
  row.id = COMMIT_CAPABILITY_STATE_ID;
  row.enabled = false;
  row.protocolVersion = COMMIT_PROTOCOL_VERSION;
  row.schemaVersion = COMMIT_GRAPH_SCHEMA_VERSION;
  row.codecVersion = RXDB_CHANGE_CODEC_VERSION;
  row.enabledAt = null;
  return Object.assign(row, overrides);
}

interface CapabilityProbe {
  readonly executor: TransactionExecutor;
  /** 按调用顺序记下经 `executor.query()` 发出的全部语句 */
  readonly statements: string[];
  /** 按调用顺序记下经 ORM `update()` 发出的全部 patch —— 期望恒为空 */
  readonly patches: Partial<CommitCapabilityState>[];
}

/**
 * 最小 {@link TransactionExecutor} 替身：只模拟能力行这一张表。
 *
 * @param row - 库里的能力行；`null` 表示这张表里一行都没有（`0004` 没跑）
 *
 * @remarks
 * `query()` 不解析 SQL，只**复现 CAS 的判据**：行存在且 `enabled` 仍为 `false` 才算命中，
 * 命中时把行改成启用态并从语句里取回内联的 `enabledAt`。取不回就直接抛——那说明启用
 * 时刻不在这条语句里，也就意味着实现多发了一条写语句，幂等判定不再由单条语句独占。
 */
function createCapabilityProbe(row: CommitCapabilityState | null): CapabilityProbe {
  const statements: string[] = [];
  const patches: Partial<CommitCapabilityState>[] = [];
  const repository: IRepository<EntityType> = {
    find: vi.fn(async () => (row ? [row as InstanceType<EntityType>] : [])),
    count: vi.fn(async () => (row ? 1 : 0)),
    create: vi.fn(async entity => entity),
    update: vi.fn(async (entity, patch) => {
      patches.push(patch as Partial<CommitCapabilityState>);
      return Object.assign(entity, patch);
    }),
    remove: vi.fn(async entity => entity)
  };
  const executor: TransactionExecutor = {
    id: 'capability-probe-executor',
    state: 'active',
    query: vi.fn(async (sql: string) => {
      statements.push(sql);
      if (!row || row.enabled) return { rowsAffected: 0, rows: [], columns: [] };
      const enabledAt = /'(\d{4}-\d{2}-\d{2}T[\d:.]+Z)'/.exec(sql)?.[1];
      if (!enabledAt) throw new Error(`CAS statement carries no inline enabledAt: ${sql}`);
      row.enabled = true;
      row.enabledAt = new Date(enabledAt);
      return { rowsAffected: 1, rows: [], columns: [] };
    }),
    mutations: vi.fn(async () => []),
    getRepository: () => repository,
    saveMany: vi.fn(async entities => entities) as TransactionExecutor['saveMany'],
    removeMany: vi.fn(async entities => entities),
    mergeChanges: vi.fn(async () => undefined),
    run: fn => fn(executor)
  };
  return { executor, statements, patches };
}

/** 空白归一 + 小写，便于对语句形状做断言。 */
const normalize = (sql: string): string => sql.replace(/\s+/g, ' ').trim().toLowerCase();

/** 取 `SET` 与 `WHERE` 之间那一段。 */
const setClauseOf = (sql: string): string => /\bset\b(.*?)\bwhere\b/s.exec(normalize(sql))?.[1] ?? '';

/** 取 `WHERE` 之后那一段。 */
const whereClauseOf = (sql: string): string => /\bwhere\b(.*)$/s.exec(normalize(sql))?.[1] ?? '';

const CAPABILITY_TABLE = getEntityMetadata(CommitCapabilityState).tableName;

describe('提交能力启用（FR-037）', () => {
  it('SUPPORTED_COMMIT_CAPABILITY_VERSIONS 取自三个进程常量，不是自己抄的字面量', () => {
    // 三个号各自独立演进（见 commit-capability-state.entity.ts 的 TSDoc）。
    // 抄成字面量之后，bump 常量的人不会有任何一处编译失败。
    expect(SUPPORTED_COMMIT_CAPABILITY_VERSIONS).toEqual({
      protocolVersion: COMMIT_PROTOCOL_VERSION,
      schemaVersion: COMMIT_GRAPH_SCHEMA_VERSION,
      codecVersion: RXDB_CHANGE_CODEC_VERSION
    });
  });

  it('启用恰好发一条 CAS 语句，条件是 id = default 且 enabled = false', async () => {
    const entityManager = createEntityManager();
    const { executor, statements } = createCapabilityProbe(createCapabilityRow(entityManager));

    await enableCommitCapability(executor);

    expect(statements).toHaveLength(1);
    const [sql] = statements;
    expect(normalize(sql)).toMatch(new RegExp(`^update\\b[^]*\\b${CAPABILITY_TABLE}\\b`));
    // 单条语句是幂等判据的全部：拆成两条就有了「第一条中了、第二条没中」的中间态。
    expect(normalize(sql).replace(/;$/, '')).not.toContain(';');
    expect(whereClauseOf(sql)).toContain(`'${COMMIT_CAPABILITY_STATE_ID}'`);
    expect(whereClauseOf(sql)).toMatch(/\benabled\b[^]*=\s*false\b/);
    expect(setClauseOf(sql)).toMatch(/\benabled\b[^]*=\s*true\b/);
    // 六个后端共用这一份语句，占位符方言（`$1` 与 `?`）一旦进来就必须在这里分叉。
    expect(sql).not.toMatch(/[?]|\$\d/);
  });

  it('CAS 的 SET 子句只写 enabled 与 enabledAt —— 三个版本字段启用后只读', async () => {
    const entityManager = createEntityManager();
    const { executor, statements, patches } = createCapabilityProbe(createCapabilityRow(entityManager));

    await enableCommitCapability(executor);

    const setClause = setClauseOf(statements[0]);
    // 启用时刻与 enabled 同处一条语句，才谈得上「命中 0 行 = 不覆盖」。
    expect(setClause).toContain('enabledat');
    expect(setClause).not.toContain('protocolversion');
    expect(setClause).not.toContain('schemaversion');
    expect(setClause).not.toContain('codecversion');
    // ORM 侧也不许补刀：多一条 UPDATE 就等于多一个能改这三列的入口。
    expect(patches).toEqual([]);
  });

  it('首次启用返回启用态，版本字段取自库里那一行，enabledAt 由本次调用写入', async () => {
    const entityManager = createEntityManager();
    const row = createCapabilityRow(entityManager);
    const { executor } = createCapabilityProbe(row);
    const before = Date.now();

    const info = await enableCommitCapability(executor);

    expect({
      enabled: info.enabled,
      protocolVersion: info.protocolVersion,
      schemaVersion: info.schemaVersion,
      codecVersion: info.codecVersion
    }).toEqual({
      enabled: true,
      protocolVersion: COMMIT_PROTOCOL_VERSION,
      schemaVersion: COMMIT_GRAPH_SCHEMA_VERSION,
      codecVersion: RXDB_CHANGE_CODEC_VERSION
    });
    expect(info.enabledAt).toBeInstanceOf(Date);
    expect(info.enabledAt?.getTime()).toBeGreaterThanOrEqual(before);
    expect(row.enabled).toBe(true);
  });

  it('重复启用命中 0 行即幂等：不报错、不重置版本、不覆盖 enabledAt', async () => {
    const entityManager = createEntityManager();
    const enabledAt = new Date('2020-01-01T00:00:00.000Z');
    const row = createCapabilityRow(entityManager, { enabled: true, enabledAt });
    const { executor, statements, patches } = createCapabilityProbe(row);

    const info = await enableCommitCapability(executor);

    // 命中 0 行 = 数据库自己说的「你不是第一个」。这是幂等的**判据**，不是事后的宽容。
    expect(info).toEqual({
      enabled: true,
      protocolVersion: COMMIT_PROTOCOL_VERSION,
      schemaVersion: COMMIT_GRAPH_SCHEMA_VERSION,
      codecVersion: RXDB_CHANGE_CODEC_VERSION,
      enabledAt
    });
    expect(row.enabledAt).toBe(enabledAt);
    expect(statements).toHaveLength(1);
    expect(patches).toEqual([]);
  });

  it('版本不匹配时 fail-closed，且一条语句都不发', async () => {
    const mismatches: readonly (readonly [string, Partial<CommitCapabilityState>])[] = [
      ['protocolVersion', { protocolVersion: COMMIT_PROTOCOL_VERSION + 1 }],
      ['schemaVersion', { schemaVersion: COMMIT_GRAPH_SCHEMA_VERSION + 1 }],
      ['codecVersion', { codecVersion: RXDB_CHANGE_CODEC_VERSION + 1 }]
    ];

    for (const [field, overrides] of mismatches) {
      const entityManager = createEntityManager();
      const row = createCapabilityRow(entityManager, overrides);
      const { executor, statements, patches } = createCapabilityProbe(row);

      await expect(enableCommitCapability(executor)).rejects.toThrow(UnsupportedRxDBSystemVersionError);
      // 先比对后写，不是写完再比对：拒绝必须发生在库被改动之前。
      expect({ field, statements, patches }).toEqual({ field, statements: [], patches: [] });
      expect(row.enabled).toBe(false);
    }
  });

  it('比对是严格相等：存着低于进程常量的版本同样拒绝', async () => {
    const entityManager = createEntityManager();
    // `assertSupportedRxDBSystemVersions()` 只拒 `>`，因为系统 schema 有迁移阶梯把 `<`
    // 的缺口补上。能力三元组在 v1 没有任何阶梯——存低版本意味着这行是旧库写的、
    // 且永远不会有人更新它，继续跑就是拿新协议去写旧图。
    const row = createCapabilityRow(entityManager, { protocolVersion: COMMIT_PROTOCOL_VERSION - 1 });
    const { executor, statements } = createCapabilityProbe(row);

    await expect(enableCommitCapability(executor)).rejects.toThrow(UnsupportedRxDBSystemVersionError);
    expect(statements).toEqual([]);
  });

  it('能力行缺失时 fail-closed，不静默当作「未启用」', async () => {
    const { executor, statements } = createCapabilityProbe(null);

    // 表在、行不在 = `0004` 没跑完。当成「未启用」会让 enable() 静默无效，
    // 用户看到的是「启用成功但什么都没发生」。
    await expect(enableCommitCapability(executor)).rejects.toThrow(/0004-working-tree-commits/);
    await expect(readCommitCapability(executor)).rejects.toThrow(/0004-working-tree-commits/);
    expect(statements).toEqual([]);
  });

  it('isCommitCapabilityEnabled 只读那一行，不发 CAS', async () => {
    const entityManager = createEntityManager();
    const disabled = createCapabilityProbe(createCapabilityRow(entityManager));
    const enabled = createCapabilityProbe(createCapabilityRow(entityManager, { enabled: true, enabledAt: new Date() }));

    await expect(isCommitCapabilityEnabled(disabled.executor)).resolves.toBe(false);
    await expect(isCommitCapabilityEnabled(enabled.executor)).resolves.toBe(true);
    expect([disabled.statements, enabled.statements]).toEqual([[], []]);
  });

  it('isEnabled() 在版本不匹配的库上照常回答，不跟着 fail-closed', async () => {
    const entityManager = createEntityManager();
    const row = createCapabilityRow(entityManager, {
      enabled: true,
      enabledAt: new Date('2020-01-01T00:00:00.000Z'),
      protocolVersion: COMMIT_PROTOCOL_VERSION + 1
    });
    const { executor } = createCapabilityProbe(row);

    // core-api.md §1：`isEnabled()` 与 `enable()` 是未启用库上仅有的两个可用成员。
    // 让它跟着抛，调用方连「这个库到底启没启用」都问不出来，只能靠 catch 猜。
    await expect(isCommitCapabilityEnabled(executor)).resolves.toBe(true);
    await expect(readCommitCapability(executor)).resolves.toMatchObject({ enabled: true });
  });

  it('assertSupportedCommitCapability 逐字段比对，三个号各自独立', () => {
    const base: CommitCapabilityInfo = {
      enabled: true,
      protocolVersion: COMMIT_PROTOCOL_VERSION,
      schemaVersion: COMMIT_GRAPH_SCHEMA_VERSION,
      codecVersion: RXDB_CHANGE_CODEC_VERSION,
      enabledAt: new Date('2020-01-01T00:00:00.000Z')
    };

    expect(() => assertSupportedCommitCapability(base)).not.toThrow();
    const mismatched: readonly CommitCapabilityInfo[] = [
      { ...base, protocolVersion: base.protocolVersion + 1 },
      { ...base, schemaVersion: base.schemaVersion + 1 },
      { ...base, codecVersion: base.codecVersion + 1 }
    ];
    for (const info of mismatched) {
      expect(() => assertSupportedCommitCapability(info)).toThrow(UnsupportedRxDBSystemVersionError);
    }
  });
});
