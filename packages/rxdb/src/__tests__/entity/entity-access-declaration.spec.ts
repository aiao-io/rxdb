/**
 * @fileoverview US-029 阶段 A — 作用域声明与规则形式的声明、继承与注册期校验（AC#1～3）。
 *
 * 1. AC#1 没声明 `access` 与规则的实体（含与 `IdCard` / `Order` 同形、带业务 `ownerId` 外键的实体）元数据形状与现状一致；
 *    真实的 `IdCard` / `Order` 由 PGlite 集成层的同名 spec 覆盖（核心包的测试不引 `@aiao/rxdb-test`）；
 * 2. AC#2 作用域属性与规则形式的每一种配置错误都在 `RxDB.init()` 报出实体、键与原因；任意非空权限名不报「未注册」；
 * 3. AC#3 规则按操作就近继承，`access` 随继承；
 * 4. 规则形式还要求本地主端、且仓储没有声明不支持规则（图插件的 `GraphRepository` 由插件包自测）。
 */

import { describe, expect, it } from 'vitest';
import { EntityBase } from '../../entity/entity-base.js';
import {
  getEntityAccessScope,
  getEntityPermission,
  getEntityPermissionRule,
  isEntityOperationRule
} from '../../entity/entity-permissions.js';
import { Entity } from '../../entity/entity.decorator.js';
import {
  PropertyType,
  RelationKind,
  SyncType,
  type EntityMetadataOptions,
  type EntityPropertyMetadataOptions,
  type SyncOptions
} from '../../entity/metadata-options.interface.js';
import { transitionMetadata } from '../../entity/metadata-transition.js';
import { validateEntityMetadata } from '../../entity/metadata-validate.js';
import { getEntityMetadata } from '../../rxdb-utils.js';
import { RxDB } from '../../RxDB.js';
import { registerRxDBTeardown } from '../fixtures/rxdb-lifecycle.js';
import { createMockAdapter } from '../fixtures/test-db-setup.js';

const { trackRxDB } = registerRxDBTeardown();

const TENANT: EntityPropertyMetadataOptions = { name: 'tenantId', type: PropertyType.string };

const EDIT_RULES = {
  create: { requires: 'edit' },
  update: { requires: 'edit' },
  delete: { requires: 'edit' }
} as const;

const options = (name: string, overrides: Partial<EntityMetadataOptions> = {}): EntityMetadataOptions => ({
  name: name as Capitalize<string>,
  namespace: 'public',
  properties: [TENANT],
  ...overrides
});

/** 只看某一类违规：别的规则（如同步策略）不掺进断言 */
const violationsOf = (
  declared: Partial<EntityMetadataOptions> | Record<string, unknown>,
  rules: readonly string[] = ['invalidAccess', 'invalidPermissions'],
  sync?: SyncOptions
) =>
  validateEntityMetadata(transitionMetadata(options('Shelf', declared as Partial<EntityMetadataOptions>)), sync).filter(
    violation => rules.includes(violation.rule)
  );

const LOCAL_SYNC: SyncOptions = { type: SyncType.None, local: { adapter: 'sqlite' } };

@Entity({
  name: 'AccessOwner',
  properties: [{ name: 'name', type: PropertyType.string }],
  relations: [
    { name: 'tickets', kind: RelationKind.ONE_TO_MANY, mappedEntity: 'AccessTicket', mappedProperty: 'owner' }
  ]
})
class AccessOwner extends EntityBase {}

/** 与 `IdCard` / `Order` 同形：`ownerId` 是指向用户表的业务外键，不是授权字段 */
@Entity({
  name: 'AccessTicket',
  properties: [{ name: 'title', type: PropertyType.string }],
  relations: [
    {
      name: 'owner',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'AccessOwner',
      mappedProperty: 'tickets',
      nullable: false
    }
  ]
})
class AccessTicket extends EntityBase {}

