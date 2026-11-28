/**
 * @fileoverview US-029 阶段 B — 规则形式写权限在公开写入口的按行判定（AC#4～9、11、12）。
 *
 * unit 层的替身适配器不存行：前像由各实体的仓储桩按 id 交出（与真仓储一样回已缓存的实例，读的是它的落库值
 * `origin`），断言的是「写有没有发出去」——仓储桩的 create / update / remove 与适配器的 `mutations()`。
 * 库里的行原样与本地后端一致由 PGlite / SQLite 集成层的同名用例验证（AC#13）。
 *
 * 1. AC#4 快照未取到：三操作经每个入口都被拒，原因是授权未知，一条写都没发出；
 * 2. AC#5 `tenant:a` 可编辑、`tenant:b` 只读：a 全部放行，b 全部被拒，违规项写明实体、行 id、作用域与所需权限；
 * 3. AC#6 换租户两边都要能改；AC#7 按持久化前像判定，不按内存里被改过的实例；
 * 4. AC#8 批量入口任一行被拒整批拒绝，前像每个实体只读一次；
 * 5. AC#9 适配器 / 执行器层不判定；AC#11 快照变化后的写立即按新快照判定；AC#12 简写与 US-027 一致。
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EntityBase } from '../../entity/entity-base.js';
import {
  isPermissionRuleViolation,
  PermissionDeniedError,
  type PermissionRuleViolation
} from '../../entity/entity-permissions.js';
import { Entity } from '../../entity/entity.decorator.js';
import { ENTITY_STATIC_TYPES, type EntityType, type UUID } from '../../entity/entity.interface.js';
import type { EntityPropertyMetadataOptions } from '../../entity/metadata-options.interface.js';
import { PropertyType } from '../../entity/metadata-options.interface.js';
import { assertReorderRule } from '../../entity/permission-rules.js';
import { RxDBGrantSnapshot } from '../../grants/grant-snapshot.js';
import { RxDBGrantState } from '../../grants/grant-state.js';
import type { IRepository } from '../../repository/repository.interface.js';
import type { RxDBMutationsMap } from '../../rxdb-adapter.js';
import { getEntityStatus, uuid } from '../../rxdb-utils.js';
import type { RxDB } from '../../RxDB.js';
import { createTestDB, type MockLocalAdapter } from '../fixtures/test-db-setup.js';

const PROPERTIES: EntityPropertyMetadataOptions[] = [
  { name: 'title', type: PropertyType.string },
  { name: 'tenantId', type: PropertyType.string }
];

const EDIT_RULES = {
  create: { requires: 'edit' },
  update: { requires: 'edit' },
  delete: { requires: 'edit' }
} as const;

const ACCESS = { scope: { property: 'tenantId', prefix: 'tenant:' } };

@Entity({ name: 'ScopedItem', properties: PROPERTIES, access: ACCESS, permissions: EDIT_RULES })
class ScopedItem extends EntityBase {
  static [ENTITY_STATIC_TYPES]: { idType: UUID };
  declare title: string;
  declare tenantId: string;
}

@Entity({ name: 'ScopedNote', properties: PROPERTIES, access: ACCESS, permissions: EDIT_RULES })
class ScopedNote extends EntityBase {
  static [ENTITY_STATIC_TYPES]: { idType: UUID };
  declare title: string;
  declare tenantId: string;
}

/** 只有 update 是规则形式：create / delete 仍是默认的 both */
@Entity({ name: 'ScopedDraft', properties: PROPERTIES, access: ACCESS, permissions: { update: { requires: 'edit' } } })
class ScopedDraft extends EntityBase {
  static [ENTITY_STATIC_TYPES]: { idType: UUID };
  declare title: string;
  declare tenantId: string;
}

@Entity({ name: 'PlainItem', properties: PROPERTIES })
class PlainItem extends EntityBase {
  static [ENTITY_STATIC_TYPES]: { idType: UUID };
  declare title: string;
  declare tenantId: string;
}

@Entity({ name: 'LockedItem', properties: PROPERTIES, permissions: { create: 'system' } })
class LockedItem extends EntityBase {
  static [ENTITY_STATIC_TYPES]: { idType: UUID };
  declare title: string;
  declare tenantId: string;
}

