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
import { Entity, EntityBase, PropertyType, SyncType, type EntityType } from '../index.js';
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

class DriftCapableMockAdapter extends MockLocalAdapter {
  override checkEntityConstraints: (EntityTypes: EntityType[]) => Promise<void> = async () => undefined;
}

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
  it('未实现 checkEntityConstraints 的适配器 + 声明 checks 的实体 → connect 抛错点名双方', async () => {
    const database = createDatabase([CheckedSupportItem as EntityType], db => createMockAdapter(db));
    await expect(database.connect('local')).rejects.toThrow(
      /适配器 'local' 不支持声明式 CHECK 约束：未实现 checkEntityConstraints 漂移检查。声明了 checks 的实体：CheckedSupportItem/
    );
  });

  it('实现 checkEntityConstraints 的适配器 → connect 正常，漂移检查按注册实体调用', async () => {
    let adapter: DriftCapableMockAdapter | undefined;
    const database = createDatabase([CheckedSupportItem as EntityType, PlainSupportItem as EntityType], db => {
      adapter = new DriftCapableMockAdapter(db);
      vi.spyOn(adapter, 'checkEntityConstraints');
      return adapter;
    });
    await expect(database.connect('local')).resolves.toBeDefined();
    expect(adapter).toBeDefined();
    const spy = vi.mocked(adapter!.checkEntityConstraints);
    expect(spy).toHaveBeenCalledTimes(1);
    // config.entities 含核心注入的系统实体（RxDBChange 等），断言只认自己的两个
    expect(spy.mock.calls[0][0]).toEqual(
      expect.arrayContaining([CheckedSupportItem as EntityType, PlainSupportItem as EntityType])
    );
  });

  it('漂移检查抛错时 connect 失败（既有库与声明不一致的端到端形态）', async () => {
    const database2 = new RxDB({
      dbName: `check-support-drift-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      entities: [CheckedSupportItem as EntityType],
      sync: { local: { adapter: 'local' }, type: SyncType.None }
    });
    let driftAdapter: DriftCapableMockAdapter | undefined;
    database2.adapter('local', db => {
      driftAdapter = new DriftCapableMockAdapter(db);
      vi.spyOn(driftAdapter, 'checkEntityConstraints').mockRejectedValue(new Error('drift'));
      return driftAdapter;
    });
    databases.add(database2);
    await expect(database2.connect('local')).rejects.toThrow('drift');
    expect(vi.mocked(driftAdapter!.checkEntityConstraints)).toHaveBeenCalledTimes(1);
  });

  it('没有实体声明 checks → 不要求适配器实现该方法，connect 正常（既有应用零变化）', async () => {
    const database = createDatabase([PlainSupportItem as EntityType], db => createMockAdapter(db));
    await expect(database.connect('local')).resolves.toBeDefined();
  });
});
