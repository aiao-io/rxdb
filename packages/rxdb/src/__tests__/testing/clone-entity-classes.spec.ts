/**
 * @fileoverview `cloneEntityClasses` 单源化：元数据槽位按 {@link METADATA} **身份**认，不按描述字符串认。
 *
 * @remarks
 * 这个函数原本在 `@aiao/rxdb-adapter-sqlite-core/testing` 与 `@aiao/rxdb-adapter-pglite/testing`
 * 各有一份逐字等价的实现，两份都靠 `symbol.description === 'ɵMetadata'` 找元数据槽位。
 * 字符串匹配的问题不是慢，是**改名之后它照样"成功"**：核心把 `ɵMetadata` 改成别的名字，
 * 两份实现都找不到槽位、都安静地返回一个**没有元数据的克隆**，而失败要等到第一次查询
 * 报"实体未注册"才浮出来，且那个错误不指向克隆。
 *
 * 搬到核心之后判据换成 `METADATA` 这个 `unique symbol` 本身——核心改名就是一次编译错误。
 * 下面第一组用例钉的就是这一点：拿一个**描述字符串相同但不是同一个 Symbol** 的槽位来，
 * 必须不被当成元数据。
 */

import { describe, expect, it } from 'vitest';
import type { EntityType } from '../../entity/entity.interface.js';
import { METADATA } from '../../rxdb.private.js';
import { cloneEntityClasses } from '../../testing.js';

/** 造一个带元数据槽位的实体类替身。 */
function createEntityClass(metadata: object, slot: symbol = METADATA): EntityType {
  class Fixture {}
  Object.defineProperty(Fixture, slot, {
    value: metadata,
    enumerable: false,
    configurable: true,
    writable: false
  });
  return Fixture as unknown as EntityType;
}

function readSlot(target: EntityType, slot: symbol = METADATA): unknown {
  return Object.getOwnPropertyDescriptor(target, slot)?.value;
}

describe('cloneEntityClasses', () => {
  it('克隆体继承原类，且元数据换成一份以原元数据为原型的新对象', () => {
    const metadata = { name: 'Foo', fields: ['id'] };
    const Source = createEntityClass(metadata);

    const [Clone] = cloneEntityClasses([Source]);

    expect(Clone).not.toBe(Source);
    expect(Object.getPrototypeOf(Clone)).toBe(Source);

    const cloned = readSlot(Clone);
    expect(cloned).not.toBe(metadata);
    expect(Object.getPrototypeOf(cloned as object)).toBe(metadata);
    // 继承而非复制：克隆体上写自己的字段，原元数据不受影响。
    (cloned as Record<string, unknown>)['name'] = 'Bar';
    expect(metadata.name).toBe('Foo');
  });

  it('沿原型链找元数据——子类不自带槽位时用父类那一份', () => {
    const metadata = { name: 'Base' };
    const Base = createEntityClass(metadata);
    class Derived extends (Base as unknown as new () => object) {}

    const [Clone] = cloneEntityClasses([Derived as unknown as EntityType]);

    expect(Object.getPrototypeOf(readSlot(Clone) as object)).toBe(metadata);
  });

  it('描述字符串相同但不是 METADATA 的槽位不算元数据', () => {
    const impostor = Symbol('ɵMetadata');
    const Source = createEntityClass({ name: 'Foo' }, impostor);

    const [Clone] = cloneEntityClasses([Source]);

    // 既没被当成元数据克隆，也没被当成普通静态 symbol 抄过去——`ɵ` 开头的槽位一律是核心内部的。
    expect(readSlot(Clone, impostor)).toBeUndefined();
    expect(readSlot(Clone)).toBeUndefined();
  });

  it('槽位上不是对象时当作没有元数据，而不是克隆一个原始值', () => {
    const Source = createEntityClass(null as unknown as object);

    const [Clone] = cloneEntityClasses([Source]);

    expect(readSlot(Clone)).toBeUndefined();
  });

  it('复制静态属性，但跳过 prototype / length / name 与其余 ɵ 内部槽位', () => {
    const otherInternal = Symbol('ɵProxy');
    const userSymbol = Symbol('userTag');
    const Source = createEntityClass({ name: 'Foo' });
    Object.defineProperty(Source, 'tableName', { value: 'foo_table', configurable: true });
    Object.defineProperty(Source, otherInternal, { value: 'internal', configurable: true });
    Object.defineProperty(Source, userSymbol, { value: 'user', configurable: true });

    const [Clone] = cloneEntityClasses([Source]);

    expect((Clone as unknown as Record<string, unknown>)['tableName']).toBe('foo_table');
    expect(readSlot(Clone, userSymbol)).toBe('user');
    expect(readSlot(Clone, otherInternal)).toBeUndefined();
    // `name` 不被覆盖：克隆体保留它自己的类名，否则两份类在错误消息里长得一模一样。
    expect(Clone.name).not.toBe(Source.name);
  });

  it('按入参顺序逐个克隆，没有元数据的类也照样进结果', () => {
    class Plain {}
    const Source = createEntityClass({ name: 'Foo' });

    const clones = cloneEntityClasses([Source, Plain as unknown as EntityType]);

    expect(clones.length).toBe(2);
    expect(Object.getPrototypeOf(clones[0])).toBe(Source);
    expect(Object.getPrototypeOf(clones[1])).toBe(Plain);
    expect(readSlot(clones[1])).toBeUndefined();
  });
});
