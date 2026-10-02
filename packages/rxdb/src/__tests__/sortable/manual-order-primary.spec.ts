/**
 * @fileoverview US-028 — 主端是 remote-only / QueryCache 时的手动排序写入（AC#3、AC#2 写边界、AC#16）。
 *
 * 本地只有序列的子集，拿它读尾键 / 邻居算出的键与远端不一致，所以：
 *
 * 1. 缺键创建（门面、save、批量）与 `reorder()` 一律抛 `unsupportedPrimary`，任何写发出之前；
 * 2. 显式给合法键的创建不受限，照原路径写到主端（remote-only 验证；QueryCache 的写路径属插件）；
 * 3. 分组实体改了分组字段又没给键（门面 update、saveMany）同样抛 `unsupportedPrimary`，一条都不写。
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EntityBase } from '../../entity/entity-base.js';
import { Entity } from '../../entity/entity.decorator.js';
import { ENTITY_STATIC_TYPES, type EntityType, type UUID } from '../../entity/entity.interface.js';
import { PropertyType, SyncType } from '../../entity/metadata-options.interface.js';
import type { EntityPropertyMetadataOptions } from '../../entity/property-types.interface.js';
import { uuid } from '../../rxdb-utils.js';
import { RxDB } from '../../RxDB.js';
import { SortOrderError } from '../../sortable/sortable-error.js';
import { createMockAdapter, type MockLocalAdapter } from '../fixtures/test-db-setup.js';

const PROPERTIES: EntityPropertyMetadataOptions[] = [
  { name: 'title', type: PropertyType.string },
  { name: 'sortOrder', type: PropertyType.string }
];

@Entity({
  name: 'SortRemoteOnly',
  manualOrder: true,
  properties: PROPERTIES,
  sync: { type: SyncType.None, remote: { adapter: 'remote' } }
})
class SortRemoteOnly extends EntityBase {
  static [ENTITY_STATIC_TYPES]: { idType: UUID };
  title!: string;
  sortOrder!: string;
}

@Entity({
  name: 'SortQueryCache',
  manualOrder: true,
  properties: PROPERTIES,
  sync: { type: SyncType.QueryCache, local: { adapter: 'sqlite' }, remote: { adapter: 'remote' } }
})
class SortQueryCache extends EntityBase {
  static [ENTITY_STATIC_TYPES]: { idType: UUID };
  title!: string;
  sortOrder!: string;
}

const GROUPED_PROPERTIES: EntityPropertyMetadataOptions[] = [
  ...PROPERTIES,
  { name: 'shelf', type: PropertyType.string, nullable: true }
];

@Entity({
  name: 'SortGroupedRemoteOnly',
  manualOrder: { groupBy: ['shelf'] },
  properties: GROUPED_PROPERTIES,
  sync: { type: SyncType.None, remote: { adapter: 'remote' } }
})
class SortGroupedRemoteOnly extends EntityBase {
  static [ENTITY_STATIC_TYPES]: { idType: UUID };
  title!: string;
  sortOrder!: string;
  shelf!: string | null;
}

@Entity({
  name: 'SortGroupedQueryCache',
  manualOrder: { groupBy: ['shelf'] },
  properties: GROUPED_PROPERTIES,
  sync: { type: SyncType.QueryCache, local: { adapter: 'sqlite' }, remote: { adapter: 'remote' } }
})
class SortGroupedQueryCache extends EntityBase {
  static [ENTITY_STATIC_TYPES]: { idType: UUID };
  title!: string;
  sortOrder!: string;
  shelf!: string | null;
}

type Sortable = EntityBase & { title: string; sortOrder?: string };
type Shelved = Sortable & { shelf: string | null };

interface Context {
  rxdb: RxDB;
  local: MockLocalAdapter;
  remote: MockLocalAdapter;
}

const fresh = (rxdb: RxDB, EntityType: EntityType, sortOrder?: string): Sortable => {
  const entity = rxdb.entityManager.createEntityRef(EntityType, { id: uuid() } as never) as Sortable;
  entity.title = 'fresh';
  if (sortOrder !== undefined) entity.sortOrder = sortOrder;
  return entity;
};

const expectUnsupported = async (write: Promise<unknown>): Promise<void> => {
  const error = await write.then(
    () => {
      throw new Error('写入应被拒绝，却成功了');
    },
    (error: unknown) => error
  );
  expect(error).toBeInstanceOf(SortOrderError);
  expect((error as SortOrderError).reason).toBe('unsupportedPrimary');
};

/** 已落库、在 A 组的行 */
const storedOnShelfA = (rxdb: RxDB, EntityType: EntityType): Shelved =>
  rxdb.entityManager.createEntityRef(EntityType, { id: uuid(), title: 't', shelf: 'A', sortOrder: 'a0' } as never, {
    local: true,
    modified: false
  }) as Shelved;

