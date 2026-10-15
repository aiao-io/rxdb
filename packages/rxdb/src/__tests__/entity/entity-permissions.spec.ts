/**
 * @fileoverview US-027 阶段 A — 实体操作权限的声明、继承、校验与系统表断言（AC#2～5）。
 *
 * 1. AC#3 按操作就近继承：整键覆盖会让「子类只收紧 delete」悄悄放开父类收紧的 update；
 * 2. AC#2 非法值与未知键在 `RxDB.init()` 汇总报错，消息点名实体、键与非法值；
 * 3. AC#4 核心 4 张系统表三操作都是 `'system'`（working-tree 的 10 张由插件包自测）；
 * 4. AC#5 插件贡献的系统表漏声明时 `init()` 抛错，而不是裸奔。
 */

import { describe, expect, it } from 'vitest';
import { EntityBase } from '../../entity/entity-base.js';
import {
  assertSystemEntityPermissions,
  getEntityPermission,
  SYSTEM_ENTITY_PERMISSIONS
} from '../../entity/entity-permissions.js';
import { Entity } from '../../entity/entity.decorator.js';
import type { EntityType } from '../../entity/entity.interface.js';
import { SyncType, type EntityMetadataOptions } from '../../entity/metadata-options.interface.js';
import { transitionMetadata } from '../../entity/metadata-transition.js';
import { validateEntityMetadata } from '../../entity/metadata-validate.js';
import type { RxDBSystemContribution } from '../../rxdb-plugin-system.js';
import type { Plugin } from '../../rxdb-plugin.js';
import { getEntityMetadata } from '../../rxdb-utils.js';
import { RxDB } from '../../RxDB.js';
import { RxDBError } from '../../RxDBError.js';
import { CORE_SYSTEM_ENTITIES } from '../../system/system-entities.js';
import { registerRxDBTeardown } from '../fixtures/rxdb-lifecycle.js';
import { createMockAdapter } from '../fixtures/test-db-setup.js';

const { trackRxDB } = registerRxDBTeardown();

const options = (name: string, overrides: Partial<EntityMetadataOptions> = {}): EntityMetadataOptions => ({
  name: name as Capitalize<string>,
  namespace: 'public',
  properties: [],
  ...overrides
});

describe('US-027 AC#3 按操作就近继承', () => {
  const parent = options('Parent', { permissions: { update: 'system' } });

  it('子类甲只声明 delete：update 沿用父类，create 取默认', () => {
    const meta = transitionMetadata(options('ChildA', { permissions: { delete: 'system' } }), [parent]);

    expect(meta.permissions).toEqual({ create: 'both', update: 'system', delete: 'system' });
  });

  it('子类乙不声明：与父类一致', () => {
    const meta = transitionMetadata(options('ChildB'), [parent]);

    expect(meta.permissions).toEqual({ create: 'both', update: 'system', delete: 'both' });
  });

  it('子类可以把父类收紧的操作显式放开', () => {
    const meta = transitionMetadata(options('ChildC', { permissions: { update: 'both' } }), [parent]);

    expect(getEntityPermission(meta, 'update')).toBe('both');
  });

  it('整条链都没声明时不写 permissions 键，三操作读出来都是 both', () => {
    const meta = transitionMetadata(options('Plain'));

    // 不写这个键是为了让元数据形状（生成器的序列化、快照）与现状逐字一致（AC#1）
    expect('permissions' in meta).toBe(false);
    expect(getEntityPermission(meta, 'create')).toBe('both');
    expect(getEntityPermission(meta, 'update')).toBe('both');
    expect(getEntityPermission(meta, 'delete')).toBe('both');
  });

  it('装饰器路径同样按原型链继承', () => {
    @Entity({ name: 'GuardedBase', properties: [], permissions: { update: 'system' } })
    class GuardedBase extends EntityBase {}
    @Entity({ name: 'GuardedChild', properties: [], permissions: { delete: 'system' } })
    class GuardedChild extends GuardedBase {}

    expect(getEntityMetadata(GuardedChild).permissions).toEqual({
      create: 'both',
      update: 'system',
      delete: 'system'
    });
  });
});

