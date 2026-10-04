/**
 * @fileoverview US-028 阶段 A — 门面与批量入口的手动排序行为（AC#1 后半、AC#2、AC#3、AC#10）。
 *
 * unit 层用内存仓库替身（见 `fixtures/sortable-test-utils.ts`）；「两端 SQL 同序」与并发由 rxdb-test 契约套件验证。
 *
 * 1. 读归一化：四个查询入口未给 `orderBy` 时补 `[sortOrder asc, id asc]`，显式的原样透传；
 * 2. 缺键创建在事务内追加到末尾，同批 n 条互不碰撞；显式键先校验，非法整批拒绝、一条不写；
 * 3. `reorder()` 首部 / 尾部 / 前移 / 后移 / 原位零写，过期目标与非法目标报对应 reason；
 * 4. 未声明 `manualOrder` 的实体行为不变（AC#10）。
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
import type { IRepository } from '../../repository/repository.interface.js';
import { uuid } from '../../rxdb-utils.js';
import type { RxDB } from '../../RxDB.js';
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
  { name: 'sortOrder', type: PropertyType.string }
];

@Entity({ name: 'SortCategory', manualOrder: true, properties: PROPERTIES })
class SortCategory extends EntityBase {
  static [ENTITY_STATIC_TYPES]: { idType: UUID };
  title!: string;
  sortOrder!: string;
}

@Entity({ name: 'SortLocked', manualOrder: true, properties: PROPERTIES, permissions: { update: 'system' } })
class SortLocked extends EntityBase {
  static [ENTITY_STATIC_TYPES]: { idType: UUID };
  title!: string;
  sortOrder!: string;
}

/** 恰好有 `sortOrder` 字段但没声明 `manualOrder` 的实体（AC#10） */
@Entity({
  name: 'PlainNote',
  properties: [
    { name: 'title', type: PropertyType.string },
    { ...PROPERTIES[1], nullable: true }
  ]
})
class PlainNote extends EntityBase {
  static [ENTITY_STATIC_TYPES]: { idType: UUID };
  title!: string;
  sortOrder?: string | null;
}

interface Context {
  rxdb: RxDB;
  adapter: MockLocalAdapter;
  cleanup: () => Promise<void>;
}

const setup = async (): Promise<Context> => createTestDB({ entities: [SortCategory, SortLocked, PlainNote] });

/** 把内存仓库装成所有实体的默认仓库 */
const installMemory = (ctx: Context, rows: Sortable[] = []): MemoryRepository => {
  const repository = memoryRepository(rows);
  stubAdapterRepository(ctx.adapter, repository);
  return repository;
};

/** 已落库的行 */
const stored = <T extends EntityType>(ctx: Context, EntityType: T, id: string, sortOrder: string): Sortable =>
  ctx.rxdb.entityManager.createEntityRef(EntityType, { id, title: id, sortOrder } as never, {
    local: true,
    modified: false
  }) as Sortable;

/** 还没落库的新实体；不给键即缺键创建 */
const fresh = <T extends EntityType>(ctx: Context, EntityType: T, sortOrder?: unknown): Sortable => {
  const entity = ctx.rxdb.entityManager.createEntityRef(EntityType, { id: uuid() } as never) as Sortable;
  entity.title = 'fresh';
  if (sortOrder !== undefined) entity.sortOrder = sortOrder as string;
  return entity;
};

/** 当前序列的 id 顺序（与默认排序同口径） */
const orderOf = (repository: MemoryRepository): string[] =>
  calculateOrderBy(repository.rows, [
    { field: 'sortOrder', sort: 'asc' },
    { field: 'id', sort: 'asc' }
  ]).map(row => row.id as string);

const DEFAULT_ORDER_BY = [
  { field: 'sortOrder', sort: 'asc' },
  { field: 'id', sort: 'asc' }
];
const WHERE = { combinator: 'and' as const, rules: [] };

