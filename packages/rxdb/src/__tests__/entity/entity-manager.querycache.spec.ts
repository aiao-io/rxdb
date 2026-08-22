/**
 * US-020 阶段 A —— 批量入口（`EntityManager.mutations` / `saveMany` / `removeMany`）的 QueryCache 去向。
 *
 * 断言全部经 **`EntityManager`** 而不是直接调 `primary-adapter.ts` 的纯函数：
 * 病灶 1 的形态就是「判定函数是对的，生产入口没接上」，只测纯函数无法证伪（AC#10）。
 */
import { Observable, of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EntityBase } from '../../entity/entity-base.js';
import { Entity } from '../../entity/entity.decorator.js';
import { ENTITY_STATIC_TYPES, UUID } from '../../entity/entity.interface.js';
import { PropertyType, SyncType } from '../../entity/metadata-options.interface.js';
import { RxDBMixedPrimaryAdapterError } from '../../entity/primary-adapter.js';
import { TreeAdjacencyListEntityBase } from '../../entity/tree-entity-base.js';
import { TreeEntity } from '../../entity/tree-entity.decorator.js';
import type { IRxDBAdapter } from '../../rxdb-adapter.js';
import { uuid } from '../../rxdb-utils.js';
import { RxDB } from '../../RxDB.js';
import { RxDBMixedVersionedCacheTransactionError } from '../../RxDBError.js';

@Entity({
  name: 'CachedProduct',
  properties: [{ name: 'title', type: PropertyType.string }],
  sync: {
    type: SyncType.QueryCache,
    local: { adapter: 'sqlite' },
    remote: { adapter: 'supabase' }
  }
})
class CachedProduct extends EntityBase {
  static [ENTITY_STATIC_TYPES]: { idType: UUID };
  title!: string;
}

@Entity({
  name: 'VersionedTodo',
  properties: [{ name: 'title', type: PropertyType.string }],
  sync: {
    type: SyncType.Full,
    local: { adapter: 'sqlite' },
    remote: { adapter: 'supabase' }
  }
})
class VersionedTodo extends EntityBase {
  static [ENTITY_STATIC_TYPES]: { idType: UUID };
  title!: string;
}

/** 树实体 + QueryCache：树查询要递归本地表，缓存只保证「查过的 where 命中的行」在本地 */
@TreeEntity({
  name: 'CachedMenu',
  properties: [{ name: 'title', type: PropertyType.string }],
  sync: {
    type: SyncType.QueryCache,
    local: { adapter: 'sqlite' },
    remote: { adapter: 'supabase' }
  }
})
class CachedMenu extends TreeAdjacencyListEntityBase {}

/** 不写 sync 的树实体：生效的是数据库级配置 */
@TreeEntity({
  name: 'PlainMenu',
  properties: [{ name: 'title', type: PropertyType.string }]
})
class PlainMenu extends TreeAdjacencyListEntityBase {}

@Entity({
  name: 'RemoteOnlyNote',
  properties: [{ name: 'title', type: PropertyType.string }],
  sync: { type: SyncType.None, remote: { adapter: 'supabase' } }
})
class RemoteOnlyNote extends EntityBase {
  static [ENTITY_STATIC_TYPES]: { idType: UUID };
  title!: string;
}

type AnyEntity = { id: string };

const createLocalAdapter = () => {
  const rows: AnyEntity[] = [];
  const adapter = {
    name: 'sqlite',
    mutations: vi.fn(async () => []),
    // 本地行仓储：QueryCache 的读出口（D8），批量写路径不应经过它的 create/update/remove
    create: vi.fn(async (entity: AnyEntity) => entity),
    update: vi.fn(async (entity: AnyEntity) => entity),
    remove: vi.fn(async (entity: AnyEntity) => entity),
    find: vi.fn(async () => rows),
    // QueryCacheLocalAdapter 的三个必需 duck
    getMetadataByIds: vi.fn(() => of(new Map<string, string>())),
    upsertMany: vi.fn((_entityName: string, data: AnyEntity[]) => {
      rows.push(...data);
      return of(undefined);
    }),
    deleteByIds: vi.fn(() => of(undefined)),
    getRepository: () => adapter
  };
  return adapter;
};

