/**
 * @fileoverview US-028 阶段 D — 分组排序域的门面与批量行为（AC#13 后半、AC#14、AC#15、AC#16）。
 *
 * 用可空 string 列 `shelf` 作分组字段（内存仓库按 JS 比较器排序，NULL 最小）；
 * 外键分组列与两端 SQL 同序由 rxdb-test 契约套件验证。
 *
 * 1. 读归一化：未给 `orderBy` 时补 `[shelf asc, sortOrder asc, id asc]`；
 * 2. 缺键创建只读本组尾键：空组得 `a0`，NULL 组按 `IS NULL` 取尾，同批按组拆分、组内按批内顺序；
 * 3. `reorder()`：组内只写 `sortOrder`；跨组只写分组字段与 `sortOrder`；邻居不同组 / 不相邻 / 移动行已删除即拒绝、零写；
 * 4. 改分组字段的用户写入（门面 update、save、saveMany）在事务内追加到新组末尾；显式合法键原样、非法键报错。
 */

import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EntityBase } from '../../entity/entity-base.js';
import { PermissionDeniedError } from '../../entity/entity-permissions.js';
import { Entity } from '../../entity/entity.decorator.js';
import { ENTITY_STATIC_TYPES, type EntityType, type UUID } from '../../entity/entity.interface.js';
import { PropertyType } from '../../entity/metadata-options.interface.js';
import type { EntityPropertyMetadataOptions } from '../../entity/property-types.interface.js';
import { calculateOrderBy } from '../../query/query-matching.utils.js';
import type { FindOptions } from '../../repository/query-options.interface.js';
import { uuid } from '../../rxdb-utils.js';
import type { RxDB } from '../../RxDB.js';
import type { ReorderTarget } from '../../sortable/sortable.interface.js';
import { createTestDB, stubAdapterRepository, type MockLocalAdapter } from '../fixtures/test-db-setup.js';
import {
  byCodePoint,
  expectSortOrderError,
  memoryRepository,
  rejectionOf,
  type MemoryRepository,
  type Sortable
} from './fixtures/sortable-test-utils.js';

const PROPERTIES: EntityPropertyMetadataOptions[] = [
  { name: 'title', type: PropertyType.string },
  { name: 'sortOrder', type: PropertyType.string },
  { name: 'shelf', type: PropertyType.string, nullable: true }
];

@Entity({ name: 'ShelfItem', manualOrder: { groupBy: ['shelf'] }, properties: PROPERTIES })
class ShelfItem extends EntityBase {
  static [ENTITY_STATIC_TYPES]: { idType: UUID };
  title!: string;
  sortOrder!: string;
  shelf!: string | null;
}

@Entity({
  name: 'ShelfLocked',
  manualOrder: { groupBy: ['shelf'] },
  properties: PROPERTIES,
  permissions: { update: 'system' }
})
class ShelfLocked extends EntityBase {
  static [ENTITY_STATIC_TYPES]: { idType: UUID };
  title!: string;
  sortOrder!: string;
  shelf!: string | null;
}

type Shelved = Sortable & { shelf: string | null };

interface Context {
  rxdb: RxDB;
  adapter: MockLocalAdapter;
  cleanup: () => Promise<void>;
}

const DEFAULT_ORDER_BY = [
  { field: 'shelf', sort: 'asc' },
  { field: 'sortOrder', sort: 'asc' },
  { field: 'id', sort: 'asc' }
] as const;

const setup = async (): Promise<Context> => createTestDB({ entities: [ShelfItem, ShelfLocked] });

/** 已落库的行 */
const stored = (
  ctx: Context,
  id: string,
  shelf: string | null,
  sortOrder: string,
  EntityType: EntityType = ShelfItem
) =>
  ctx.rxdb.entityManager.createEntityRef(EntityType, { id, title: id, shelf, sortOrder } as never, {
    local: true,
    modified: false
  }) as Shelved;