type Scoped = EntityBase & { title: string; tenantId: string };
type ScopedType = EntityType & (new () => Scoped);

const ENTITIES = [ScopedItem, ScopedNote, ScopedDraft, PlainItem, LockedItem] as const;

/** a 可编辑、b 只读 */
const GRANTS = [
  { scope: 'tenant:a', permissions: ['read', 'edit'] },
  { scope: 'tenant:b', permissions: ['read'] }
];

interface Context {
  rxdb: RxDB;
  adapter: MockLocalAdapter;
  /** 每个实体「库里」的行：仓储桩的 `find` 按 id 从这里交出 */
  stores: Map<EntityType, Scoped[]>;
  repositories: Map<EntityType, IRepository<EntityType>>;
  cleanup: () => Promise<void>;
}

/** 规则里的 id 条件：`=` 或 `in` */
const idsOf = (options: unknown): readonly unknown[] => {
  const rules = (options as { where?: { rules?: { field: string; operator: string; value: unknown }[] } }).where?.rules;
  const idRule = rules?.find(rule => rule.field === 'id');
  if (!idRule) return [];
  return idRule.operator === 'in' ? (idRule.value as unknown[]) : [idRule.value];
};

const setup = async (): Promise<Context> => {
  const { rxdb, adapter, cleanup } = await createTestDB({ entities: [...ENTITIES] });
  adapter.stubEntityRepository(RxDBGrantState);
  const stores = new Map<EntityType, Scoped[]>();
  const repositories = new Map<EntityType, IRepository<EntityType>>();
  for (const EntityType of ENTITIES) {
    const store: Scoped[] = [];
    const repository = adapter.stubEntityRepository(EntityType);
    (
      repository.find as unknown as { mockImplementation: (fn: (options: unknown) => unknown) => void }
    ).mockImplementation(async options => store.filter(row => idsOf(options).includes(row.id)));
    stores.set(EntityType, store);
    repositories.set(EntityType, repository);
  }
  return { rxdb, adapter, stores, repositories, cleanup };
};

const grant = (ctx: Context) => ctx.rxdb.grants.set(GRANTS);

/** 还没落库的新行，`save()` 会把它当 create */
const fresh = <T extends ScopedType>(ctx: Context, EntityType: T, tenantId: string): InstanceType<T> => {
  const entity = ctx.rxdb.entityManager.createEntityRef(EntityType, { id: uuid() } as never) as InstanceType<T>;
  entity.title = 'fresh';
  entity.tenantId = tenantId;
  return entity;
};

/** 已落库的行：仓储桩按 id 交出它 */
const stored = <T extends ScopedType>(ctx: Context, EntityType: T, tenantId: string): InstanceType<T> => {
  const entity = ctx.rxdb.entityManager.createEntityRef(
    EntityType,
    { id: uuid(), title: 'stored', tenantId } as never,
    { local: true, modified: false }
  ) as InstanceType<T>;
  ctx.stores.get(EntityType)?.push(entity);
  return entity;
};

/** 已落库且改了标题，`save()` 会把它当 update */
const edited = <T extends ScopedType>(ctx: Context, EntityType: T, tenantId: string): InstanceType<T> => {
  const entity = stored(ctx, EntityType, tenantId);
  entity.title = 'edited';
  return entity;
};

const rejectionOf = (write: Promise<unknown>): Promise<PermissionDeniedError> =>
  write.then(
    () => {
      throw new Error('写入应被拒绝，却成功了');
    },
    (error: unknown) => {
      expect(error).toBeInstanceOf(PermissionDeniedError);
      return error as PermissionDeniedError;
    }
  );

const ruleViolationsOf = (error: PermissionDeniedError): PermissionRuleViolation[] =>
  error.violations.filter(isPermissionRuleViolation);

/** 一条写都没发出去：本用例涉及的仓储桩三方法与适配器批量入口都未被调用 */
const expectNothingWritten = (ctx: Context): void => {
  for (const repository of ctx.repositories.values()) {
    expect(repository.create).not.toHaveBeenCalled();
    expect(repository.update).not.toHaveBeenCalled();
    expect(repository.remove).not.toHaveBeenCalled();
  }
  expect(ctx.adapter.mutations).not.toHaveBeenCalled();
};