describe('US-029 AC#1 未声明的实体零变化', () => {
  it.each([
    ['AccessOwner', AccessOwner],
    ['AccessTicket（业务 ownerId）', AccessTicket]
  ])('%s：元数据里没有 access，权限仍是 US-027 的简写', (_name, EntityType) => {
    const metadata = getEntityMetadata(EntityType);

    expect('access' in metadata).toBe(false);
    expect(getEntityAccessScope(metadata)).toBeUndefined();
    expect(getEntityPermissionRule(metadata, 'update')).toBeUndefined();
    expect(getEntityPermission(metadata, 'update')).toBe('both');
  });

  it('没声明 access 与规则的实体校验零违规', () => {
    expect(violationsOf({})).toEqual([]);
  });
});

describe('US-029 读取作用域与规则', () => {
  it('作用域键前缀缺省为空串', () => {
    const metadata = transitionMetadata(options('Shelf', { access: { scope: { property: 'tenantId' } } }));

    expect(getEntityAccessScope(metadata)).toEqual({ property: 'tenantId', prefix: '' });
  });

  it('规则形式与简写分得开', () => {
    const metadata = transitionMetadata(
      options('Shelf', {
        access: { scope: { property: 'tenantId', prefix: 'tenant:' } },
        permissions: { create: 'system', update: { requires: 'edit' } }
      })
    );

    expect(getEntityAccessScope(metadata)).toEqual({ property: 'tenantId', prefix: 'tenant:' });
    expect(getEntityPermissionRule(metadata, 'update')).toEqual({ requires: 'edit' });
    expect(getEntityPermissionRule(metadata, 'create')).toBeUndefined();
    expect(getEntityPermissionRule(metadata, 'delete')).toBeUndefined();
    expect(isEntityOperationRule({ requires: 'edit' })).toBe(true);
    expect(isEntityOperationRule('both')).toBe(false);
  });
});

describe('US-029 AC#3 按操作就近继承，access 随继承', () => {
  const parent = options('ScopedParent', {
    access: { scope: { property: 'tenantId', prefix: 'tenant:' } },
    permissions: { update: { requires: 'edit' } }
  });

  it('子类只声明 delete：update 沿用父类规则，create 取 both，access 沿用父类', () => {
    const meta = transitionMetadata(
      { name: 'ScopedChild', namespace: 'public', permissions: { delete: { requires: 'edit' } } },
      [parent]
    );

    expect(meta.permissions).toEqual({ create: 'both', update: { requires: 'edit' }, delete: { requires: 'edit' } });
    expect(getEntityAccessScope(meta)).toEqual({ property: 'tenantId', prefix: 'tenant:' });
    expect(validateEntityMetadata(meta, LOCAL_SYNC)).toEqual([]);
  });

  it('子类自己声明 access：整体就近覆盖父类', () => {
    const meta = transitionMetadata(
      {
        name: 'OwnedChild',
        namespace: 'public',
        properties: [{ name: 'ownerKey', type: PropertyType.uuid }],
        access: { scope: { property: 'ownerKey', prefix: 'user:' } }
      },
      [parent]
    );

    expect(getEntityAccessScope(meta)).toEqual({ property: 'ownerKey', prefix: 'user:' });
  });

  it('装饰器路径同样按原型链继承', () => {
    @Entity({
      name: 'ScopedBase',
      properties: [TENANT],
      access: { scope: { property: 'tenantId', prefix: 'tenant:' } },
      permissions: { update: { requires: 'edit' } }
    })
    class ScopedBase extends EntityBase {}
    @Entity({ name: 'ScopedLeaf', properties: [], permissions: { delete: { requires: 'edit' } } })
    class ScopedLeaf extends ScopedBase {}

    const metadata = getEntityMetadata(ScopedLeaf);

    expect(metadata.permissions).toEqual({
      create: 'both',
      update: { requires: 'edit' },
      delete: { requires: 'edit' }
    });
    expect(getEntityAccessScope(metadata)).toEqual({ property: 'tenantId', prefix: 'tenant:' });
  });
});