/** 还没落库的新实体；不给键即缺键创建 */
const fresh = (ctx: Context, shelf: string | null, sortOrder?: unknown): Shelved => {
  const entity = ctx.rxdb.entityManager.createEntityRef(ShelfItem, { id: uuid() } as never) as Shelved;
  entity.title = 'fresh';
  entity.shelf = shelf;
  if (sortOrder !== undefined) entity.sortOrder = sortOrder as string;
  return entity;
};

/**
 * 三组数据：NULL 组 n0 n1、A 组 A0..A3、B 组 B0 B1，各组键都从 `a0` 起（组间重复键合法）
 */
const seed = (ctx: Context): Shelved[] => [
  stored(ctx, 'n0', null, 'a0'),
  stored(ctx, 'n1', null, 'a1'),
  stored(ctx, 'A0', 'A', 'a0'),
  stored(ctx, 'A1', 'A', 'a1'),
  stored(ctx, 'A2', 'A', 'a2'),
  stored(ctx, 'A3', 'A', 'a3'),
  stored(ctx, 'B0', 'B', 'a0'),
  stored(ctx, 'B1', 'B', 'a1')
];

const install = (ctx: Context, rows: Shelved[]): MemoryRepository<Shelved> => {
  const repository = memoryRepository(rows);
  stubAdapterRepository(ctx.adapter, repository);
  return repository;
};

/** 各组的 id 顺序（与默认排序同口径），NULL 组记作 `'null'` */
const layout = (repository: MemoryRepository<Shelved>): Record<string, string[]> => {
  const result: Record<string, string[]> = {};
  for (const row of calculateOrderBy(repository.rows, [...DEFAULT_ORDER_BY])) {
    (result[String(row.shelf)] ??= []).push(row.id as string);
  }
  return result;
};

const rowOf = (repository: MemoryRepository<Shelved>, id: string): Shelved =>
  repository.rows.find(row => row.id === id)!;

/** 每次 `find` 的 where 规则（读锚点时的分组条件） */
const findRules = (repository: MemoryRepository<Shelved>) =>
  repository.find.mock.calls.map(([options]) => (options as FindOptions).where);