type Write = (ctx: Context, tenantId: string) => Promise<unknown>;
type Entrance = readonly [label: string, write: Write];

const CREATE_ENTRANCES: Entrance[] = [
  [
    '门面 Repository.create()',
    (c, t) => c.rxdb.entityManager.getRepository(ScopedItem).create(fresh(c, ScopedItem, t))
  ],
  ['EntityManager.create()', (c, t) => c.rxdb.entityManager.create(fresh(c, ScopedItem, t))],
  ['EntityManager.save()', (c, t) => c.rxdb.entityManager.save(fresh(c, ScopedItem, t))],
  ['实体实例 save()', (c, t) => fresh(c, ScopedItem, t).save()]
];

const UPDATE_ENTRANCES: Entrance[] = [
  [
    '门面 Repository.update()',
    (c, t) => c.rxdb.entityManager.getRepository(ScopedItem).update(stored(c, ScopedItem, t), { title: 'x' })
  ],
  ['EntityManager.update()', (c, t) => c.rxdb.entityManager.update(edited(c, ScopedItem, t))],
  ['EntityManager.save()', (c, t) => c.rxdb.entityManager.save(edited(c, ScopedItem, t))],
  ['实体实例 save()', (c, t) => edited(c, ScopedItem, t).save()]
];

const DELETE_ENTRANCES: Entrance[] = [
  [
    '门面 Repository.remove()',
    (c, t) => c.rxdb.entityManager.getRepository(ScopedItem).remove(stored(c, ScopedItem, t))
  ],
  ['EntityManager.remove()', (c, t) => c.rxdb.entityManager.remove(stored(c, ScopedItem, t))],
  ['实体实例 remove()', (c, t) => stored(c, ScopedItem, t).remove()]
];

const MATRIX = [
  ...CREATE_ENTRANCES.map(([label, write]) => ['create', label, write] as const),
  ...UPDATE_ENTRANCES.map(([label, write]) => ['update', label, write] as const),
  ...DELETE_ENTRANCES.map(([label, write]) => ['delete', label, write] as const)
];