describe('US-027 AC#2 非法值与未知键', () => {
  const violationsOf = (permissions: unknown) =>
    validateEntityMetadata(
      transitionMetadata(options('Rate', { permissions } as unknown as Partial<EntityMetadataOptions>))
    ).filter(error => error.rule === 'invalidPermissions');

  it.each([
    ['none', /none[\s\S]*SQL/],
    ['user', /user[\s\S]*适配器/]
  ])('非法值 %s 报违规，并说明不支持的原因', (value, reason) => {
    const [violation] = violationsOf({ update: value });

    expect(violation).toMatchObject({ entity: 'Rate', field: 'permissions.update' });
    expect(violation.message).toMatch(reason);
  });

  it('未知键报违规，点名全部未知键', () => {
    const [violation] = violationsOf({ read: 'system', list: 'both', delete: 'system' });

    expect(violation).toMatchObject({ entity: 'Rate', field: 'permissions' });
    expect(violation.message).toMatch(/read[\s\S]*list/);
  });

  it('多个操作同时非法时逐个报', () => {
    expect(violationsOf({ create: 'none', delete: 'user' }).map(error => error.field)).toEqual([
      'permissions.create',
      'permissions.delete'
    ]);
  });

  it('permissions 不是普通对象时报违规而不是崩溃', () => {
    expect(violationsOf('system')).toHaveLength(1);
  });

  it('合法声明零违规', () => {
    expect(violationsOf({ create: 'system', update: 'both' })).toEqual([]);
  });

  it('RxDB.init() 汇总后抛错，消息带实体名、键与非法值', () => {
    @Entity({ name: 'BadRate', properties: [], permissions: { update: 'none' as 'system' } })
    class BadRate extends EntityBase {}

    const rxdb = trackRxDB(
      new RxDB({
        dbName: 'permissions-invalid',
        entities: [BadRate],
        sync: { type: SyncType.None, local: { adapter: 'sqlite' } }
      })
    );
    rxdb.adapter('sqlite', createMockAdapter);

    expect(() => rxdb.init()).toThrow(/BadRate[\s\S]*permissions\.update[\s\S]*none/);
  });
});

describe('US-027 AC#4 核心系统表声明', () => {
  it.each(CORE_SYSTEM_ENTITIES.map(entity => [getEntityMetadata(entity).name, entity] as const))(
    '%s 三操作都是 system',
    (_name, entity) => {
      expect(getEntityMetadata(entity).permissions).toEqual(SYSTEM_ENTITY_PERMISSIONS);
    }
  );
});

describe('US-027 AC#5 插件贡献的系统表必须声明完整', () => {
  @Entity({
    namespace: 'rxdb',
    name: 'UndeclaredProbe',
    tableName: 'rxdb_undeclared_probe',
    log: false,
    properties: []
  })
  class UndeclaredProbe extends EntityBase {}

  @Entity({
    namespace: 'rxdb',
    name: 'HalfDeclaredProbe',
    tableName: 'rxdb_half_declared_probe',
    log: false,
    properties: [],
    permissions: { create: 'system', update: 'system' }
  })
  class HalfDeclaredProbe extends EntityBase {}

  it('未声明的表：点名表名与全部三个操作', () => {
    expect(() => assertSystemEntityPermissions([UndeclaredProbe])).toThrow(RxDBError);
    expect(() => assertSystemEntityPermissions([UndeclaredProbe])).toThrow(
      /rxdb\.UndeclaredProbe[\s\S]*create[\s\S]*update[\s\S]*delete/
    );
  });

  it('只声明了一部分的表：只点名缺的操作', () => {
    expect(() => assertSystemEntityPermissions([HalfDeclaredProbe])).toThrow(/rxdb\.HalfDeclaredProbe[\s\S]*delete/);
    expect(() => assertSystemEntityPermissions([HalfDeclaredProbe])).not.toThrow(/create|update/);
  });

  it('核心 4 张表通过', () => {
    expect(() => assertSystemEntityPermissions(CORE_SYSTEM_ENTITIES)).not.toThrow();
  });

  it('经 use() 贡献漏声明的系统表，init() 抛错', () => {
    const contribution = {
      capability: 'undeclared',
      version: 1,
      packageSpecifier: '@example/rxdb-plugin-undeclared',
      entities: [UndeclaredProbe] as readonly EntityType[]
    } as unknown as RxDBSystemContribution;
    const plugin: Plugin = () => ({ name: 'undeclared', system: contribution, install: () => undefined });
    const rxdb = trackRxDB(
      new RxDB({
        dbName: 'permissions-system',
        entities: [],
        sync: { type: SyncType.None, local: { adapter: 'sqlite' } }
      })
    );
    rxdb.adapter('sqlite', createMockAdapter);
    rxdb.use(plugin);

    expect(() => rxdb.init()).toThrow(/rxdb\.UndeclaredProbe/);
  });
});