describe.each([
  ['remote-only', SortRemoteOnly, SortGroupedRemoteOnly],
  ['QueryCache', SortQueryCache, SortGroupedQueryCache]
] as const)('US-028 主端为 %s', (_label, EntityType, GroupedType) => {
  let ctx: Context;

  beforeEach(() => {
    const rxdb = new RxDB({
      dbName: `manual-order-primary-${uuid()}`,
      entities: [SortRemoteOnly, SortQueryCache, SortGroupedRemoteOnly, SortGroupedQueryCache],
      // 库级两侧都要登记：`RxDB.init()` 只按库级 sync 注册适配器，实体级只覆盖选择
      sync: { local: { adapter: 'sqlite' }, remote: { adapter: 'remote' }, type: SyncType.Full }
    });
    const local = createMockAdapter(rxdb);
    const remote = createMockAdapter(rxdb);
    rxdb.adapter('sqlite', () => local);
    rxdb.adapter('remote', () => remote);
    rxdb.init();
    ctx = { rxdb, local, remote };
  });

  afterEach(async () => {
    await ctx.rxdb.disconnectAll();
  });

  /** 两端都没有任何写或事务发出 */
  const expectNothingWritten = (): void => {
    for (const adapter of [ctx.local, ctx.remote]) {
      expect(adapter.transaction).not.toHaveBeenCalled();
      expect(adapter.mutations).not.toHaveBeenCalled();
      expect(adapter.getRepository).not.toHaveBeenCalled();
    }
  };

  it('门面缺键创建被拒', async () => {
    await expectUnsupported(
      ctx.rxdb.entityManager.getRepository(EntityType).create(fresh(ctx.rxdb, EntityType) as never)
    );
    expectNothingWritten();
  });

  it('save() 缺键创建被拒', async () => {
    await expectUnsupported(ctx.rxdb.entityManager.save(fresh(ctx.rxdb, EntityType) as never));
    expectNothingWritten();
  });

  it('批量缺键创建被拒，同批显式键的行也不写', async () => {
    const batch = [fresh(ctx.rxdb, EntityType, 'a0'), fresh(ctx.rxdb, EntityType)];
    await expectUnsupported(ctx.rxdb.entityManager.saveMany(batch as never[]));
    expectNothingWritten();
  });

  it('reorder() 被拒', async () => {
    await expectUnsupported(ctx.rxdb.entityManager.getRepository(EntityType).reorder(uuid() as UUID, { group: {} }));
    expectNothingWritten();
  });

  it('门面 update 改分组字段、没给键被拒', async () => {
    const row = storedOnShelfA(ctx.rxdb, GroupedType);
    await expectUnsupported(ctx.rxdb.entityManager.getRepository(GroupedType).update(row as never, { shelf: 'B' }));
    expect(row.shelf).toBe('A');
    expect(row.sortOrder).toBe('a0');
    expectNothingWritten();
  });

  it('saveMany 改分组字段、没给键被拒，同批其他行也不写', async () => {
    const moved = storedOnShelfA(ctx.rxdb, GroupedType);
    moved.shelf = null;
    const untouched = storedOnShelfA(ctx.rxdb, GroupedType);
    untouched.title = 'renamed';
    await expectUnsupported(ctx.rxdb.entityManager.saveMany([moved, untouched] as never[]));
    expect(moved.sortOrder).toBe('a0');
    expectNothingWritten();
  });

  // QueryCache 的显式键写入走查询缓存引擎（插件），不在核心这一层；remote-only 足以证明「不受限」
  it.runIf(EntityType === SortRemoteOnly)('显式合法键的创建不受限，不开事务', async () => {
    await ctx.rxdb.entityManager.getRepository(EntityType).create(fresh(ctx.rxdb, EntityType, 'a0') as never);
    expect(ctx.local.transaction).not.toHaveBeenCalled();
    expect(ctx.remote.transaction).not.toHaveBeenCalled();
  });
});
