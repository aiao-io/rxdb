/**
 * @fileoverview US-027 阶段 B — 公开写入口的权限判定（AC#1、6～8）。
 *
 * unit 层的替身适配器不存行，所以这里断言的是「写没有发出去」：仓储桩的 create / update / remove
 * 与适配器的 `mutations()` 一次都没被调用。「行原样」由 PGlite 集成层的同名 spec 用真库验证。
 *
 * 1. AC#6 每个单条入口 × 对应操作都抛 `PermissionDeniedError`，违规清单恰一项；
 * 2. AC#7 批量入口整批预检，清单列出批内全部违规，不止第一条；
 * 3. AC#8 QueryCache 批次（逐条 remote-then-local、本身不原子）也在任何写发出之前被拒；
 * 4. AC#1 未配置 `permissions` 的实体经同样的入口照常写出。
 */

import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EntityBase } from '../../entity/entity-base.js';
import { PermissionDeniedError } from '../../entity/entity-permissions.js';
import { Entity } from '../../entity/entity.decorator.js';
import { ENTITY_STATIC_TYPES, type EntityType, type UUID } from '../../entity/entity.interface.js';
import { PropertyType, SyncType } from '../../entity/metadata-options.interface.js';
import type { EntityPropertyMetadataOptions } from '../../entity/property-types.interface.js';
import type { IRepository } from '../../repository/repository.interface.js';
import type { IRxDBAdapter } from '../../rxdb-adapter.js';
import { getEntityStatus, uuid } from '../../rxdb-utils.js';
import { RxDB } from '../../RxDB.js';
import { RxDBError } from '../../RxDBError.js';
import { registerRxDBTeardown } from '../fixtures/rxdb-lifecycle.js';
import { createTestDB, type MockLocalAdapter } from '../fixtures/test-db-setup.js';

const TITLE: EntityPropertyMetadataOptions[] = [{ name: 'title', type: PropertyType.string }];

@Entity({ name: 'PermCreateLocked', properties: TITLE, permissions: { create: 'system' } })
class PermCreateLocked extends EntityBase {
  static [ENTITY_STATIC_TYPES]: { idType: UUID };
  title!: string;
}

@Entity({ name: 'PermUpdateLocked', properties: TITLE, permissions: { update: 'system' } })
class PermUpdateLocked extends EntityBase {
  static [ENTITY_STATIC_TYPES]: { idType: UUID };
  title!: string;
}

@Entity({ name: 'PermDeleteLocked', properties: TITLE, permissions: { delete: 'system' } })
class PermDeleteLocked extends EntityBase {
  static [ENTITY_STATIC_TYPES]: { idType: UUID };
  title!: string;
}

@Entity({ name: 'PermFree', properties: TITLE })
class PermFree extends EntityBase {
  static [ENTITY_STATIC_TYPES]: { idType: UUID };
  title!: string;
}

type Titled = EntityBase & { title: string };

interface Context {
  rxdb: RxDB;
  adapter: MockLocalAdapter;
  repositories: Map<EntityType, IRepository<EntityType>>;
  cleanup: () => Promise<void>;
}

const setup = async (): Promise<Context> => {
  const entities = [PermCreateLocked, PermUpdateLocked, PermDeleteLocked, PermFree];
  const { rxdb, adapter, cleanup } = await createTestDB({ entities });
  const repositories = new Map(entities.map(entity => [entity as EntityType, adapter.stubEntityRepository(entity)]));
  return { rxdb, adapter, repositories, cleanup };
};

/** 还没落库的新实体，已标脏，`save()` 会把它当 create */
const fresh = <T extends EntityType>(ctx: Context, EntityType: T): InstanceType<T> & Titled => {
  const entity = ctx.rxdb.entityManager.createEntityRef(EntityType, { id: uuid() } as never) as InstanceType<T> &
    Titled;
  entity.title = 'fresh';
  return entity;
};

/** 已落库的行 */
const stored = <T extends EntityType>(ctx: Context, EntityType: T): InstanceType<T> & Titled =>
  ctx.rxdb.entityManager.createEntityRef(EntityType, { id: uuid(), title: 'stored' } as never, {
    local: true,
    modified: false
  }) as InstanceType<T> & Titled;