describe('US-029 AC#2 作用域声明的配置错误', () => {
  const accessOf = (access: unknown) => violationsOf({ access, permissions: EDIT_RULES }, ['invalidAccess']);

  it.each([
    ['不是普通对象', 'tenant', /普通对象/],
    ['未知键', { scope: { property: 'tenantId' }, roles: ['admin'] }, /roles/],
    ['缺 scope', {}, /scope/],
    ['scope 不是普通对象', { scope: 'tenantId' }, /scope/],
    ['scope 的未知键', { scope: { property: 'tenantId', value: 'app' } }, /value/],
    ['property 不是非空字符串', { scope: { property: '' } }, /property/],
    ['prefix 不是字符串', { scope: { property: 'tenantId', prefix: 1 } }, /prefix/]
  ])('%s：报 invalidAccess 并说明原因', (_label, access, reason) => {
    const [violation] = accessOf(access);

    expect(violation).toMatchObject({ entity: 'Shelf', rule: 'invalidAccess' });
    expect(violation.message).toMatch(reason);
  });

  it.each([
    ['属性不存在', { scope: { property: 'missing' } }, [TENANT], /missing[\s\S]*不存在/],
    [
      '属性不是 string / uuid',
      { scope: { property: 'floor' } },
      [{ name: 'floor', type: PropertyType.number }],
      /number[\s\S]*string[\s\S]*uuid/
    ],
    ['属性可空', { scope: { property: 'tenantId' } }, [{ ...TENANT, nullable: true }], /可空|nullable/],
    ['属性加密', { scope: { property: 'tenantId' } }, [{ ...TENANT, encrypted: true }], /加密|encrypted/]
  ])('%s：点名属性与原因', (_label, access, properties, reason) => {
    const violations = violationsOf(
      { access, properties: properties as EntityPropertyMetadataOptions[], permissions: EDIT_RULES },
      ['invalidAccess']
    );

    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ entity: 'Shelf', field: 'access.scope.property' });
    expect(violations[0].message).toMatch(reason);
  });

  it('属性是计算属性：不能当作用域', () => {
    const violations = violationsOf(
      {
        access: { scope: { property: 'label' } },
        properties: [TENANT],
        computedProperties: [{ name: 'label', type: PropertyType.string }],
        permissions: EDIT_RULES
      },
      ['invalidAccess']
    );

    expect(violations[0].message).toMatch(/计算/);
  });

  it('属性是外键列：不是普通属性', () => {
    const violations = violationsOf(
      {
        access: { scope: { property: 'shopId' } },
        relations: [
          {
            name: 'shop',
            kind: RelationKind.MANY_TO_ONE,
            mappedEntity: 'Shop',
            mappedProperty: 'shelves',
            nullable: false
          }
        ],
        permissions: EDIT_RULES
      },
      ['invalidAccess']
    );

    expect(violations[0].message).toMatch(/外键/);
  });

  it('只声明 access、不声明规则也照样校验属性', () => {
    expect(violationsOf({ access: { scope: { property: 'missing' } } }, ['invalidAccess'])).toHaveLength(1);
  });

  it.each([
    ['继承来的 string 属性', 'tenantId'],
    ['自身的 uuid 属性', 'ownerKey']
  ])('%s可以当作用域', (_label, property) => {
    const meta = transitionMetadata(
      {
        name: 'OwnedShelf',
        namespace: 'public',
        properties: [{ name: 'ownerKey', type: PropertyType.uuid }],
        access: { scope: { property, prefix: 'scope:' } },
        permissions: EDIT_RULES
      },
      [options('ShelfBase')]
    );

    expect(validateEntityMetadata(meta, LOCAL_SYNC)).toEqual([]);
  });
});

