/**
 * @packageDocumentation
 * usePersistedState Hook - 命名空间持久化状态的扁平签名
 * 与 Vue / React 侧共用同一个 `(namespace, name, initialValue)` 签名
 */
import { CreateSignalOptions, Signal, WritableSignal } from '@angular/core';
import { useState } from './use-state';

/**
 * 某个 `namespace + name` 的持久化状态。
 *
 * @typeParam T - 状态值类型
 *
 * @public
 */
export interface PersistedState<T> {
  /**
   * 可读写的状态 signal；同 `namespace + name` 始终是**同一个**。
   *
   * @remarks
   * 写入经持久化 effect 落盘，并对同 key 的所有持有者立即可见。
   */
  readonly value: WritableSignal<T>;
  /**
   * 最近一次持久化失败；写盘成功后自动清空。
   *
   * @remarks
   * 配额超限、循环引用、`BigInt` 等都会让写盘失败而 signal 值照常更新 ——
   * 只有这个字段能让调用方知道数据没落盘（RAN-010）。
   */
  readonly persistError: Signal<Error | undefined>;
}

/**
 * 创建（或复用）一份持久化到 `localStorage` 的命名空间状态。
 *
 * @typeParam T - 状态值类型
 * @param namespace - 状态命名空间
 * @param name - 键名；与 `namespace` 各自转义后组成持久化键
 * @param initialValue - **仅首次注册生效**的初值；盘上已有值时以盘上值为准
 * @param options - 传给 Angular `signal()` 的选项，仅首次注册生效
 * @returns 见 {@link PersistedState}
 * @throws 同 `namespace + name` 此前以不同**值类型**注册过时抛出（RAN-010）
 *
 * @example
 * ```ts
 * const theme = usePersistedState('my-app', 'theme', 'dark');
 *
 * theme.value.set('light'); // 落盘到 'my-app:theme'
 * ```
 *
 * @remarks
 * **必须在 Angular 注入上下文中调用** —— 注册表是 root 服务。
 *
 * 这是 {@link useState} 的**扁平签名适配**，不是第二套持久化实现：注册表、键格式、
 * 迁移与失败语义完全一致，`usePersistedState(ns, name, init).value` 与
 * `useState(ns)(name).signal(init)` 返回的是同一个 signal，两种写法可以混用。
 *
 * 存在的理由是三端签名对齐（RVU-010）：React 的 hooks 规则不允许
 * 「从返回对象的方法里再调 hook」，`useState(ns)(name).signal(init)` 的柯里化形态
 * 在 React 侧无法复现，因此三端统一到这个扁平签名上。
 *
 * 三端等价实现：Vue `usePersistedState`（`Ref`）、React `usePersistedState`（快照 + setter）。
 * Vue / React 侧的内核是 `@aiao/utils` 的 `PersistedStateRegistry`，与本实现**键格式一致**
 * 但各自独立持有内存状态 —— 同一页面里混用两端框架时，盘上数据互通，内存值不互通。
 *
 * @public
 */
export const usePersistedState = <T>(
  namespace: string,
  name: string,
  initialValue: T,
  options?: CreateSignalOptions<T>
): PersistedState<T> => {
  const entry = useState(namespace)(name);
  return { value: entry.signal(initialValue, options), persistError: entry.persistError };
};
