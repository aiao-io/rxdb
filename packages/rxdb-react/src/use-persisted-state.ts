import { PersistedStateRegistry } from '@aiao/utils';
import { useCallback, useState, useSyncExternalStore } from 'react';

/**
 * 命名空间持久化状态的进程内注册表。
 *
 * @remarks
 * Angular 侧把它挂在 root injector 上，让状态不跨应用实例泄漏；React 没有等价的
 * 应用级 DI 根（Context 需要组件树，而这个 API 必须能在组件之外调用），
 * 因此退化成**模块级单例** —— 同一个 bundle 内的多个 React 根共享同一份注册表。
 * 这与 Vue 侧一致，`localStorage` 本来也是同源共享的。
 *
 * 服务端渲染**不碰**这份注册表：长驻 SSR 进程里它跨请求存活，在里面登记会把上一个请求的
 * 值类型钉在键上（下一个请求换了类型整页抛错），也会让每个请求的初值一直留在进程里。
 * 所以只在 React 仅于客户端调用的回调里取表 —— `getSnapshot`、`subscribe` 与 `setValue`；
 * 服务端渲染只调 `getServerSnapshot`，hydrate 那一帧也是。
 *
 * `onError` 走 `console.error`：模块级单例够不着 React 的 error boundary。
 * UI 侧要感知失败请读 {@link PersistedState.persistError}。
 */
const registry = new PersistedStateRegistry({
  onError: error => console.error('[@aiao/rxdb-react] persisted state:', error)
});

/** 服务端从不写盘，服务端快照里没有持久化失败。 */
const noPersistError = (): undefined => undefined;

/**
 * 某个 `namespace + name` 的持久化状态。
 *
 * @typeParam T - 状态值类型
 *
 * @public
 */
export interface PersistedState<T> {
  /**
   * 当前值的渲染快照。
   *
   * @remarks
   * 是**快照**语义：对象原地改字段不会触发重渲染，也不会落盘，必须整体 {@link PersistedState.setValue}。
   */
  readonly value: T;
  /**
   * 写入并同步落盘，然后通知同 key 的所有持有者。
   *
   * @remarks
   * 函数 identity 跨渲染稳定，可以直接进依赖数组。
   * 写盘失败**不会抛错**：内存值照常更新，失败经 {@link PersistedState.persistError} 暴露。
   */
  readonly setValue: (next: T) => void;
  /**
   * 最近一次持久化失败；写盘成功后自动清空。
   *
   * @remarks
   * 配额超限、循环引用、`BigInt` 等都会让写盘失败而内存值照常更新 ——
   * 只有这个字段能让调用方知道数据没落盘。
   */
  readonly persistError: Error | undefined;
}

/**
 * 创建（或复用）一份持久化到 `localStorage` 的命名空间状态。
 *
 * @typeParam T - 状态值类型
 * @param namespace - 状态命名空间
 * @param name - 键名；与 `namespace` 各自转义后组成持久化键
 * @param initialValue - **仅首次注册生效**的初值；盘上已有值时以盘上值为准
 * @returns 见 {@link PersistedState}
 * @throws 同 `namespace + name` 此前以不同**值类型**注册过时，在客户端渲染期抛出（服务端渲染不登记，也就不校验）
 *
 * @example
 * ```tsx
 * const theme = usePersistedState('my-app', 'theme', 'dark');
 *
 * return <button onClick={() => theme.setValue('light')}>{theme.value}</button>;
 * ```
 *
 * @remarks
 * 同 `namespace + name` 始终对应同一份状态：两个组件互相可见，一处写入另一处立刻重渲染，
 * 也不会各自拿着陈旧副本互相覆盖盘上数据。后续调用传入的 `initialValue` 会被忽略，
 * 但仍参与**类型标签**校验 —— 同 key 换值类型直接抛错，而不是静默串型。
 *
 * `namespace` 与 `name` 可以包含任意字符：两者在持久化键里各自转义，不会互相串号；
 * 含 `:` 或 `%` 的旧键在首次读取时一次性迁移到新键。
 *
 * 订阅走 `useSyncExternalStore`，因此在并发渲染与 `StrictMode` 下都不会读到撕裂的快照。
 * 服务端渲染（`getServerSnapshot`）恒为**本次调用**的 `initialValue`、`persistError` 恒为
 * `undefined`：不读也不写 `localStorage`，也不碰进程内注册表（不读、不登记），连续或并发的请求之间
 * 互不可见，同 key 跨请求换值类型也不抛错；同一次渲染里同 key 的调用点各自渲染自己的初值。
 * 客户端 hydrate 用同一个快照对齐服务端 HTML，提交后再切到注册表里的当前值（盘上值或首次注册的初值），
 * 不产生 hydration mismatch。
 *
 * 暂不监听 `storage` 事件，因此**不跨标签页同步**。
 *
 * 三端等价实现：Angular `usePersistedState`（`WritableSignal`）、Vue
 * `usePersistedState`（`Ref`）。持久化内核是共享的 `@aiao/utils`
 * `PersistedStateRegistry`，键格式三端一致。
 *
 * @public
 */
export const usePersistedState = <T>(namespace: string, name: string, initialValue: T): PersistedState<T> => {
  // 首次渲染的初值。hydrate 提交后，子组件的 effect 与本 hook 的订阅都早于快照核对，
  // 键可能还没登记 —— 那时当前渲染就是首次渲染，用它登记与 getSnapshot 同值
  const [registration] = useState(() => initialValue);
  // 先查后建：键已由快照（或别的调用点）登记时直接取，不拿首次渲染的初值再校验一次类型
  const entryOf = useCallback(
    () => registry.find<T>(namespace, name) ?? registry.entry(namespace, name, registration),
    [namespace, name, registration]
  );
  // useSyncExternalStore 以 subscribe 的 identity 判定要不要重新订阅；setValue 承诺跨渲染同一引用
  const subscribe = useCallback((listener: () => void) => entryOf().subscribe(listener), [entryOf]);
  const setValue = useCallback((next: T) => entryOf().set(next), [entryOf]);
  // 快照按本次的 initialValue 取表：同 key 换值类型在客户端渲染期 fail-fast
  const value = useSyncExternalStore(
    subscribe,
    () => registry.entry(namespace, name, initialValue).get(),
    () => initialValue
  );
  const persistError = useSyncExternalStore(
    subscribe,
    () => registry.entry(namespace, name, initialValue).persistError(),
    noPersistError
  );

  return { value, setValue, persistError };
};