/** 已落库且改了一个字段，`save()` 会把它当 update */
const edited = <T extends EntityType>(ctx: Context, EntityType: T): InstanceType<T> & Titled => {
  const entity = stored(ctx, EntityType);
  entity.title = 'edited';
  return entity;
};

const rejectionOf = (write: Promise<unknown>): Promise<unknown> =>
  write.then(
    () => {
      throw new Error('写入应被拒绝，却成功了');
    },
    (error: unknown) => error
  );

/** 一次写都没发出去：仓储桩三方法与适配器批量入口全部未被调用 */
const expectNothingWritten = (ctx: Context): void => {
  for (const repository of ctx.repositories.values()) {
    expect(repository.create).not.toHaveBeenCalled();
    expect(repository.update).not.toHaveBeenCalled();
    expect(repository.remove).not.toHaveBeenCalled();
  }
  expect(ctx.adapter.mutations).not.toHaveBeenCalled();
};

type Entrance = readonly [label: string, run: (ctx: Context) => Promise<unknown>];

describe('US-027 AC#6 单条入口逐个拒绝', () => {
  let ctx: Context;

  beforeEach(async () => {
    ctx = await setup();
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  const createEntrances: Entrance[] = [
    [
      '门面 Repository.create()',
      c => c.rxdb.entityManager.getRepository(PermCreateLocked).create(fresh(c, PermCreateLocked))
    ],
    ['EntityManager.create()', c => c.rxdb.entityManager.create(fresh(c, PermCreateLocked))],
    ['EntityManager.save()', c => c.rxdb.entityManager.save(fresh(c, PermCreateLocked))],
    ['实体实例 save()', c => fresh(c, PermCreateLocked).save()]
  ];

  const updateEntrances: Entrance[] = [
    [
      '门面 Repository.update()',
      c => c.rxdb.entityManager.getRepository(PermUpdateLocked).update(stored(c, PermUpdateLocked), { title: 'x' })
    ],
    ['EntityManager.update()', c => c.rxdb.entityManager.update(edited(c, PermUpdateLocked))],
    ['EntityManager.save()', c => c.rxdb.entityManager.save(edited(c, PermUpdateLocked))],
    ['实体实例 save()', c => edited(c, PermUpdateLocked).save()]
  ];

  const deleteEntrances: Entrance[] = [
    [
      '门面 Repository.remove()',
      c => c.rxdb.entityManager.getRepository(PermDeleteLocked).remove(stored(c, PermDeleteLocked))
    ],
    ['EntityManager.remove()', c => c.rxdb.entityManager.remove(stored(c, PermDeleteLocked))],
    ['实体实例 remove()', c => stored(c, PermDeleteLocked).remove()]
  ];

  it.each([
    ...createEntrances.map(([label, run]) => [label, 'create', 'PermCreateLocked', run] as const),
    ...updateEntrances.map(([label, run]) => [label, 'update', 'PermUpdateLocked', run] as const),
    ...deleteEntrances.map(([label, run]) => [label, 'delete', 'PermDeleteLocked', run] as const)
  ])('%s 执行 %s 被拒，清单恰一项，写没有发出', async (_label, operation, entity, run) => {
    const error = await rejectionOf(run(ctx));

    expect(error).toBeInstanceOf(PermissionDeniedError);
    expect(error).toBeInstanceOf(RxDBError);
    expect((error as PermissionDeniedError).violations).toEqual([{ namespace: 'public', entity, operation }]);
    expect((error as PermissionDeniedError).message).toMatch(new RegExp(`public\\.${entity}[\\s\\S]*${operation}`));
    expectNothingWritten(ctx);
  });

  it('门面拒绝是 rejected Promise，不是同步抛出', () => {
    const repository = ctx.rxdb.entityManager.getRepository(PermCreateLocked);
    let pending: Promise<unknown> | undefined;

    expect(() => {
      pending = repository.create(fresh(ctx, PermCreateLocked));
    }).not.toThrow();
    return expect(pending).rejects.toBeInstanceOf(PermissionDeniedError);
  });

  it('只收紧一个操作的实体，其余操作照常写出', async () => {
    const repository = ctx.repositories.get(PermUpdateLocked)!;

    await ctx.rxdb.entityManager.create(fresh(ctx, PermUpdateLocked));
    await ctx.rxdb.entityManager.remove(stored(ctx, PermUpdateLocked));

    expect(repository.create).toHaveBeenCalledOnce();
    expect(repository.remove).toHaveBeenCalledOnce();
  });
});

describe('US-027 AC#1 未配置 permissions 的实体零变化', () => {
  let ctx: Context;

  beforeEach(async () => {
    ctx = await setup();
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it('单条入口全部放行', async () => {
    const repository = ctx.repositories.get(PermFree)!;

    await ctx.rxdb.entityManager.getRepository(PermFree).create(fresh(ctx, PermFree));
    await edited(ctx, PermFree).save();
    await stored(ctx, PermFree).remove();

    expect(repository.create).toHaveBeenCalledOnce();
    expect(repository.update).toHaveBeenCalledOnce();
    expect(repository.remove).toHaveBeenCalledOnce();
  });

  it('批量入口放行', async () => {
    await ctx.rxdb.entityManager.saveMany([fresh(ctx, PermFree), edited(ctx, PermFree)]);
    await ctx.rxdb.entityManager.removeMany([stored(ctx, PermFree)]);

    expect(ctx.adapter.mutations).toHaveBeenCalledTimes(2);
  });
});

describe('US-027 AC#7 批量入口整批预检', () => {
  let ctx: Context;

  beforeEach(async () => {
    ctx = await setup();
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  const violationsOf = async (write: Promise<unknown>) => {
    const error = await rejectionOf(write);
    expect(error).toBeInstanceOf(PermissionDeniedError);
    return (error as PermissionDeniedError).violations;
  };

  it('saveMany()：合规写在前，清单列出全部违规', async () => {
    const violations = await violationsOf(
      ctx.rxdb.entityManager.saveMany([
        fresh(ctx, PermFree),
        edited(ctx, PermUpdateLocked),
        fresh(ctx, PermCreateLocked)
      ] as EntityBase[])
    );

    expect(violations).toEqual([
      { namespace: 'public', entity: 'PermCreateLocked', operation: 'create' },
      { namespace: 'public', entity: 'PermUpdateLocked', operation: 'update' }
    ]);
    expectNothingWritten(ctx);
  });

  it('removeMany()：一条违规删除拖住整批', async () => {
    const violations = await violationsOf(
      ctx.rxdb.entityManager.removeMany([stored(ctx, PermFree), stored(ctx, PermDeleteLocked)] as EntityBase[])
    );

    expect(violations).toEqual([{ namespace: 'public', entity: 'PermDeleteLocked', operation: 'delete' }]);
    expectNothingWritten(ctx);
  });

  it('mutations()：三组同时违规，按 create / update / delete 顺序全部列出', async () => {
    const violations = await violationsOf(
      ctx.rxdb.entityManager.mutations({
        create: new Map<EntityType, Set<EntityBase>>([
          [PermFree, new Set([fresh(ctx, PermFree)])],
          [PermCreateLocked, new Set([fresh(ctx, PermCreateLocked)])]
        ]),
        update: new Map<EntityType, Set<EntityBase>>([[PermUpdateLocked, new Set([edited(ctx, PermUpdateLocked)])]]),
        remove: new Map<EntityType, Set<EntityBase>>([[PermDeleteLocked, new Set([stored(ctx, PermDeleteLocked)])]])
      })
    );

    expect(violations.map(violation => `${violation.entity}:${violation.operation}`)).toEqual([
      'PermCreateLocked:create',
      'PermUpdateLocked:update',
      'PermDeleteLocked:delete'
    ]);
    expectNothingWritten(ctx);
  });

  it('同一实体同一操作的多行只记一项', async () => {
    const violations = await violationsOf(
      ctx.rxdb.entityManager.saveMany([edited(ctx, PermUpdateLocked), edited(ctx, PermUpdateLocked)])
    );

    expect(violations).toHaveLength(1);
  });

  it('message 汇总全部条目', async () => {
    const error = await rejectionOf(
      ctx.rxdb.entityManager.saveMany([edited(ctx, PermUpdateLocked), fresh(ctx, PermCreateLocked)] as EntityBase[])
    );

    expect((error as Error).message).toMatch(/PermCreateLocked[\s\S]*create[\s\S]*PermUpdateLocked[\s\S]*update/);
  });

  it('未改动的实体不进批次，不会被误拒', async () => {
    const untouched = stored(ctx, PermUpdateLocked);
    expect(getEntityStatus(untouched).modified).toBe(false);

    await ctx.rxdb.entityManager.saveMany([fresh(ctx, PermFree), untouched] as EntityBase[]);

    expect(ctx.adapter.mutations).toHaveBeenCalledOnce();
  });
});

@Entity({
  name: 'PermCachedFree',
  properties: TITLE,
  sync: { type: SyncType.QueryCache, local: { adapter: 'sqlite' }, remote: { adapter: 'supabase' } }
})
class PermCachedFree extends EntityBase {
  static [ENTITY_STATIC_TYPES]: { idType: UUID };
  title!: string;
}

@Entity({
  name: 'PermCachedUpdateLocked',
  properties: TITLE,
  permissions: { update: 'system' },
  sync: { type: SyncType.QueryCache, local: { adapter: 'sqlite' }, remote: { adapter: 'supabase' } }
})
class PermCachedUpdateLocked extends EntityBase {
  static [ENTITY_STATIC_TYPES]: { idType: UUID };
  title!: string;
}

describe('US-027 AC#8 QueryCache 批次在任何写发出之前被拒', () => {
  const { trackRxDB } = registerRxDBTeardown();

  const createAdapters = () => {
    const local = {
      name: 'sqlite',
      mutations: vi.fn(async () => []),
      create: vi.fn(async (entity: unknown) => entity),
      update: vi.fn(async (entity: unknown) => entity),
      remove: vi.fn(async (entity: unknown) => entity),
      find: vi.fn(async () => []),
      getMetadataByIds: vi.fn(() => of(new Map<string, string>())),
      upsertMany: vi.fn(() => of(undefined)),
      deleteByIds: vi.fn(() => of(undefined)),
      disconnect: vi.fn(async () => undefined),
      getRepository: (): unknown => local
    };
    const remote = {
      name: 'supabase',
      mutations: vi.fn(async () => []),
      create: vi.fn((_entityName: string, data: unknown) => of(data)),
      update: vi.fn((_entityName: string, id: string, patch: object) => of({ ...patch, id })),
      delete: vi.fn(() => of(undefined)),
      fetchMetadata: vi.fn(() => of([])),
      findByIds: vi.fn(() => of([])),
      disconnect: vi.fn(async () => undefined),
      getRepository: (): unknown => remote
    };
    return { local, remote };
  };

  it('违规更新排在合规创建之后：远端与本地都没有写出那条创建', async () => {
    const { local, remote } = createAdapters();
    const rxdb = trackRxDB(
      new RxDB({
        dbName: 'permissions-query-cache',
        entities: [PermCachedFree, PermCachedUpdateLocked],
        sync: { type: SyncType.QueryCache, local: { adapter: 'sqlite' }, remote: { adapter: 'supabase' } }
      })
    );
    rxdb.adapter('sqlite', () => local as unknown as IRxDBAdapter);
    rxdb.adapter('supabase', () => remote as unknown as IRxDBAdapter);
    rxdb.init();
    const created = rxdb.entityManager.createEntityRef(PermCachedFree, { id: uuid() });
    created.title = 'compliant';
    const locked = rxdb.entityManager.createEntityRef(
      PermCachedUpdateLocked,
      { id: uuid(), title: 'stored' },
      { local: true, modified: false }
    );
    locked.title = 'violating';

    const error = await rejectionOf(
      rxdb.entityManager.mutations({
        create: new Map<EntityType, Set<EntityBase>>([[PermCachedFree, new Set([created])]]),
        update: new Map<EntityType, Set<EntityBase>>([[PermCachedUpdateLocked, new Set([locked])]]),
        remove: new Map()
      })
    );

    expect(error).toBeInstanceOf(PermissionDeniedError);
    expect((error as PermissionDeniedError).violations).toEqual([
      { namespace: 'public', entity: 'PermCachedUpdateLocked', operation: 'update' }
    ]);
    expect(remote.create).not.toHaveBeenCalled();
    expect(remote.update).not.toHaveBeenCalled();
    expect(local.upsertMany).not.toHaveBeenCalled();
    expect(local.mutations).not.toHaveBeenCalled();
  });
});
