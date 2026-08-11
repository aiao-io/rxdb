/**
 * 公开类型可具名消费（RVU-011）。
 *
 * @remarks
 * 这是一个**真实的 TypeScript consumer**：只从包入口 `../index` 导入，
 * 断言全部在编译期成立，由 `nx typecheck rxdb-vue` 校验。
 *
 * 此前 `UseOptions` / `RxDBInput` / `RxDBRef` / `RxDBDependencyInjection` 都是模块内私有别名 ——
 * 它们出现在公开声明的签名里，却不在导出清单中：调用方写不出具名的包装函数签名，
 * 只能靠 `Parameters<typeof useGet>[1]` 这类脆弱的反射，或把类型抄一遍。
 * 下面每处显式类型标注都会在类型不再被导出时立刻编译失败。
 */
import { type RxDB } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import { computed, ref, shallowRef, type Ref } from 'vue';
import {
  makeRxDBDependencyInjector,
  useGet,
  type InfiniteScrollResource,
  type RxDBDependencyInjection,
  type RxDBInput,
  type RxDBRef,
  type RxDBResource,
  type UseOptions
} from '../index';

interface TodoOptions {
  key: string;
}

describe('公开类型可具名消费（RVU-011）', () => {
  it('UseOptions 覆盖常量 / getter / Ref / ComputedRef 四种入参形态', () => {
    const constant: UseOptions<TodoOptions> = { key: 'a' };
    const getter: UseOptions<TodoOptions> = () => ({ key: 'b' });
    const reference: UseOptions<TodoOptions> = ref({ key: 'c' });
    const derived: UseOptions<TodoOptions> = computed(() => ({ key: 'd' }));

    expect([constant, getter, reference, derived]).toHaveLength(4);
  });

  it('调用方可以写出具名的包装函数签名', () => {
    // 正是 UseOptions 不导出时写不出来的东西
    const wrapTodo = <T extends { key: string }>(options: UseOptions<T>): UseOptions<T> => options;

    expect(wrapTodo({ key: 'wrapped' })).toEqual({ key: 'wrapped' });
  });

  it('RxDBInput 覆盖 Ref 与 undefined 两种「尚未就绪」形态', () => {
    // 用 shallowRef：深 ref 会把 RxDB 递归 unwrap 成另一个类型，这本身就是不该传深 ref 的理由
    const asRef: RxDBInput<RxDB> = shallowRef<RxDB | undefined>(undefined);
    const asPending: RxDBInput<RxDB> = undefined;

    expect([asRef, asPending]).toHaveLength(2);
  });

  it('RxDBRef 是只读引用，不允许调用方改写数据库', () => {
    const misuse = (databaseRef: RxDBRef<RxDB>): void => {
      // @ts-expect-error injector 返回的引用只读：数据库由 provideRxDB 决定
      databaseRef.value = undefined;
    };

    // 反向：可写 Ref 可以赋给 RxDBRef（只读是宽化方向），因此只能正向断言不可写
    const provide = (writable: Ref<RxDB | undefined>): RxDBRef<RxDB> => writable;

    expect(misuse).toBeTypeOf('function');
    expect(provide).toBeTypeOf('function');
  });

  it('RxDBDependencyInjection 可标注 makeRxDBDependencyInjector 的返回值', () => {
    const injection: RxDBDependencyInjection<RxDB> = makeRxDBDependencyInjector<RxDB>();

    expect(Object.keys(injection).sort()).toEqual(['injectRxDB', 'injectRxDBRef', 'provideRxDB']);
  });

  it('RxDBResource 与 InfiniteScrollResource 可标注 hook 的返回值', () => {
    const assertResource = (resource: RxDBResource<string | undefined>): void => {
      const value: string | undefined = resource.value;
      const hasValue: boolean = resource.hasValue;

      expect([value, hasValue]).toHaveLength(2);
    };

    const assertScroll = (resource: InfiniteScrollResource<{ id: string }>): void => {
      const items: { id: string }[] = resource.value.value;

      expect(items).toBeDefined();
    };

    // useGet 的返回值确实是 RxDBResource：类型不匹配会在此处编译失败
    const narrow: (resource: ReturnType<typeof useGet<never>>) => RxDBResource<never | undefined> = resource =>
      resource;

    expect([assertResource, assertScroll, narrow].every(fn => typeof fn === 'function')).toBe(true);
  });

  it('RxDBResource 的字段是快照值而非 Ref（解构契约的类型侧证据）', () => {
    const misuse = (resource: RxDBResource<string>): void => {
      // @ts-expect-error 字段是普通响应式属性，没有 .value —— 因此解构会拿到一次性快照（RVU-008）
      const inner: string = resource.value.value;

      expect(inner).toBeDefined();
    };

    expect(misuse).toBeTypeOf('function');
  });
});
