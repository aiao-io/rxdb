import { PersistedStateRegistry } from '@aiao/utils';
import { useSyncExternalStore } from 'react';

/**
 * 命名空间持久化状态的进程内注册表。
 *
 * @remarks
 * Angular 侧把它挂在 root injector 上，让状态不跨应用实例泄漏；React 没有等价的
 * 应用级 DI 根（Context 需要组件树，而这个 API 必须能在组件之外调用），
 * 因此退化成**模块级单例** —— 同一个 bundle 内的多个 React 根共享同一份注册表。
 * 这与 Vue 侧一致，`localStorage` 本来也是同源共享的。
 *
 * `onError` 走 `console.error`：模块级单例够不着 React 的 error boundary。
 * UI 侧要感知失败请读 {@link PersistedState.persistError}。
 */
const registry = new PersistedStateRegistry({
  onError: error => console.error('[@aiao/rxdb-react] persisted state:', error)
});

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
 * @throws 同 `namespace + name` 此前以不同**值类型**注册过时，在渲染期抛出
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
 * `getServerSnapshot` 与客户端读取共用同一个入口：非浏览器环境（SSR）下不读也不写
 * `localStorage`，状态退化成纯内存值，客户端 hydrate 后从盘上恢复。
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
  // entry 门面在注册表里只建一次，get / subscribe / set 的 identity 都是稳定的 ——
  // useSyncExternalStore 正是以 subscribe 的 identity 判定要不要重新订阅
  const entry = registry.entry(namespace, name, initialValue);
  const value = useSyncExternalStore(entry.subscribe, entry.get, entry.get);
  const persistError = useSyncExternalStore(entry.subscribe, entry.persistError, entry.persistError);

  return { value, setValue: entry.set, persistError };
};