const createRemoteAdapter = () => {
  const adapter = {
    name: 'supabase',
    mutations: vi.fn(async () => []),
    create: vi.fn((_entityName: string, data: AnyEntity) => of(data)),
    update: vi.fn((_entityName: string, id: string, patch: Partial<AnyEntity>) => of({ ...patch, id })),
    delete: vi.fn(() => of(undefined)),
    fetchMetadata: vi.fn(() => of([])),
    findByIds: vi.fn(() => of([])),
    getRepository: () => adapter
  };
  return adapter;
};

/** `create` 收敛：新实体必须先进 identity cache 再被标脏，否则不会进批量集合 */
const dirtyEntity = <T extends { title: string }>(entity: T): T => {
  entity.title = 'dirty';
  return entity;
};

const createDatabase = (dbName: string, entities: Parameters<typeof RxDB>[0]['entities']) => {
  const local = createLocalAdapter();
  const remote = createRemoteAdapter();
  const rxdb = new RxDB({
    dbName,
    entities,
    sync: { type: SyncType.Full, local: { adapter: 'sqlite' }, remote: { adapter: 'supabase' } }
  });
  rxdb.adapter('sqlite', () => local as unknown as IRxDBAdapter);
  rxdb.adapter('supabase', () => remote as unknown as IRxDBAdapter);
  rxdb.init();
  return { rxdb, local, remote };
};

