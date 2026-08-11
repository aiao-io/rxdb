import { PersistedStateRegistry, type PersistedStateEntry } from '@aiao/utils';
import { computed, shallowRef, type ComputedRef, type Ref } from 'vue';

/**
 * 命名空间持久化状态的进程内注册表。
 *
 * @remarks
 * Angular 侧把它挂在 root injector 上，让状态不跨应用实例泄漏；Vue 没有等价的
 * 应用级 DI 根（`provide/inject` 需要组件树，而这个 API 必须能在 setup 之外调用），
 * 因此退化成**模块级单例** —— 同一个 bundle 内的多个 Vue 应用共享同一份注册表。
 * 这是三端唯一的实质差异，`localStorage` 本来也是同源共享的。
 *
 * `onError` 走 `console.error`：Vue 的 `app.config.errorHandler` 绑在应用实例上，
 * 模块级单例够不着。UI 侧要感知失败请读 {@link PersistedState.persistError}。
 */
const registry = new PersistedStateRegistry({
  onError: error => console.error('[@aiao/rxdb-vue] persisted state:', error)
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
   * 可读写的状态引用；同 `namespace + name` 始终是**同一个** `Ref`。
   *
   * @remarks
   * 写入即落盘（同步），并通知同 key 的所有持有者。
   * 是 `shallowRef` 语义：对象**原地改字段不会**触发响应式，也不会落盘，必须整体赋新值。
   */
  readonly value: Ref<T>;
  /**
   * 最近一次持久化失败；写盘成功后自动清空。
   *
   * @remarks
   * 配额超限、循环引用、`BigInt` 等都会让写盘失败而内存值照常更新 ——
   * 只有这个字段能让调用方知道数据没落盘。
   */
  readonly persistError: ComputedRef<Error | undefined>;
}

/**
 * 每个 entry 只建一次的 Vue 绑定，连同它对 entry 的唯一一条订阅。
 *
 * @remarks
 * 按 entry 缓存而不是按调用点新建：否则每个组件实例都会挂一条订阅，
 * 卸载时又没有对应的退订时机（状态本身比组件活得久）。
 * entry 门面在注册表里是稳定对象，因此可以直接做 `WeakMap` 的键。
 */
const bindings = new WeakMap<PersistedStateEntry<unknown>, PersistedState<unknown>>();

const bindingOf = <T>(entry: PersistedStateEntry<T>): PersistedState<T> => {
  const key = entry as PersistedStateEntry<unknown>;
  const cached = bindings.get(key);
  if (cached) return cached as PersistedState<T>;

  const snapshot = shallowRef<T>(entry.get());
  const failure = shallowRef<Error | undefined>(entry.persistError());
  // 订阅与 entry 同寿：一个 key 一条，不随组件增减
  entry.subscribe(() => {
    snapshot.value = entry.get();
    failure.value = entry.persistError();
  });

  const created: PersistedState<T> = {
    value: computed({
      get: () => snapshot.value,
      set: next => entry.set(next)
    }),
    persistError: computed(() => failure.value)
  };
  bindings.set(key, created as PersistedState<unknown>);
  return created;
};

/**
 * 创建（或复用）一份持久化到 `localStorage` 的命名空间状态。
 *
 * @typeParam T - 状态值类型
 * @param namespace - 状态命名空间
 * @param name - 键名；与 `namespace` 各自转义后组成持久化键
 * @param initialValue - **仅首次注册生效**的初值；盘上已有值时以盘上值为准
 * @returns 见 {@link PersistedState}
 * @throws 同 `namespace + name` 此前以不同**值类型**注册过时抛出
 *
 * @example
 * ```ts
 * const theme = usePersistedState('my-app', 'theme', 'dark');
 *
 * theme.value.value = 'light'; // 立即落盘到 'my-app:theme'
 * ```
 *
 * @remarks
 * 同 `namespace + name` 始终返回同一份状态：两个调用点互相可见，也不会各自
 * 拿着陈旧副本互相覆盖盘上数据。后续调用传入的 `initialValue` 会被忽略，
 * 但仍参与**类型标签**校验 —— 同 key 换值类型直接抛错，而不是静默串型。
 *
 * `namespace` 与 `name` 可以包含任意字符：两者在持久化键里各自转义，不会互相串号；
 * 含 `:` 或 `%` 的旧键在首次读取时一次性迁移到新键。
 *
 * 非浏览器环境（SSR）下不读也不写 `localStorage`，状态退化成纯内存值，不会抛错；
 * 客户端 hydrate 后从盘上恢复。
 *
 * 暂不监听 `storage` 事件，因此**不跨标签页同步**。
 *
 * 三端等价实现：Angular `usePersistedState`（`WritableSignal`）、React
 * `usePersistedState`（快照 + setter）。持久化内核是共享的
 * `@aiao/utils` `PersistedStateRegistry`，键格式三端一致。
 *
 * @public
 */
export const usePersistedState = <T>(namespace: string, name: string, initialValue: T): PersistedState<T> =>
  bindingOf(registry.entry(namespace, name, initialValue));