describe('US-029 AC#2 规则形式的配置错误', () => {
  const ACCESS = { scope: { property: 'tenantId', prefix: 'tenant:' } };
  const ruleViolationsOf = (permissions: unknown, declared: Record<string, unknown> = { access: ACCESS }) =>
    violationsOf({ ...declared, permissions }, ['invalidPermissions'], LOCAL_SYNC);

  it('规则形式而没有 access.scope：点名操作与原因', () => {
    const violations = ruleViolationsOf({ update: { requires: 'edit' } }, {});

    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ entity: 'Shelf', field: 'permissions.update' });
    expect(violations[0].message).toMatch(/access\.scope/);
  });

  it.each([
    ['空串', { requires: '' }, /requires[\s\S]*非空/],
    ['不是字符串', { requires: ['edit'] }, /requires[\s\S]*非空/],
    ['缺 requires', {}, /requires/],
    ['未知键', { requires: 'edit', roles: ['admin'] }, /roles/]
  ])('requires %s：报 invalidPermissions', (_label, rule, reason) => {
    const [violation] = ruleViolationsOf({ delete: rule });

    expect(violation).toMatchObject({ field: 'permissions.delete', rule: 'invalidPermissions' });
    expect(violation.message).toMatch(reason);
  });

  it('任意非空权限名都合法：不建注册表', () => {
    expect(ruleViolationsOf({ create: { requires: 'merge' }, update: { requires: 'some-app-permission' } })).toEqual(
      []
    );
  });

  it('简写的既有报错照旧（非法值仍点名 both / system / 规则三种合法形式）', () => {
    const [violation] = ruleViolationsOf({ update: 'admin' });

    expect(violation.message).toMatch(/both[\s\S]*system[\s\S]*requires/);
  });

  it.each([
    ['remote-only', { type: SyncType.None, remote: { adapter: 'supabase' } } as SyncOptions, /本地/],
    [
      'QueryCache',
      {
        type: SyncType.QueryCache,
        local: { adapter: 'sqlite' },
        remote: { adapter: 'supabase' }
      } as SyncOptions,
      /QueryCache/
    ]
  ])('生效主端是 %s：规则形式报错', (_label, sync, reason) => {
    const violations = violationsOf(
      { access: ACCESS, permissions: { update: { requires: 'edit' } } },
      ['invalidPermissions'],
      sync
    );

    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ field: 'permissions.update' });
    expect(violations[0].message).toMatch(reason);
  });

  it('仓储声明不支持规则形式：理由原样转发', () => {
    const meta = transitionMetadata(
      options('Shelf', { repository: 'EdgeRepository' as never, access: ACCESS, permissions: EDIT_RULES })
    );

    const violations = validateEntityMetadata(meta, LOCAL_SYNC, undefined, repository =>
      repository === 'EdgeRepository' ? '边表的写不经门面写入口' : undefined
    ).filter(violation => violation.rule === 'invalidPermissions');

    expect(violations.map(violation => violation.field)).toEqual([
      'permissions.create',
      'permissions.delete',
      'permissions.update'
    ]);
    expect(violations[0].message).toMatch(/EdgeRepository[\s\S]*边表的写不经门面写入口/);
  });

  it('RxDB.init() 汇总后抛错，消息带实体名、键与原因', () => {
    @Entity({
      name: 'BadScope',
      properties: [{ name: 'tenantId', type: PropertyType.string, nullable: true }],
      access: { scope: { property: 'tenantId', prefix: 'tenant:' } },
      permissions: { update: { requires: '' } }
    })
    class BadScope extends EntityBase {}

    const rxdb = trackRxDB(
      new RxDB({
        dbName: 'access-invalid',
        entities: [BadScope],
        sync: { type: SyncType.None, local: { adapter: 'sqlite' } }
      })
    );
    rxdb.adapter('sqlite', createMockAdapter);

    expect(() => rxdb.init()).toThrow(/BadScope\.access\.scope\.property[\s\S]*BadScope\.permissions\.update/);
  });
});