describe('US-029 规则形式的判定', () => {
  let ctx: Context;

  beforeEach(async () => {
    ctx = await setup();
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  describe('AC#4 快照未取到：一律拒绝', () => {
    it.each(MATRIX)('%s · %s：授权未知，一条写都没发出', async (operation, _label, write) => {
      const error = await rejectionOf(write(ctx, 'a'));

      expect(ruleViolationsOf(error)).toEqual([
        expect.objectContaining({ entity: 'ScopedItem', operation, scope: 'tenant:a', reason: 'grants-unknown' })
      ]);
      expect(error.message).toMatch(/授权未知/);
      expectNothingWritten(ctx);
    });
  });

  describe('AC#5 a 可编辑、b 只读', () => {
    beforeEach(async () => {
      await grant(ctx);
    });

    it.each(MATRIX)('%s · %s：a 放行', async (operation, _label, write) => {
      await write(ctx, 'a');

      const repository = ctx.repositories.get(ScopedItem);
      const method = { create: repository?.create, update: repository?.update, delete: repository?.remove }[operation];
      expect(method).toHaveBeenCalledTimes(1);
    });

    it.each(MATRIX)('%s · %s：b 被拒，违规项写明实体、行 id、作用域与所需权限', async (operation, _label, write) => {
      const error = await rejectionOf(write(ctx, 'b'));

      const [violation] = ruleViolationsOf(error);
      expect(error.violations).toHaveLength(1);
      expect(violation).toEqual({
        namespace: 'public',
        entity: 'ScopedItem',
        operation,
        id: expect.any(String),
        scope: 'tenant:b',
        requires: 'edit',
        reason: 'missing-permission'
      });
      expect(error.message).toContain(`public.ScopedItem#${String(violation.id)}`);
      expect(error.message).toMatch(/tenant:b[\s\S]*edit[\s\S]*缺权限/);
      expectNothingWritten(ctx);
    });

    it('只有 update 是规则：create / delete 不判定，update 照样按行判', async () => {
      await ctx.rxdb.entityManager.save(fresh(ctx, ScopedDraft, 'b'));
      await stored(ctx, ScopedDraft, 'b').remove();

      expect(ctx.repositories.get(ScopedDraft)?.create).toHaveBeenCalledTimes(1);
      expect(ctx.repositories.get(ScopedDraft)?.remove).toHaveBeenCalledTimes(1);
      await rejectionOf(edited(ctx, ScopedDraft, 'b').save());
    });

    it('作用域属性没有值：作用域记为 null，按缺权限拒绝', async () => {
      const entity = ctx.rxdb.entityManager.createEntityRef(ScopedItem, { id: uuid() } as never);
      entity.title = 'no tenant';

      const error = await rejectionOf(entity.save());

      expect(ruleViolationsOf(error)).toEqual([expect.objectContaining({ scope: null, reason: 'missing-permission' })]);
      expect(error.message).toMatch(/作用域属性没有值/);
    });
  });

  describe('AC#6 换租户：两边都要能改', () => {
    beforeEach(async () => {
      await grant(ctx);
    });

    it.each([
      ['a → b', 'a', 'b'],
      ['b → a', 'b', 'a']
    ])('%s 被拒，违规项点名没有权限的那一边', async (_label, from, to) => {
      const entity = stored(ctx, ScopedItem, from);
      entity.tenantId = to;

      const error = await rejectionOf(entity.save());

      expect(ruleViolationsOf(error).map(violation => violation.scope)).toEqual(['tenant:b']);
      expectNothingWritten(ctx);
    });

    it('门面 Repository.update() 的 patch 改作用域：同样两边都判', async () => {
      const error = await rejectionOf(
        ctx.rxdb.entityManager.getRepository(ScopedItem).update(stored(ctx, ScopedItem, 'a'), { tenantId: 'b' })
      );

      expect(ruleViolationsOf(error).map(violation => violation.scope)).toEqual(['tenant:b']);
    });

    it('两边都能改：放行', async () => {
      await ctx.rxdb.grants.set([...GRANTS, { scope: 'tenant:c', permissions: ['edit'] }]);
      const entity = stored(ctx, ScopedItem, 'a');
      entity.tenantId = 'c';

      await entity.save();

      expect(ctx.repositories.get(ScopedItem)?.update).toHaveBeenCalledTimes(1);
    });
  });

  describe('AC#7 按持久化前像判定', () => {
    beforeEach(async () => {
      await grant(ctx);
    });

    it('库里在 b、内存实例改成 a：按前像 b 拒绝', async () => {
      const entity = stored(ctx, ScopedItem, 'b');
      entity.tenantId = 'a';

      const error = await rejectionOf(ctx.rxdb.entityManager.save(entity));

      expect(ruleViolationsOf(error).map(violation => violation.scope)).toEqual(['tenant:b']);
    });

    it('内存实例的基线过时（以为在 a），库里已经在 b：读到前像 b 才判', async () => {
      const entity = stored(ctx, ScopedItem, 'a');
      entity.title = 'edited';
      const repository = ctx.repositories.get(ScopedItem);
      // 真仓储的 find 会把读回的行并进已缓存的实例：基线前移到库里的值
      (repository?.find as unknown as { mockImplementationOnce: (fn: () => unknown) => void }).mockImplementationOnce(
        async () => {
          getEntityStatus(entity).applyExternal({ tenantId: 'b' } as never);
          return [entity];
        }
      );

      const error = await rejectionOf(entity.save());

      expect(ruleViolationsOf(error).map(violation => violation.scope)).toEqual(['tenant:b']);
    });

    it('前像读不到的行（库里已经没有）：不判定，交给存储层', async () => {
      const entity = ctx.rxdb.entityManager.createEntityRef(
        ScopedItem,
        { id: uuid(), title: 'gone', tenantId: 'b' } as never,
        { local: true, modified: false }
      );

      await entity.remove();

      expect(ctx.repositories.get(ScopedItem)?.remove).toHaveBeenCalledTimes(1);
    });
  });

  describe('AC#8 批量：任一行被拒整批拒绝，前像每个实体读一次', () => {
    beforeEach(async () => {
      await grant(ctx);
    });

    it('saveMany()：只点名 b 的那一行，一条都没写', async () => {
      const denied = edited(ctx, ScopedItem, 'b');
      const entities = [edited(ctx, ScopedItem, 'a'), fresh(ctx, ScopedItem, 'a'), denied];

      const error = await rejectionOf(ctx.rxdb.entityManager.saveMany(entities));

      expect(ruleViolationsOf(error).map(violation => violation.id)).toEqual([denied.id]);
      expectNothingWritten(ctx);
    });

    it('removeMany()：合规的那行也没被删', async () => {
      const error = await rejectionOf(
        ctx.rxdb.entityManager.removeMany([stored(ctx, ScopedItem, 'a'), stored(ctx, ScopedItem, 'b')])
      );

      expect(ruleViolationsOf(error)).toEqual([expect.objectContaining({ operation: 'delete', scope: 'tenant:b' })]);
      expectNothingWritten(ctx);
    });

    it('mutations()：三组的违规一次列全，按 create / update / delete 排序', async () => {
      const options: RxDBMutationsMap = {
        create: new Map<EntityType, Set<EntityBase>>([[ScopedItem, new Set([fresh(ctx, ScopedItem, 'b')])]]),
        update: new Map<EntityType, Set<EntityBase>>([[ScopedNote, new Set([edited(ctx, ScopedNote, 'b')])]]),
        remove: new Map<EntityType, Set<EntityBase>>([[ScopedItem, new Set([stored(ctx, ScopedItem, 'b')])]])
      };

      const error = await rejectionOf(ctx.rxdb.entityManager.mutations(options));

      expect(ruleViolationsOf(error).map(violation => `${violation.entity}:${violation.operation}`)).toEqual([
        'ScopedItem:create',
        'ScopedNote:update',
        'ScopedItem:delete'
      ]);
      expectNothingWritten(ctx);
    });

    it.each([3, 12])('%i 行：前像每个实体只读一次', async count => {
      const items = Array.from({ length: count }, () => edited(ctx, ScopedItem, 'a'));
      const notes = Array.from({ length: count }, () => stored(ctx, ScopedNote, 'a'));

      await ctx.rxdb.entityManager.saveMany(items);
      await ctx.rxdb.entityManager.removeMany(notes);

      expect(ctx.repositories.get(ScopedItem)?.find).toHaveBeenCalledTimes(1);
      expect(ctx.repositories.get(ScopedNote)?.find).toHaveBeenCalledTimes(1);
      expect(ctx.adapter.mutations).toHaveBeenCalledTimes(2);
    });

    it('同一批里的 update 与 delete 共用一次前像读取', async () => {
      await ctx.rxdb.entityManager.mutations({
        create: new Map(),
        update: new Map<EntityType, Set<EntityBase>>([[ScopedItem, new Set([edited(ctx, ScopedItem, 'a')])]]),
        remove: new Map<EntityType, Set<EntityBase>>([[ScopedItem, new Set([stored(ctx, ScopedItem, 'a')])]])
      });

      expect(ctx.repositories.get(ScopedItem)?.find).toHaveBeenCalledTimes(1);
    });

    it('批里没有规则实体：写路径与现状一致，不开额外的事务、不读前像', async () => {
      const transactions = ctx.adapter.transaction.mock.calls.length;

      await ctx.rxdb.entityManager.saveMany([fresh(ctx, PlainItem, 'b'), fresh(ctx, PlainItem, 'b')]);

      expect(ctx.adapter.mutations).toHaveBeenCalledTimes(1);
      expect(ctx.adapter.transaction).toHaveBeenCalledTimes(transactions);
      expect(ctx.repositories.get(PlainItem)?.find).not.toHaveBeenCalled();
    });
  });

  describe('AC#9 适配器 / 执行器层不判定', () => {
    beforeEach(async () => {
      await ctx.rxdb.grants.set([{ scope: 'tenant:b', permissions: ['read'] }]);
    });

    it('adapter.mutations() 直写只读作用域的行：照常写出', async () => {
      const entity = edited(ctx, ScopedItem, 'b');

      await ctx.adapter.mutations({
        create: new Map(),
        update: new Map<EntityType, Set<EntityBase>>([[ScopedItem, new Set([entity])]]),
        remove: new Map()
      });

      expect(ctx.adapter.mutations).toHaveBeenCalledTimes(1);
    });

    it('transaction() 执行器的仓储改只读作用域的行：照常写出', async () => {
      const entity = stored(ctx, ScopedItem, 'b');

      await ctx.adapter.transaction(executor => executor.getRepository(ScopedItem).update(entity, { title: 'sync' }));

      expect(ctx.repositories.get(ScopedItem)?.update).toHaveBeenCalledTimes(1);
      expect(ctx.repositories.get(ScopedItem)?.find).not.toHaveBeenCalled();
    });
  });

  describe('AC#11 快照变化：立即按新快照判定', () => {
    it('收回 a 的 edit 之后，再写 a 的行当场被拒', async () => {
      await grant(ctx);
      await edited(ctx, ScopedItem, 'a').save();

      await ctx.rxdb.grants.set([{ scope: 'tenant:a', permissions: ['read'] }]);
      const error = await rejectionOf(edited(ctx, ScopedItem, 'a').save());

      expect(ruleViolationsOf(error)).toEqual([
        expect.objectContaining({ scope: 'tenant:a', reason: 'missing-permission' })
      ]);
      expect(ctx.repositories.get(ScopedItem)?.update).toHaveBeenCalledTimes(1);
    });
  });

  describe('重排按 update 判（落点由 reorderRow 在事务里算出，真库用例见 PGlite / SQLite）', () => {
    const snapshot = RxDBGrantSnapshot.known(GRANTS, 'app', new Date(0));
    const reorderViolations = (moving: Scoped, placement: object | null): (string | null)[] => {
      try {
        assertReorderRule(ScopedItem, moving as ScopedItem, placement, { snapshot });
        return [];
      } catch (error) {
        return ruleViolationsOf(error as PermissionDeniedError).map(violation => violation.scope);
      }
    };

    it('原地不动（零写）也按前像判：b 被拒，a 放行', () => {
      expect(reorderViolations(stored(ctx, ScopedItem, 'b'), null)).toEqual(['tenant:b']);
      expect(reorderViolations(stored(ctx, ScopedItem, 'a'), null)).toEqual([]);
    });

    it('落点改了作用域属性：写后的作用域也判', () => {
      expect(reorderViolations(stored(ctx, ScopedItem, 'a'), { tenantId: 'b', sortOrder: 'a0' })).toEqual(['tenant:b']);
      expect(reorderViolations(stored(ctx, ScopedItem, 'a'), { sortOrder: 'a0' })).toEqual([]);
    });

    it('没有 update 规则的实体：不判', () => {
      expect(() =>
        assertReorderRule(PlainItem, stored(ctx, PlainItem, 'b') as PlainItem, null, {
          snapshot: RxDBGrantSnapshot.UNKNOWN
        })
      ).not.toThrow();
    });
  });

  describe('AC#12 简写与 US-027 一致', () => {
    it("'system' 的违规仍是三个字段，消息原样", async () => {
      const error = await rejectionOf(fresh(ctx, LockedItem, 'a').save());

      expect(error.violations).toEqual([{ namespace: 'public', entity: 'LockedItem', operation: 'create' }]);
      expect(error.message).toMatch(/只许系统执行/);
      expect(isPermissionRuleViolation(error.violations[0])).toBe(false);
    });

    it("'both' 的实体：快照未取到也照常写", async () => {
      await fresh(ctx, PlainItem, 'b').save();
      await edited(ctx, PlainItem, 'b').save();
      await stored(ctx, PlainItem, 'b').remove();

      const repository = ctx.repositories.get(PlainItem);
      expect(repository?.create).toHaveBeenCalledTimes(1);
      expect(repository?.update).toHaveBeenCalledTimes(1);
      expect(repository?.remove).toHaveBeenCalledTimes(1);
      expect(repository?.find).not.toHaveBeenCalled();
    });
  });
});