describe('US-020 阶段 A：批量入口的 QueryCache 去向', () => {
  let ctx: ReturnType<typeof createDatabase>;

  beforeEach(() => {
    ctx = createDatabase('QueryCacheBatch', [CachedProduct, VersionedTodo, RemoteOnlyNote]);
  });

  // AC#6：两种写语义不可调和，入口拒绝，不得写出去一半
  it('AC#6 QueryCache 与 Full/Filter 同批时抛 RxDBMixedVersionedCacheTransactionError', async () => {
    const product = dirtyEntity(ctx.rxdb.entityManager.createEntityRef(CachedProduct, { title: 'p', id: uuid() }));
    const todo = dirtyEntity(ctx.rxdb.entityManager.createEntityRef(VersionedTodo, { title: 't', id: uuid() }));

    await expect(ctx.rxdb.entityManager.saveMany([product, todo])).rejects.toThrow(
      RxDBMixedVersionedCacheTransactionError
    );
    expect(ctx.local.mutations).not.toHaveBeenCalled();
    expect(ctx.remote.mutations).not.toHaveBeenCalled();
    expect(ctx.remote.create).not.toHaveBeenCalled();
  });

  // AC#6：错误码由 US-306 FR-046 指定，跨故事复用，不得改名
  it('AC#6 错误码是 US-306 FR-046 指定的 mixed_versioned_cache_transaction', async () => {
    const product = dirtyEntity(ctx.rxdb.entityManager.createEntityRef(CachedProduct, { title: 'p', id: uuid() }));
    const todo = dirtyEntity(ctx.rxdb.entityManager.createEntityRef(VersionedTodo, { title: 't', id: uuid() }));

    const error = await ctx.rxdb.entityManager.saveMany([product, todo]).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(RxDBMixedVersionedCacheTransactionError);
    expect((error as RxDBMixedVersionedCacheTransactionError).code).toBe('mixed_versioned_cache_transaction');
    expect((error as RxDBMixedVersionedCacheTransactionError).cacheEntities).toEqual(['CachedProduct']);
    expect((error as RxDBMixedVersionedCacheTransactionError).versionedEntities).toEqual(['VersionedTodo']);
  });

  // AC#5：主端不一致仍是既有错误，本故事不放宽，也不被新预检抢走
  it('AC#5 local-primary 与 remote-only 同批仍抛 RxDBMixedPrimaryAdapterError', async () => {
    const todo = dirtyEntity(ctx.rxdb.entityManager.createEntityRef(VersionedTodo, { title: 't', id: uuid() }));
    const note = dirtyEntity(ctx.rxdb.entityManager.createEntityRef(RemoteOnlyNote, { title: 'n', id: uuid() }));

    await expect(ctx.rxdb.entityManager.saveMany([todo, note])).rejects.toThrow(RxDBMixedPrimaryAdapterError);
  });

  // D3：纯 QueryCache 批次不得走 adapter.mutations() 直写——那条路写的是 local changelog
  it('D3 纯 QueryCache 批次走 remote-then-local，不碰 adapter.mutations', async () => {
    const one = dirtyEntity(ctx.rxdb.entityManager.createEntityRef(CachedProduct, { title: 'a', id: uuid() }));
    const two = dirtyEntity(ctx.rxdb.entityManager.createEntityRef(CachedProduct, { title: 'b', id: uuid() }));

    await ctx.rxdb.entityManager.saveMany([one, two]);

    expect(ctx.local.mutations).not.toHaveBeenCalled();
    expect(ctx.remote.mutations).not.toHaveBeenCalled();
    expect(ctx.remote.create).toHaveBeenCalledTimes(2);
    expect(ctx.local.upsertMany).toHaveBeenCalledTimes(2);
  });

  // D3：已落本地的实体走 update 分桶，同样是 remote-then-local
  it('D3 纯 QueryCache 批量更新走 remote-then-local', async () => {
    const one = dirtyEntity(
      ctx.rxdb.entityManager.createEntityRef(CachedProduct, { title: 'a', id: uuid() }, { local: true })
    );

    await ctx.rxdb.entityManager.saveMany([one]);

    expect(ctx.local.mutations).not.toHaveBeenCalled();
    expect(ctx.remote.update).toHaveBeenCalledTimes(1);
    expect(ctx.local.upsertMany).toHaveBeenCalledTimes(1);
  });

  // D3：批量删除同样走 QueryCacheRepository.delete
  it('D3 纯 QueryCache 批量删除走 remote-then-local', async () => {
    // 只有 `local: true` 的实体才进 remove 分桶：没落过库的实体没有可删的东西
    const one = ctx.rxdb.entityManager.createEntityRef(CachedProduct, { title: 'a', id: uuid() }, { local: true });

    await ctx.rxdb.entityManager.removeMany([one]);

    expect(ctx.local.mutations).not.toHaveBeenCalled();
    expect(ctx.remote.delete).toHaveBeenCalledTimes(1);
    expect(ctx.local.deleteByIds).toHaveBeenCalledTimes(1);
  });

  // AC#8 + D12：纯元数据就能判定的组合，在配置期拒绝，不拖到首次调用
  it('AC#8 TreeRepository + QueryCache 在 init() 即 fail-fast', () => {
    expect(() => createDatabase('TreeQueryCache', [CachedMenu])).toThrow(/QueryCache/);
  });

  // AC#8：违规来自数据库级 sync 时同样在配置期拒绝——实体不写 sync 就继承它
  it('AC#8 数据库级 QueryCache 撞上树实体也在 init() 拒绝', () => {
    const local = createLocalAdapter();
    const remote = createRemoteAdapter();
    const rxdb = new RxDB({
      dbName: 'TreeQueryCacheDatabaseLevel',
      entities: [PlainMenu],
      sync: { type: SyncType.QueryCache, local: { adapter: 'sqlite' }, remote: { adapter: 'supabase' } }
    });
    rxdb.adapter('sqlite', () => local as unknown as IRxDBAdapter);
    rxdb.adapter('supabase', () => remote as unknown as IRxDBAdapter);

    expect(() => rxdb.init()).toThrow(/QueryCache/);
  });

  // AC#8：一条违规则一条都不绑定，不提供半套树 + 缓存
  it('AC#8 违规时同批其他实体也不绑定', () => {
    expect(() => createDatabase('TreeQueryCacheMixed', [CachedProduct, CachedMenu])).toThrow(/QueryCache/);
  });

  // AC#6：远端写失败照常上抛，不被预检吞掉
  it('AC#6 预检通过后的远端失败原样上抛', async () => {
    ctx.remote.create.mockReturnValueOnce(new Observable(subscriber => subscriber.error(new Error('remote down'))));
    const one = dirtyEntity(ctx.rxdb.entityManager.createEntityRef(CachedProduct, { title: 'a', id: uuid() }));

    await expect(ctx.rxdb.entityManager.saveMany([one])).rejects.toThrow('remote down');
  });
});
