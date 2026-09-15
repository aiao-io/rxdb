/**
 * US-020 阶段 A —— 批量入口（`EntityManager.saveMany` / `removeMany`）里**打到读引擎**的那几条。
 *
 * 断言全部经 **`EntityManager`** 而不是直接调 `primary-adapter.ts` 的纯函数：
 * 病灶 1 的形态就是「判定函数是对的，生产入口没接上」，只测纯函数无法证伪（AC#10）。
 *
 * @remarks
 * 这几条与留在 `@aiao/rxdb` 的 `entity/entity-manager.querycache.spec.ts` 是同一批用例切开的
 * 两半（US-025 阶段 B）。切口在「断言看得见谁」：分桶、混批拒绝、树实体 fail-fast 只碰核心，
 * 留在核心；`remote.create` / `local.upsertMany` 的去向要一路走到 `QueryCacheEngine.create()`
 * 才发生，核心包不能 devDepend 插件包（Nx 项目图会出环），因此这一半搬到这里。
 */
import type { IRxDBAdapter } from '@aiao/rxdb';
import { Entity, ENTITY_STATIC_TYPES, EntityBase, PropertyType, RxDB, SyncType, UUID, uuid } from '@aiao/rxdb';
import { Observable, of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RxDBQueryCacheEngineFactory } from '../query-cache-engine.factory.js';

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

const createDatabase = (dbName: string, entities: ConstructorParameters<typeof RxDB>[0]['entities']) => {
  const local = createLocalAdapter();
  const remote = createRemoteAdapter();
  const rxdb = new RxDB({
    dbName,
    entities,
    sync: { type: SyncType.Full, local: { adapter: 'sqlite' }, remote: { adapter: 'supabase' } }
  });
  rxdb.adapter('sqlite', () => local as unknown as IRxDBAdapter);
  rxdb.adapter('supabase', () => remote as unknown as IRxDBAdapter);
  // 直填槽位而不是 `rxdb.plugin(rxDBPluginQueryCache())`：本用例只跑到 `init()`，
  // 而插件安装排在 `connect()`（US-025 B1）。
  rxdb.queryCacheEngine(new RxDBQueryCacheEngineFactory());
  rxdb.init();
  return { rxdb, local, remote };
};

describe('US-020 阶段 A：批量入口的 QueryCache 去向（经真引擎）', () => {
  let ctx: ReturnType<typeof createDatabase>;

  beforeEach(() => {
    ctx = createDatabase('QueryCacheBatch', [CachedProduct, VersionedTodo, RemoteOnlyNote]);
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

  // D3：批量删除同样走 QueryCacheEngine.delete
  it('D3 纯 QueryCache 批量删除走 remote-then-local', async () => {
    // 只有 `local: true` 的实体才进 remove 分桶：没落过库的实体没有可删的东西
    const one = ctx.rxdb.entityManager.createEntityRef(CachedProduct, { title: 'a', id: uuid() }, { local: true });

    await ctx.rxdb.entityManager.removeMany([one]);

    expect(ctx.local.mutations).not.toHaveBeenCalled();
    expect(ctx.remote.delete).toHaveBeenCalledTimes(1);
    expect(ctx.local.deleteByIds).toHaveBeenCalledTimes(1);
  });

  // AC#6：远端写失败照常上抛，不被预检吞掉
  it('AC#6 预检通过后的远端失败原样上抛', async () => {
    ctx.remote.create.mockReturnValueOnce(new Observable(subscriber => subscriber.error(new Error('remote down'))));
    const one = dirtyEntity(ctx.rxdb.entityManager.createEntityRef(CachedProduct, { title: 'a', id: uuid() }));

    await expect(ctx.rxdb.entityManager.saveMany([one])).rejects.toThrow('remote down');
  });
});