describe('US-028 AC#1 读归一化：未给 orderBy 时补默认排序', () => {
  let ctx: Context;
  let repository: IRepository<EntityType>;

  beforeEach(async () => {
    ctx = await setup();
    repository = ctx.adapter.stubEntityRepository(SortCategory, [stored(ctx, SortCategory, 'a', 'a0') as never]);
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  const facade = () => ctx.rxdb.entityManager.getRepository(SortCategory);

  it.each([
    ['findAll', () => firstValueFrom(facade().findAll({ where: WHERE }))],
    ['find', () => firstValueFrom(facade().find({ where: WHERE }))],
    ['findOne', () => firstValueFrom(facade().findOne({ where: WHERE }))],
    ['findOneOrFail', () => firstValueFrom(facade().findOneOrFail({ where: WHERE }))]
  ])('%s 补 [sortOrder asc, id asc]', async (_label, run) => {
    await run();
    expect(repository.find).toHaveBeenCalledWith(expect.objectContaining({ orderBy: DEFAULT_ORDER_BY }));
  });

  it('find 的分页默认值与默认排序同时生效', async () => {
    await firstValueFrom(facade().find({ where: WHERE }));
    expect(repository.find).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: DEFAULT_ORDER_BY, limit: 100, offset: 0 })
    );
  });

  it('显式 orderBy 原样透传，不追加 id', async () => {
    const orderBy = [{ field: 'title', sort: 'desc' as const }];
    await firstValueFrom(facade().findAll({ where: WHERE, orderBy }));
    expect(repository.find).toHaveBeenCalledWith(expect.objectContaining({ orderBy }));
  });

  it('补排序与不补排序的同条件查询不共用缓存条目', async () => {
    await firstValueFrom(facade().findAll({ where: WHERE }));
    await firstValueFrom(facade().findAll({ where: WHERE, orderBy: [{ field: 'title', sort: 'asc' }] }));
    expect(repository.find).toHaveBeenCalledTimes(2);
  });

  it('AC#10 未声明 manualOrder 的实体不补排序', async () => {
    const plain = ctx.adapter.stubEntityRepository(PlainNote, [stored(ctx, PlainNote, 'p', 'a0') as never]);
    await firstValueFrom(ctx.rxdb.entityManager.getRepository(PlainNote).findAll({ where: WHERE }));
    expect(plain.find).toHaveBeenCalledWith({ where: WHERE });
  });
});

