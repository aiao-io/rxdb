/**
 * 命名空间容器只能是本实例的普通对象，不能占用 RxDB 自己的成员。
 *
 * `rxdb.<namespace>.<Entity>` 的容器此前按 `Reflect.get` 取：读到继承来的 `__proto__` 就把实体挂进
 * 共享的 `RxDB.prototype`（其他实例也看得见、且不可删除）；读到 `destroy` 这类方法就用新对象把它盖掉，
 * 公开销毁入口从此失效；读到 `context` 这类成员返回的对象就把实体类写进去。注册期一律拒绝。
 */
import { describe, expect, it } from 'vitest';
import { EntityBase } from '../../entity/entity-base.js';
import { Entity } from '../../entity/entity.decorator.js';
import type { EntityType } from '../../entity/entity.interface.js';
import { PropertyType, SyncType } from '../../entity/metadata-options.interface.js';
import type { IRxDBAdapter } from '../../rxdb-adapter.js';
import { RxDB } from '../../RxDB.js';
import { registerRxDBTeardown } from '../fixtures/rxdb-lifecycle.js';

const { trackRxDB } = registerRxDBTeardown();

let databaseIndex = 0;

const createDatabase = (entities: EntityType[]): RxDB => {
  databaseIndex += 1;
  const database = trackRxDB(
    new RxDB({
      dbName: `schema-namespace-scope-${databaseIndex}`,
      entities,
      multiInstance: false,
      sync: { local: { adapter: 'schema-namespace-scope' }, type: SyncType.None }
    })
  );
  database.adapter('schema-namespace-scope', () => ({}) as unknown as IRxDBAdapter);
  return database;
};

const entityIn = (namespace: string, name: string): EntityType => {
  @Entity({ name: name as Capitalize<string>, namespace, properties: [{ name: 'value', type: PropertyType.string }] })
  class Scoped extends EntityBase {}
  return Scoped;
};

describe('命名空间不能占用 RxDB 实例成员', () => {
  it('方法名（destroy）作命名空间时注册期拒绝，销毁入口保持可用', () => {
    const database = createDatabase([entityIn('destroy', 'DestroyScopedRow')]);

    expect(() => database.init()).toThrow(/destroy/);
    expect(typeof database.destroy).toBe('function');
  });

  it('__proto__ 作命名空间时注册期拒绝，共享原型与其他实例不受污染', () => {
    const database = createDatabase([entityIn('__proto__', 'PrototypeLeakedRow')]);
    const bystander = createDatabase([]);

    expect(() => database.init()).toThrow(/__proto__/);
    expect(Object.hasOwn(RxDB.prototype, 'PrototypeLeakedRow')).toBe(false);
    expect(Reflect.get(bystander, 'PrototypeLeakedRow')).toBeUndefined();
  });

  it.each(['context', 'entitySync', 'schemaManager'])('实例成员 %s 作命名空间时注册期拒绝', member => {
    const database = createDatabase([entityIn(member, 'MemberScopedRow')]);
    const before = Reflect.get(database, member) as object;

    expect(() => database.init()).toThrow(new RegExp(member));
    expect(Reflect.get(database, member)).toBe(before);
    expect(Reflect.get(before, 'MemberScopedRow')).toBeUndefined();
  });

  it('public 实体名与实例成员同名时注册期拒绝', () => {
    const database = createDatabase([entityIn('public', 'destroy')]);

    expect(() => database.init()).toThrow(/destroy/);
    expect(typeof database.destroy).toBe('function');
  });
});

describe('合法命名空间照常挂载', () => {
  it('新命名空间建本实例自有的容器，重入复用', () => {
    const Row = entityIn('review', 'ReviewScopedRow');
    const database = createDatabase([Row]);

    database.init();
    database.schemaManager.init();

    const scope = Reflect.get(database, 'review') as Record<string, unknown>;
    expect(Object.hasOwn(database, 'review')).toBe(true);
    expect(scope['ReviewScopedRow']).toBe(Row);
  });

  it('接入方事先挂在实例上的普通对象照旧当容器复用', () => {
    const Row = entityIn('catalog', 'CatalogScopedRow');
    const database = createDatabase([Row]);
    const catalog: Record<string, unknown> = { retained: true };
    Object.defineProperty(database, 'catalog', { configurable: true, enumerable: true, value: catalog, writable: true });

    database.init();

    expect(catalog).toMatchObject({ retained: true, CatalogScopedRow: Row });
  });
});