describe('US-028 AC#13 分组实体的读归一化', () => {
  let ctx: Context;

  beforeEach(async () => {
    ctx = await setup();
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it('findAll 未给 orderBy 时补 [shelf asc, sortOrder asc, id asc]，NULL 组整体在最前', async () => {
    const repository = install(ctx, seed(ctx).reverse());
    const rows = await firstValueFrom(
      ctx.rxdb.entityManager.getRepository(ShelfItem).findAll({ where: { combinator: 'and', rules: [] } })
    );
    expect(repository.find).toHaveBeenCalledWith(expect.objectContaining({ orderBy: DEFAULT_ORDER_BY }));
    expect(rows.map(row => row.id)).toEqual(['n0', 'n1', 'A0', 'A1', 'A2', 'A3', 'B0', 'B1']);
  });
});

describe('US-028 AC#14 按组创建追加', () => {
  let ctx: Context;
  let repository: MemoryRepository<Shelved>;

  beforeEach(async () => {
    ctx = await setup();
    repository = install(ctx, seed(ctx));
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  const create = (entity: Shelved) => ctx.rxdb.entityManager.getRepository(ShelfItem).create(entity as never);

  it('只读本组尾键：A 组追加在 a3 之后，与其他组无关', async () => {
    const entity = fresh(ctx, 'A');
    await create(entity);
    expect(entity.sortOrder).toBe('a4');
    expect(findRules(repository)).toEqual([
      { combinator: 'and', rules: [{ field: 'shelf', operator: '=', value: 'A' }] }
    ]);
    expect(ctx.adapter.transaction).toHaveBeenCalledTimes(1);
  });

  it('空组得 a0（其他组已有键）', async () => {
    const entity = fresh(ctx, 'C');
    await create(entity);
    expect(entity.sortOrder).toBe('a0');
  });

  it('NULL 组按 IS NULL 取尾', async () => {
    const entity = fresh(ctx, null);
    await entity.save();
    expect(entity.sortOrder).toBe('a2');
    expect(findRules(repository)).toEqual([{ combinator: 'and', rules: [{ field: 'shelf', operator: 'null' }] }]);
  });

  it('同批按组拆分：每组读一次本组尾键，组内按批内顺序递增、互不碰撞', async () => {
    const batch = [fresh(ctx, 'A'), fresh(ctx, null), fresh(ctx, 'A'), fresh(ctx, 'C'), fresh(ctx, null)];
    await ctx.rxdb.entityManager.saveMany(batch as never[]);
    const [a1, n1, a2, c1, n2] = batch.map(entity => entity.sortOrder!);
    expect([a1, a2]).toEqual(['a4', 'a5']);
    expect([n1, n2]).toEqual(['a2', 'a3']);
    expect(c1).toBe('a0');
    expect(repository.find).toHaveBeenCalledTimes(3);
    expect(ctx.adapter.transaction).toHaveBeenCalledTimes(1);
    expect(ctx.adapter.mutations).toHaveBeenCalledTimes(1);
  });

  it('显式合法键原样保留，组间重复键不报错', async () => {
    const entity = fresh(ctx, 'B', 'a0');
    await create(entity);
    expect(entity.sortOrder).toBe('a0');
    expect(ctx.adapter.transaction).not.toHaveBeenCalled();
  });

  it('本组尾键已损坏：corruptAnchor，其他组的损坏不影响', async () => {
    rowOf(repository, 'B1').sortOrder = 'zz';
    await expectSortOrderError(create(fresh(ctx, 'B')), 'corruptAnchor');
    const ok = fresh(ctx, 'A');
    await create(ok);
    expect(ok.sortOrder).toBe('a4');
  });
});

describe('US-028 AC#15 分组实体的 reorder()', () => {
  let ctx: Context;
  let repository: MemoryRepository<Shelved>;

  beforeEach(async () => {
    ctx = await setup();
    repository = install(ctx, seed(ctx));
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  const reorder = (id: string, target: ReorderTarget<string>) =>
    ctx.rxdb.entityManager.getRepository(ShelfItem).reorder(id as UUID, target as ReorderTarget<UUID>);

  /** 唯一一次 update 写了哪些字段 */
  const writtenFields = (): string[] => {
    expect(repository.update).toHaveBeenCalledTimes(1);
    return Object.keys(repository.update.mock.calls[0][1]).sort();
  };

  it('组内移动只写 sortOrder', async () => {
    await reorder('A3', { prevId: null, nextId: 'A0' });
    expect(layout(repository).A).toEqual(['A3', 'A0', 'A1', 'A2']);
    expect(writtenFields()).toEqual(['sortOrder']);
  });

  it('组内相邻判定只看本组：别组同区间的键不算夹在中间', async () => {
    // B0(a0) B1(a1) 之间没有 B 组的行；A 组的 a0..a1 不影响
    await reorder('A2', { prevId: 'B0', nextId: 'B1' });
    expect(layout(repository).B).toEqual(['B0', 'A2', 'B1']);
  });

  it('跨组移到目标组两邻之间：只写分组字段与 sortOrder，原组剩余行不改写', async () => {
    await reorder('A1', { prevId: 'B0', nextId: 'B1' });
    const moved = rowOf(repository, 'A1');
    expect(moved.shelf).toBe('B');
    expect(moved.sortOrder! > 'a0' && moved.sortOrder! < 'a1').toBe(true);
    expect(writtenFields()).toEqual(['shelf', 'sortOrder']);
    expect(layout(repository)).toMatchObject({ A: ['A0', 'A2', 'A3'], B: ['B0', 'A1', 'B1'] });
    expect(ctx.adapter.transaction).toHaveBeenCalledTimes(1);
  });

  it('跨组移到目标组首部（prevId 为 null，目标组由 nextId 决定）', async () => {
    await reorder('A0', { prevId: null, nextId: 'n0' });
    expect(layout(repository).null).toEqual(['A0', 'n0', 'n1']);
    expect(writtenFields()).toEqual(['shelf', 'sortOrder']);
  });

  it('跨组追加到目标组末尾', async () => {
    await reorder('A0', { group: { shelf: 'B' } });
    expect(layout(repository).B).toEqual(['B0', 'B1', 'A0']);
    expect(writtenFields()).toEqual(['shelf', 'sortOrder']);
  });

  it('目标组为空：得 a0', async () => {
    await reorder('A0', { group: { shelf: 'C' } });
    expect(rowOf(repository, 'A0')).toMatchObject({ shelf: 'C', sortOrder: 'a0' });
  });

  it('目标为 NULL 组：按 IS NULL 取尾', async () => {
    await reorder('B0', { group: { shelf: null } });
    expect(layout(repository).null).toEqual(['n0', 'n1', 'B0']);
    expect(rowOf(repository, 'B0').shelf).toBeNull();
  });

  it('本组追加且已是末尾：零写', async () => {
    await reorder('A3', { group: { shelf: 'A' } });
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('本组追加、不是末尾：只写 sortOrder', async () => {
    await reorder('A0', { group: { shelf: 'A' } });
    expect(layout(repository).A).toEqual(['A1', 'A2', 'A3', 'A0']);
    expect(writtenFields()).toEqual(['sortOrder']);
  });

  it('邻居不属同一组：staleTarget，零写', async () => {
    await expectSortOrderError(reorder('A0', { prevId: 'n1', nextId: 'B0' }), 'staleTarget');
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('目标组内邻居不再相邻：staleTarget，零写', async () => {
    await expectSortOrderError(reorder('B0', { prevId: 'A0', nextId: 'A2' }), 'staleTarget');
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('移动前该行已删除：notFound，零写', async () => {
    repository.rows.splice(repository.rows.indexOf(rowOf(repository, 'A1')), 1);
    await expectSortOrderError(reorder('A1', { prevId: 'B0', nextId: 'B1' }), 'notFound');
    expect(repository.update).not.toHaveBeenCalled();
  });

  it.each([
    ['整表形式的 {}', {}],
    ['缺分组字段、给了别的键', { color: 'red' }],
    ['多给了分组字段以外的键', { shelf: 'A', color: 'red' }]
  ])('group 取值与分组字段不符（%s）：invalidTarget，不开事务', async (_label, group) => {
    await expectSortOrderError(reorder('A0', { group }), 'invalidTarget');
    expect(ctx.adapter.transaction).not.toHaveBeenCalled();
  });

  it('update 只许系统写：开事务前抛 PermissionDeniedError，零写', async () => {
    const error = await rejectionOf(
      ctx.rxdb.entityManager.getRepository(ShelfLocked).reorder('A0' as UUID, { group: { shelf: 'B' } })
    );
    expect(error).toBeInstanceOf(PermissionDeniedError);
    expect(ctx.adapter.transaction).not.toHaveBeenCalled();
    expect(repository.update).not.toHaveBeenCalled();
  });
});

describe('US-028 AC#16 改分组字段的用户写入追加到新组末尾', () => {
  let ctx: Context;
  let repository: MemoryRepository<Shelved>;

  beforeEach(async () => {
    ctx = await setup();
    repository = install(ctx, seed(ctx));
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  const facade = () => ctx.rxdb.entityManager.getRepository(ShelfItem);

  it('门面 update：在事务内追加到新组末尾，patch 只多带 sortOrder', async () => {
    await facade().update(rowOf(repository, 'A1') as never, { shelf: 'B' } as never);
    expect(ctx.adapter.transaction).toHaveBeenCalledTimes(1);
    expect(repository.update.mock.calls[0][1]).toEqual({ shelf: 'B', sortOrder: 'a2' });
    expect(layout(repository)).toMatchObject({ A: ['A0', 'A2', 'A3'], B: ['B0', 'B1', 'A1'] });
  });

  it('实例 save()：改分组字段即追加，原组剩余行不改写', async () => {
    const row = rowOf(repository, 'A0');
    row.shelf = 'B';
    await row.save();
    expect(row.sortOrder).toBe('a2');
    expect(repository.update).toHaveBeenCalledTimes(1);
    expect(layout(repository).A).toEqual(['A1', 'A2', 'A3']);
  });

  it('移入 NULL 组', async () => {
    const row = rowOf(repository, 'B1');
    row.shelf = null;
    await ctx.rxdb.entityManager.save(row as never);
    expect(row.sortOrder).toBe('a2');
    expect(layout(repository).null).toEqual(['n0', 'n1', 'B1']);
  });

  it('saveMany：同批 n 条改到同一新组，按批内顺序追加、互不碰撞，一个事务', async () => {
    const rows = ['A2', 'A0', 'A3'].map(id => rowOf(repository, id));
    for (const row of rows) row.shelf = 'B';
    await ctx.rxdb.entityManager.saveMany(rows as never[]);
    const keys = rows.map(row => row.sortOrder!);
    expect(keys).toEqual(['a2', 'a3', 'a4']);
    expect(layout(repository).B).toEqual(['B0', 'B1', 'A2', 'A0', 'A3']);
    expect(ctx.adapter.transaction).toHaveBeenCalledTimes(1);
    expect(ctx.adapter.mutations).toHaveBeenCalledTimes(1);
  });

  it('同批既有新建又有改组进同一组：共用一次尾键读取，键互不碰撞', async () => {
    const created = fresh(ctx, 'B');
    const moved = rowOf(repository, 'A0');
    moved.shelf = 'B';
    await ctx.rxdb.entityManager.saveMany([created, moved] as never[]);
    expect([created.sortOrder, moved.sortOrder]).toEqual(['a2', 'a3']);
    expect(repository.find).toHaveBeenCalledTimes(1);
  });

  it('saveMany 里改组的行带上 sortOrder 进 patch', async () => {
    const row = rowOf(repository, 'A0');
    row.shelf = 'C';
    await ctx.rxdb.entityManager.saveMany([row] as never[]);
    const update = ctx.adapter.mutations.mock.calls[0][0].update.get(ShelfItem);
    expect(update).toContain(row);
    expect(row.sortOrder).toBe('a0');
  });

  it('同一次写入显式给合法键：原样保留，不开事务', async () => {
    await facade().update(rowOf(repository, 'A1') as never, { shelf: 'B', sortOrder: 'Zz' } as never);
    expect(repository.update.mock.calls[0][1]).toEqual({ shelf: 'B', sortOrder: 'Zz' });
    expect(ctx.adapter.transaction).not.toHaveBeenCalled();
  });

  it('同一次写入显式给非法键：invalidKey，零写', async () => {
    const row = rowOf(repository, 'A1');
    row.shelf = 'B';
    row.sortOrder = 'bad key';
    await expectSortOrderError(ctx.rxdb.entityManager.saveMany([row] as never[]), 'invalidKey');
    expect(ctx.adapter.mutations).not.toHaveBeenCalled();
  });

  it('只改非分组字段：不开事务、不动键', async () => {
    const row = rowOf(repository, 'A1');
    row.title = 'renamed';
    await row.save();
    expect(row.sortOrder).toBe('a1');
    expect(ctx.adapter.transaction).not.toHaveBeenCalled();
  });

  it('新组尾键已损坏：corruptAnchor，零写', async () => {
    rowOf(repository, 'B1').sortOrder = 'zz';
    await expectSortOrderError(
      facade().update(rowOf(repository, 'A1') as never, { shelf: 'B' } as never),
      'corruptAnchor'
    );
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('键按码点序递增（与契约同口径）', async () => {
    const rows = ['A0', 'A1'].map(id => rowOf(repository, id));
    for (const row of rows) row.shelf = null;
    await ctx.rxdb.entityManager.saveMany(rows as never[]);
    const keys = ['a0', 'a1', ...rows.map(row => row.sortOrder!)];
    expect(keys).toEqual([...keys].sort(byCodePoint));
  });
});
