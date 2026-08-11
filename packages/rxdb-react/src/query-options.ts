import { createQueryOptionsKey } from '@aiao/utils';

/**
 * React 查询 hook 接受的选项形态。
 *
 * @remarks
 * factory 可能在一次 render 中求值多次，且每次必须返回结构相等的结果；否则查询 hook
 * 同步抛出 `TypeError`。选项按内容而非引用比较，合法实体游标会按查询排序字段投影，
 * 其他类实例、函数、`Symbol` 等不可序列化值会被拒绝。
 *
 * @typeParam T 查询选项类型。
 */
export type UseOptions<T> = T | (() => T);

interface ResolvedUseOptions<T> {
  readonly value: T;
  readonly key: string;
}

const isOptionsFactory = <T>(options: UseOptions<T>): options is () => T => typeof options === 'function';

export const resolveOptions = <T>(options: UseOptions<T>): T => (isOptionsFactory(options) ? options() : options);

export const resolveOptionsWithKey = <T>(options: UseOptions<T>): ResolvedUseOptions<T> => {
  const value = resolveOptions(options);
  const key = createOptionsKey(value);
  if (isOptionsFactory(options) && createOptionsKey(options()) !== key) {
    throw new TypeError('RxDB query options factory must return a stable value during one render');
  }
  return { value, key };
};

/**
 * 计算查询选项的内容 key，用于判定是否需要重订阅。
 *
 * @remarks
 * 实现由 `@aiao/utils` 的 {@link createQueryOptionsKey} 提供，与 Vue 侧共用同一份，
 * 避免两端各写一套后行为漂移（Vue 曾因朴素实现把 Date 坍缩成 `{}`，改了日期筛选却不重查）。
 *
 * RRE-002：早先直接用 `createStableKey`，它拒绝一切 prototype ≠ `Object.prototype` 的对象，
 * 而 `FindByCursorOptions.after/before` 的公开类型就是 `InstanceType<T>` ——
 * 把真实实体当游标（「从某条继续往下滚」）会在 **render 阶段**抛 `TypeError`，炸掉整棵组件树。
 * 现在游标按 `orderBy` 字段投影成确定快照后再参与 key。
 */
export const createOptionsKey = (options: unknown): string => createQueryOptionsKey(options, 'RxDB query options');

export const toError = (cause: unknown): Error => (cause instanceof Error ? cause : new Error(String(cause)));
