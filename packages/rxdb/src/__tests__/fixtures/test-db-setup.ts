/**
 * @fileoverview 测试数据库配置（unit 层模拟适配器）
 *
 * ## 测试分层说明（重要 — 避免误判重构）
 *
 * RxDB 项目采用两层测试架构：
 *
 * 1. **Unit 层（本包内 `__tests__/`）**：使用 `createMockAdapter()` —— Map-backed 内存假适配器
 *    - 跑得快、零外部依赖、覆盖**纯逻辑**：query merging / scope filter / entity status / patch 计算 等
 *    - 不验证真实存储行为（SQL/事务/并发/序列）
 *
 * 2. **Integration 层（位于 `packages/rxdb-adapter-pglite/__tests__/`，41 个 spec）**：使用真 PGlite
 *    - 覆盖**真实业务流**：shop / tree-incremental / cascade-delete / relation-cache / cursor / change-queue
 *    - 适配器特定行为也由各自 adapter 包内 spec 覆盖（wa-sqlite / sqlite / sqliteai / supabase）
 *
 * 共享 fixtures（实体定义 / 清理工具 / Observable 断言）由 `@aiao/rxdb-test` 提供。
 *
 * **不要把 unit 层的 mock 测试改为真集成测试** —— 它们各司其职，
 * mock 是为了快速验证纯逻辑，真行为在 adapter 包里已充分覆盖。
 */

import { vi } from 'vitest';
import type { EntityType } from '../../entity/entity.interface.js';
import { SyncType } from '../../entity/metadata-options.interface.js';
import type { IRxDBAdapter } from '../../rxdb-adapter.js';
import { getEntityStatus } from '../../rxdb-utils.js';
import type { RxDBOptions } from '../../rxdb.interface.js';
import { RxDB } from '../../RxDB.js';
import { TEST_ENTITIES } from './test-entities.js';

/**
 * 创建 Mock 适配器
 * 用于不需要真实数据库的单元测试
 */
type MockEntity = InstanceType<EntityType> & { id: string; constructor: { name: string } };

export function createMockAdapter(): IRxDBAdapter {
  const storage = new Map<string, Map<string, unknown>>();

  const getTable = (name: string) => {
    if (!storage.has(name)) {
      storage.set(name, new Map());
    }
    return storage.get(name)!;
  };

  const adapter: IRxDBAdapter = {
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    isTableExisted: vi.fn().mockResolvedValue(false),
    createTables: vi.fn().mockResolvedValue(undefined),

    create: vi.fn(async (entity: MockEntity) => {
      const table = getTable(entity.constructor.name);
      table.set(entity.id, { ...entity });
      const status = getEntityStatus(entity);
      status.local = true;
      status.modified = false;
      return entity;
    }),

    update: vi.fn(async (entity: MockEntity) => {
      const table = getTable(entity.constructor.name);
      table.set(entity.id, { ...entity });
      const status = getEntityStatus(entity);
      status.modified = false;
      return entity;
    }),

    remove: vi.fn(async (entity: MockEntity) => {
      const table = getTable(entity.constructor.name);
      table.delete(entity.id);
      const status = getEntityStatus(entity);
      status.removed = true;
      status.local = false;
      return entity;
    }),

    findOne: vi.fn(async (entityType: string, id: string) => {
      const table = getTable(entityType);
      return table.get(id) ?? null;
    }),

    findMany: vi.fn(async () => []),
    count: vi.fn(async () => 0),

    // 事务回调收到的是 TransactionExecutor（C2）。这里给一个最小替身：
    // 它的 getRepository 直接转发到适配器自身的 getRepository，因此既有那些
    // 「打桩 adapter.getRepository 再断言事务内读写」的用例语义保持不变。
    transaction: vi.fn(async function (this: unknown, fn: (executor: unknown) => Promise<unknown>) {
      const executor = {
        id: 'mock-executor',
        state: 'active' as const,
        query: vi.fn(async () => ({ rowsAffected: 0, rows: [], columns: [] })),
        mutations: vi.fn(async () => []),
        mergeChanges: vi.fn(async () => undefined),
        getRepository: (EntityType: unknown) => adapter.getRepository(EntityType as never),
        run: (inner: (executor: unknown) => Promise<unknown>) => inner(executor)
      };
      return fn(executor);
    }),

    // 与 RxDBAdapterLocalBase 的默认实现同口径：没有就绪门的适配器直接委托 transaction()
    bootstrapTransaction: vi.fn(async function (this: unknown, fn: (executor: unknown) => Promise<unknown>) {
      return (adapter as unknown as { transaction: (f: unknown) => Promise<unknown> }).transaction(fn);
    }),

    getRepository: vi.fn().mockReturnValue({
      find: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn()
    }),

    // 内部存储访问（测试用）
    _storage: storage,
    _getTable: getTable
  } as unknown as IRxDBAdapter;

  return adapter;
}

/**
 * 测试数据库选项
 */
export interface TestDBOptions {
  /** 数据库名称（默认生成唯一名称） */
  dbName?: string;
  /** 要注册的实体类（默认使用 TEST_ENTITIES） */
  entities?: EntityType[];
  /** 是否使用 Mock 适配器（默认 true） */
  useMock?: boolean;
}

/**
 * 创建测试用 RxDB 实例
 *
 * @example
 * ```ts
 * const { rxdb, cleanup } = await createTestDB();
 * // ... run tests
 * await cleanup();
 * ```
 */
export async function createTestDB(options: TestDBOptions = {}): Promise<{
  rxdb: RxDB;
  adapter: IRxDBAdapter;
  cleanup: () => Promise<void>;
}> {
  const {
    dbName = `test-db-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    entities = TEST_ENTITIES,
    useMock = true
  } = options;

  const rxdbOptions: RxDBOptions = {
    dbName,
    entities,
    sync: {
      local: {
        adapter: 'sqlite'
      },
      type: SyncType.None
    }
  };

  const rxdb = new RxDB(rxdbOptions);
  const adapter = useMock ? createMockAdapter() : ({} as IRxDBAdapter);

  rxdb.adapter('sqlite', () => adapter);
  rxdb.init();

  const cleanup = async (): Promise<void> => {
    // 清理资源
    if (adapter.disconnect) {
      await adapter.disconnect();
    }
  };

  return { rxdb, adapter, cleanup };
}

/**
 * 创建带有远程同步配置的测试数据库
 */
export async function createTestDBWithRemote(options: TestDBOptions = {}): Promise<{
  rxdb: RxDB;
  localAdapter: IRxDBAdapter;
  remoteAdapter: IRxDBAdapter;
  cleanup: () => Promise<void>;
}> {
  const { dbName = `test-db-${Date.now()}-${Math.random().toString(36).slice(2)}`, entities = TEST_ENTITIES } = options;

  const rxdbOptions: RxDBOptions = {
    dbName,
    entities,
    sync: {
      local: {
        adapter: 'sqlite'
      },
      remote: {
        adapter: 'remote'
      },
      type: SyncType.Full
    }
  };

  const rxdb = new RxDB(rxdbOptions);
  const localAdapter = createMockAdapter();
  const remoteAdapter = createMockAdapter();

  rxdb.adapter('sqlite', () => localAdapter);
  rxdb.adapter('remote', () => remoteAdapter);
  rxdb.init();

  const cleanup = async (): Promise<void> => {
    await Promise.all([localAdapter.disconnect?.(), remoteAdapter.disconnect?.()]);
  };

  return { rxdb, localAdapter, remoteAdapter, cleanup };
}

/**
 * 等待微任务队列清空
 */
export function flushMicrotasks(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

/**
 * 等待指定时间
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
