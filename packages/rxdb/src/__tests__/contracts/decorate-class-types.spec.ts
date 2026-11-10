import { describe, expect, expectTypeOf, it } from 'vitest';
import { __decorateClass } from '../../rxdb-utils.js';

/**
 * `__decorateClass` 的返回类型按 `kind` 分支，与运行时一致：
 *
 * - 类装饰器（`kind` 省略或为 0）：返回 target 本身的类型；
 * - 成员装饰器（`kind` 为 1）：返回属性描述符，target 上没有该成员时是 `undefined`；
 * - 字段装饰器（`kind` 大于 1）：没有初值，返回最后一个装饰器给出的任意值，可能是 `undefined`。
 *
 * 旧签名对所有分支都声明返回 target 的类型，`__decorateClass([], { value: 1 }, 'value', 2).value`
 * 能通过严格类型检查、运行时却抛 TypeError。本文件的类型断言是**编译期**红线：
 * vitest 不做类型检查，只在 `tsc -p tsconfig.spec.json --noEmit`（`typecheck` 目标）里转红。
 */
describe('__decorateClass 的返回类型按 kind 分支', () => {
  it('类装饰器分支返回 target 的类型', () => {
    class Target {}
    const decorated = __decorateClass([], Target);

    expectTypeOf(decorated).toEqualTypeOf<typeof Target>();
    expect(decorated).toBe(Target);
  });

  it('成员装饰器分支返回可能缺失的属性描述符', () => {
    const target = { value: 1 };
    const descriptor = __decorateClass([], target, 'value', 1);

    expectTypeOf(descriptor).toEqualTypeOf<PropertyDescriptor | undefined>();
    expect(descriptor?.value).toBe(1);
    expect(__decorateClass([], target, 'missing', 1)).toBeUndefined();
  });

  it('字段装饰器分支没有初值，返回 unknown', () => {
    const result = __decorateClass([], { value: 1 }, 'value', 2);

    expectTypeOf(result).toEqualTypeOf<unknown>();
    expect(result).toBeUndefined();
    // @ts-expect-error 字段分支的返回值不是 target，不能按 target 的形状读
    expect(() => result.value).toThrow(TypeError);
  });
});
