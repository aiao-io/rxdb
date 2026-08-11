/**
 * @fileoverview 连接器测试共用的 RxDB 夹具。
 *
 * @remarks
 * 两个 spec 各写一份夹具时，`DevToolsRxDB` 一收紧就只有其中一份变红，
 * 另一份继续用旧形状跑绿 —— RDT-013 想锁的正是这种漂移。所以夹具只此一份。
 */
import type { EntityType, RxDBEvent } from '@aiao/rxdb';
import { vi } from 'vitest';
import type { DevToolsRxDB } from '../../connector.js';

/** 夹具发射的事件：只有 `type` 是必需的，其余字段各用例自定。 */
export type MockEvent = { type: string } & Record<string, unknown>;

/** 夹具内部登记的监听器。 */
export type MockListener = (event: RxDBEvent) => void;

/** 最小订阅句柄。 */
export interface MockSubscription {
  unsubscribe(): void;
}

/** 连接器下发给 `Repository.find` 的查询选项（只声明连接器真的会传的字段）。 */
export interface MockFindOptions {
  where: { combinator: string; rules: unknown[] };
  orderBy: { field: string; sort: string }[];
  limit?: number;
}

/** 连接器用到的 repository 能力子集。 */
export interface MockRepository {
  find(options: MockFindOptions): { subscribe(callback: (data: unknown[]) => void): MockSubscription };
}

/**
 * 夹具的**宽松**形状：只声明各用例真正会覆盖的成员，字段一律可选。
 *
 * @remarks
 * 不能直接用 `Partial<DevToolsRxDB>` 当覆盖入参 —— `config` 是完整的 `RxDBOptions`、
 * `entityManager` 是真实的 `EntityManager`，夹具里写三行的假对象一个都不满足。
 * 但也不能让 {@link MockRxDB} 整体退化成宽松形状，否则 RDT-013 想锁的
 * 「connector 只依赖真实 RxDB 的类型」就又被测试自己绕开了。
 *
 * 所以拆成两层：入参用这个宽松形状，产物 {@link MockRxDB} 交叉真实的
 * {@link DevToolsRxDB}，中间只在 {@link createMockRxDB} 里留**一处** cast。
 * `init()` 的实参类型因此仍由生产代码说了算，签名一旦收紧全体夹具立刻变红。
 */
export interface MockRxDBShape {
  _listeners: Map<string, Set<MockListener>>;
  addEventListener(type: string, listener: MockListener): void;
  removeEventListener(type: string, listener: MockListener): void;
  emit(type: string, event: MockEvent): void;
  disconnectAll(): Promise<void>;
  getAdapter(adapterName: string): Promise<unknown>;
  version: string;
  config: {
    dbName?: string;
    entities?: EntityType[];
    sync?: { local?: { adapter?: string } };
  };
  entityManager: { getRepository(entity: EntityType): MockRepository };
  versionManager: {
    switchBranch(value: string): Promise<void>;
    createBranch(value: string): Promise<unknown>;
    removeBranch(value: string): Promise<void>;
  };
}

/**
 * 夹具实例：对外是真实的 {@link DevToolsRxDB}，额外暴露两个只有测试用得上的钩子。
 *
 * `addEventListener` 在真实 `RxDB` 上是泛型方法（`<T extends keyof RxDBEventMap>`），
 * 结构化的假实现无论怎么写都无法赋值给它 —— 把整个联合当 `T` 传进去时
 * `RxDBEventMap[T]` 会塌成 `never`。这正是必须留一处 cast 的原因。
 */
export type MockRxDB = DevToolsRxDB & Pick<MockRxDBShape, '_listeners' | 'emit'>;

/** 夹具默认版本号；断言里直接引用，避免两处硬编码漂移。 */
export const MOCK_VERSION = '0.0.0-mock';

/** 夹具默认库名。 */
export const MOCK_DB_NAME = 'mock-db';

/** 一个既不发数据也不报错的 repository：仅用于「连接器不该发起查询」类断言。 */
function createInertEntityManager(): MockRxDBShape['entityManager'] {
  return {
    getRepository: () => ({ find: () => ({ subscribe: () => ({ unsubscribe: () => undefined }) }) })
  };
}

/**
 * 造一个满足 {@link DevToolsRxDB} 的假 RxDB。
 *
 * @param overrides - 需要定制的成员；`config` 走浅合并，只覆盖列出的键。
 */
export function createMockRxDB(overrides: Partial<MockRxDBShape> = {}): MockRxDB {
  const listeners = new Map<string, Set<MockListener>>();
  const base: MockRxDBShape = {
    _listeners: listeners,
    addEventListener(type, listener) {
      const eventListeners = listeners.get(type) ?? new Set<MockListener>();
      eventListeners.add(listener);
      listeners.set(type, eventListeners);
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener);
    },
    emit(type, event) {
      listeners.get(type)?.forEach(listener => listener(event as unknown as RxDBEvent));
    },
    disconnectAll: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    getAdapter: vi.fn<(adapterName: string) => Promise<unknown>>().mockResolvedValue({}),
    version: MOCK_VERSION,
    // config 单独浅合并：真实 RxDB 的 dbName 永远存在，用例只想换 entities 时
    // 不该顺手把 dbName 抹成 undefined（生产代码已经没有 'unknown' 兜底了）。
    config: { dbName: MOCK_DB_NAME, entities: [], sync: {} },
    entityManager: createInertEntityManager(),
    versionManager: {
      switchBranch: () => Promise.resolve(),
      createBranch: () => Promise.resolve(),
      removeBranch: () => Promise.resolve()
    }
  };
  const merged: MockRxDBShape = {
    ...base,
    ...overrides,
    config: { ...base.config, ...overrides.config }
  };
  return merged as unknown as MockRxDB;
}

/** 统计夹具上仍挂着的监听器总数。 */
export function listenerCount(rxdb: MockRxDB): number {
  let count = 0;
  for (const listeners of rxdb._listeners.values()) count += listeners.size;
  return count;
}
