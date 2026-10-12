/**
 * @fileoverview AC#6：实体声明 checks 而适配器没有漂移检查能力时 init() 报不支持
 * （核心侧判定路径，US-030 阶段 A）。
 *
 * - 不实现 `checkEntityConstraints` 的适配器 + 声明 checks 的实体 → connect 抛错，
 *   点名适配器与实体，不静默降级为应用层校验；
 * - 实现该方法的适配器 → connect 正常，且漂移检查被调用；
 * - 没有实体声明 checks → 不要求适配器实现（既有应用零变化）。
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  Entity,
  EntityBase,
  PropertyType,
  RxDBLocalAdapterCapabilityError,
  SyncType,
  type EntityType
} from '../index.js';
import { RxDB } from '../RxDB.js';
import { createMockAdapter, MockLocalAdapter } from './fixtures/test-db-setup.js';

@Entity({
  name: 'CheckedSupportItem',
  namespace: 'public',
  log: false,
  properties: [{ name: 'qty', type: PropertyType.integer, nullable: true, check: { operator: '>', value: 0 } }]
})
class CheckedSupportItem extends EntityBase {
  qty!: number | null;
}

@Entity({
  name: 'PlainSupportItem',
  namespace: 'public',
  log: false,
  properties: [{ name: 'x', type: PropertyType.string }]
})
class PlainSupportItem extends EntityBase {
  x!: string;
}

/**
 * 给替身适配器装上漂移检查能力（`checkEntityConstraints` 是基类可选成员，
 * 运行时赋值即可，无需子类化——子类化会因泛型仓库映射的反变把
 * `DriftCapableMockAdapter` 与 `MockLocalAdapter` 判成不兼容）。
 */
const makeDriftCapable = (db: RxDB): { adapter: MockLocalAdapter; check: ReturnType<typeof vi.fn> } => {
  const adapter = createMockAdapter(db);
  const check = vi.fn<(EntityTypes: EntityType[]) => Promise<void>>();
  check.mockResolvedValue(undefined);
  adapter.checkEntityConstraints = check;
  return { adapter, check };
};

const databases = new Set<RxDB>();

const createDatabase = (entities: EntityType[], adapterFactory: (db: RxDB) => MockLocalAdapter): RxDB => {
  const database = new RxDB({
    dbName: `check-support-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    entities,
    sync: { local: { adapter: 'local' }, type: SyncType.None }
  });
  database.adapter('local', db => adapterFactory(db));
  databases.add(database);
  return database;
};

afterEach(async () => {
  const pending = Array.from(databases);
  databases.clear();
  await Promise.all(pending.map(database => database.disconnectAll().catch(() => undefined)));
  vi.restoreAllMocks();
});

describe('AC#6 适配器不支持声明式 CHECK 时 init 报错', () => {
  it('未实现 checkEntityConstraints 的本地适配器 + 声明 checks 的实体 → connect 抛类型化能力错误点名双方', async () => {
    let mockAdapter: MockLocalAdapter | undefined;
    const database = createDatabase([CheckedSupportItem as EntityType], db => {
      mockAdapter = createMockAdapter(db);
      return mockAdapter;
    });
    // 判定在 adapter.connect() 之前：失败无需 disconnect，不占存储锁
    try {
      await database.connect('local');
      expect.unreachable('应当抛出能力错误');
    } catch (error) {
      expect(error).toBeInstanceOf(RxDBLocalAdapterCapabilityError);
      const capabilityError = error as RxDBLocalAdapterCapabilityError;
      expect(capabilityError.adapterName).toBe('local');
      expect(capabilityError.missing).toEqual(['checkEntityConstraints']);
    }
    // 纯元数据 + 能力判定：适配器根本没被 connect，抛错不留下已连上的适配器
    expect(mockAdapter!.connect).not.toHaveBeenCalled();
  });

  it('远端适配器（无本地 DDL）注册了声明 checks 的实体 → connect 抛错点名实体，不建连接', async () => {
    let mockAdapter: MockLocalAdapter | undefined;
    const database = new RxDB({
      dbName: `check-support-remote-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      entities: [CheckedSupportItem as EntityType],
      sync: { remote: { adapter: 'remote' }, type: SyncType.None }
    });
    database.adapter('remote', db => {
      mockAdapter = createMockAdapter(db);
      return mockAdapter;
    });
    databases.add(database);
    await expect(database.connect('remote')).rejects.toThrow(
      /适配器 'remote' 不支持声明式 CHECK 约束：远端适配器（supabase \/ http）不掌控本地 DDL。声明了 checks 的实体：CheckedSupportItem/
    );
    expect(mockAdapter!.connect).not.toHaveBeenCalled();
  });

  it('实现 checkEntityConstraints 的适配器 → connect 正常，漂移检查按注册实体调用', async () => {
    let capable: { adapter: MockLocalAdapter; check: ReturnType<typeof vi.fn> } | undefined;
    const database = createDatabase([CheckedSupportItem as EntityType, PlainSupportItem as EntityType], db => {
      capable = makeDriftCapable(db);
      return capable.adapter;
    });
    await expect(database.connect('local')).resolves.toBeDefined();
    expect(capable).toBeDefined();
    expect(capable!.check).toHaveBeenCalledTimes(1);
    // config.entities 含核心注入的系统实体（RxDBChange 等），断言只认自己的两个
    expect(capable!.check.mock.calls[0][0]).toEqual(
      expect.arrayContaining([CheckedSupportItem as EntityType, PlainSupportItem as EntityType])
    );
  });

  it('漂移检查抛错时 connect 失败（既有库与声明不一致的端到端形态）', async () => {
    const database2 = new RxDB({
      dbName: `check-support-drift-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      entities: [CheckedSupportItem as EntityType],
      sync: { local: { adapter: 'local' }, type: SyncType.None }
    });
    let driftCapable: { adapter: MockLocalAdapter; check: ReturnType<typeof vi.fn> } | undefined;
    database2.adapter('local', db => {
      driftCapable = makeDriftCapable(db);
      driftCapable.check.mockRejectedValue(new Error('drift'));
      return driftCapable.adapter;
    });
    databases.add(database2);
    await expect(database2.connect('local')).rejects.toThrow('drift');
    expect(driftCapable!.check).toHaveBeenCalledTimes(1);
  });

  it('没有实体声明 checks → 不要求适配器实现该方法，connect 正常（既有应用零变化）', async () => {
    const database = createDatabase([PlainSupportItem as EntityType], db => createMockAdapter(db));
    await expect(database.connect('local')).resolves.toBeDefined();
  });
});