describe('US-028 AC#2 缺键创建追加到末尾', () => {
  let ctx: Context;

  beforeEach(async () => {
    ctx = await setup();
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it('空表：门面 create 取 a0，且在主适配器事务内写入', async () => {
    const repository = installMemory(ctx);
    const created = await ctx.rxdb.entityManager.getRepository(SortCategory).create(fresh(ctx, SortCategory) as never);
    expect((created as Sortable).sortOrder).toBe('a0');
    expect(ctx.adapter.transaction).toHaveBeenCalledTimes(1);
    expect(repository.create).toHaveBeenCalledTimes(1);
  });

  it('非空表：键排在现有尾键之后', async () => {
    const repository = installMemory(ctx, [stored(ctx, SortCategory, 'x', 'a0'), stored(ctx, SortCategory, 'y', 'a5')]);
    const entity = fresh(ctx, SortCategory);
    await ctx.rxdb.entityManager.save(entity as never);
    expect(entity.sortOrder! > 'a5').toBe(true);
    expect(orderOf(repository)).toEqual(['x', 'y', entity.id]);
  });

  it('实例 save() 同样追加', async () => {
    installMemory(ctx, [stored(ctx, SortCategory, 'x', 'a0')]);
    const entity = fresh(ctx, SortCategory);
    await entity.save();
    expect(entity.sortOrder).toBe('a1');
  });

  it('批量：同批 n 条缺键创建一次读尾键、键互不相同且按批内顺序递增', async () => {
    const repository = installMemory(ctx, [stored(ctx, SortCategory, 'x', 'a0')]);
    const entities = [fresh(ctx, SortCategory), fresh(ctx, SortCategory), fresh(ctx, SortCategory)];
    await ctx.rxdb.entityManager.saveMany(entities as never[]);
    const keys = entities.map(entity => entity.sortOrder!);
    expect(new Set(keys).size).toBe(3);
    expect(['a0', ...keys]).toEqual(['a0', ...keys].sort(byCodePoint));
    expect(repository.find).toHaveBeenCalledTimes(1);
    expect(ctx.adapter.transaction).toHaveBeenCalledTimes(1);
    expect(ctx.adapter.mutations).toHaveBeenCalledTimes(1);
  });

  it('批量：显式键与缺键混合，只给缺键的追加，显式键原样', async () => {
    installMemory(ctx, [stored(ctx, SortCategory, 'x', 'a0')]);
    const explicit = fresh(ctx, SortCategory, 'Zz');
    const missing = fresh(ctx, SortCategory);
    await ctx.rxdb.entityManager.saveMany([explicit, missing] as never[]);
    expect(explicit.sortOrder).toBe('Zz');
    expect(missing.sortOrder).toBe('a1');
  });

  it('批量：跨类型时只读缺键那一类的尾键，同批合法改键的更新一并写入', async () => {
    const repository = installMemory(ctx, [stored(ctx, SortCategory, 'x', 'a0')]);
    const explicitOther = fresh(ctx, SortLocked, 'a7');
    const missing = fresh(ctx, SortCategory);
    const moved = repository.rows[0];
    moved.sortOrder = 'a9';
    await ctx.rxdb.entityManager.saveMany([explicitOther, missing, moved] as never[]);
    expect(explicitOther.sortOrder).toBe('a7');
    // 内存替身与实体共享实例，读尾键时已看到改后的 a9；真库在事务内读到的是 a0——两者都只要求排在尾键之后
    expect(missing.sortOrder! > 'a0').toBe(true);
    expect(repository.find).toHaveBeenCalledTimes(1);
    expect(ctx.adapter.mutations).toHaveBeenCalledTimes(1);
    expect(ctx.adapter.mutations.mock.calls[0][0].update.get(SortCategory)).toContain(moved);
  });

  it('显式合法键：不开事务，走原路径', async () => {
    const repository = installMemory(ctx);
    await ctx.rxdb.entityManager.getRepository(SortCategory).create(fresh(ctx, SortCategory, 'a3') as never);
    expect(ctx.adapter.transaction).not.toHaveBeenCalled();
    expect(repository.create).toHaveBeenCalledTimes(1);
  });

  it('尾键已损坏：corruptAnchor，一条不写', async () => {
    const repository = installMemory(ctx, [stored(ctx, SortCategory, 'x', 'zz')]);
    await expectSortOrderError(
      ctx.rxdb.entityManager.getRepository(SortCategory).create(fresh(ctx, SortCategory) as never),
      'corruptAnchor'
    );
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('AC#10 未声明 manualOrder 的实体缺 sortOrder 照常创建，不开事务', async () => {
    const repository = installMemory(ctx);
    const created = await ctx.rxdb.entityManager.getRepository(PlainNote).create(fresh(ctx, PlainNote) as never);
    expect((created as Sortable).sortOrder ?? null).toBeNull();
    expect(ctx.adapter.transaction).not.toHaveBeenCalled();
    expect(repository.create).toHaveBeenCalledTimes(1);
  });
});

describe('US-028 AC#2 显式键先校验，非法整批拒绝', () => {
  let ctx: Context;
  let repository: MemoryRepository;

  beforeEach(async () => {
    ctx = await setup();
    repository = installMemory(ctx, [stored(ctx, SortCategory, 'x', 'a0')]);
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it.each(['', 'a', 'a0 ', 'b0', 42])('门面 create 拒绝 %j', async key => {
    await expectSortOrderError(
      ctx.rxdb.entityManager.getRepository(SortCategory).create(fresh(ctx, SortCategory, key) as never),
      'invalidKey'
    );
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('门面 update 的 patch 改到非法键被拒', async () => {
    const row = repository.rows[0];
    await expectSortOrderError(
      ctx.rxdb.entityManager.getRepository(SortCategory).update(row as never, { sortOrder: 'bad key' } as never),
      'invalidKey'
    );
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('门面 update 不碰 sortOrder 时不校验', async () => {
    const row = repository.rows[0];
    await ctx.rxdb.entityManager.getRepository(SortCategory).update(row as never, { title: 't' } as never);
    expect(repository.update).toHaveBeenCalledTimes(1);
  });

  it('批量：一条非法显式键，整批不写（含同批合法行）', async () => {
    const edited = repository.rows[0];
    edited.sortOrder = 'not a key';
    await expectSortOrderError(
      ctx.rxdb.entityManager.saveMany([fresh(ctx, SortCategory), edited] as never[]),
      'invalidKey'
    );
    expect(ctx.adapter.mutations).not.toHaveBeenCalled();
    expect(ctx.adapter.transaction).not.toHaveBeenCalled();
  });
});

describe('US-028 AC#3 reorder()', () => {
  let ctx: Context;
  let repository: MemoryRepository;

  beforeEach(async () => {
    ctx = await setup();
    repository = installMemory(ctx, [
      stored(ctx, SortCategory, 'A', 'a0'),
      stored(ctx, SortCategory, 'B', 'a1'),
      stored(ctx, SortCategory, 'C', 'a2'),
      stored(ctx, SortCategory, 'D', 'a3')
    ]);
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  const reorder = (id: string, target: Parameters<ReturnType<typeof facade>['reorder']>[1]) =>
    facade().reorder(id as UUID, target);
  const facade = () => ctx.rxdb.entityManager.getRepository(SortCategory);

  it('移到首部：只改 sortOrder 一个字段，事务恰一次', async () => {
    await reorder('D', { prevId: null, nextId: 'A' as UUID });
    expect(orderOf(repository)).toEqual(['D', 'A', 'B', 'C']);
    expect(repository.update).toHaveBeenCalledTimes(1);
    expect(Object.keys(repository.update.mock.calls[0][1])).toEqual(['sortOrder']);
    expect(ctx.adapter.transaction).toHaveBeenCalledTimes(1);
  });

  it('移到尾部（nextId 为 null）', async () => {
    await reorder('A', { prevId: 'D' as UUID, nextId: null });
    expect(orderOf(repository)).toEqual(['B', 'C', 'D', 'A']);
  });

  it('追加到整表末尾（group: {}）', async () => {
    await reorder('B', { group: {} });
    expect(orderOf(repository)).toEqual(['A', 'C', 'D', 'B']);
  });

  it('后移到两行之间', async () => {
    await reorder('A', { prevId: 'C' as UUID, nextId: 'D' as UUID });
    expect(orderOf(repository)).toEqual(['B', 'C', 'A', 'D']);
  });

  it('前移到两行之间', async () => {
    await reorder('D', { prevId: 'A' as UUID, nextId: 'B' as UUID });
    expect(orderOf(repository)).toEqual(['A', 'D', 'B', 'C']);
  });

  it('已在目标位置：零写，原样返回', async () => {
    const row = await reorder('B', { prevId: 'A' as UUID, nextId: 'C' as UUID });
    expect(row.id).toBe('B');
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('已是末尾再追加到末尾：零写', async () => {
    await reorder('D', { group: {} });
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('被移动行不存在：notFound', async () => {
    await expectSortOrderError(reorder('Z', { group: {} }), 'notFound');
  });

  it('邻居不存在：staleTarget', async () => {
    await expectSortOrderError(reorder('A', { prevId: 'C' as UUID, nextId: 'Z' as UUID }), 'staleTarget');
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('邻居之间还夹着别的行：staleTarget', async () => {
    await expectSortOrderError(reorder('D', { prevId: 'A' as UUID, nextId: 'C' as UUID }), 'staleTarget');
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('两邻居顺序颠倒：corruptAnchor', async () => {
    await expectSortOrderError(reorder('D', { prevId: 'B' as UUID, nextId: 'A' as UUID }), 'corruptAnchor');
  });

  it.each([
    ['两侧都为 null', { prevId: null, nextId: null }],
    ['邻居就是移动行', { prevId: 'A', nextId: 'B' }],
    ['两侧是同一行', { prevId: 'C', nextId: 'C' }],
    ['阶段 A 给了分组取值', { group: { completed: true } }]
  ])('非法目标（%s）：invalidTarget，不开事务', async (_label, target) => {
    await expectSortOrderError(reorder('A', target as never), 'invalidTarget');
    expect(ctx.adapter.transaction).not.toHaveBeenCalled();
  });

  it('未声明 manualOrder 的实体：notManualOrder', async () => {
    await expectSortOrderError(
      ctx.rxdb.entityManager.getRepository(PlainNote).reorder('A' as UUID, { group: {} }),
      'notManualOrder'
    );
  });

  it('update 只许系统写：开事务前抛 PermissionDeniedError', async () => {
    const error = await rejectionOf(
      ctx.rxdb.entityManager.getRepository(SortLocked).reorder('A' as UUID, { group: {} })
    );
    expect(error).toBeInstanceOf(PermissionDeniedError);
    expect(ctx.adapter.transaction).not.toHaveBeenCalled();
  });
});
