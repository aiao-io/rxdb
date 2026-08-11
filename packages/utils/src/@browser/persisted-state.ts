import { IS_BROWSER } from '../platform/is-browser.js';

/**
 * 转义持久化键的一个片段。
 *
 * @remarks
 * RAN-005：早先 namespace 与 name 直接用 `:` 拼接，映射不可逆 ——
 * `('a:b', 'c')` 与 `('a', 'b:c')` 得到同一个键 `a:b:c`，两份业务状态静默共用一份盘上数据。
 *
 * 这里只转义 `%` 与 `:` 两个字符（`%` 必须**先**转，否则还原时 `%3A` 会被二次解读），
 * 因此不含这两个字符的键 —— 也就是绝大多数既有键 —— 编码后逐字节不变，盘上数据不受影响；
 * 只有真正含冒号的键才改变，由 {@link PersistedStateRegistry} 一次性迁移。
 */
const encodeSegment = (segment: string): string => segment.replace(/%/g, '%25').replace(/:/g, '%3A');

/** 无碰撞的持久化键：两个片段各自转义后再用 `:` 连接。 */
const storageKeyOf = (namespace: string, name: string): string => `${encodeSegment(namespace)}:${encodeSegment(name)}`;

/** RAN-005 之前使用的裸拼接键，仅用于一次性迁移。 */
const legacyStorageKeyOf = (namespace: string, name: string): string => `${namespace}:${name}`;

/**
 * 盘上可能遗留的、无法 `JSON.parse` 的字面文本。
 *
 * @remarks
 * RAN-010：旧实现把 `JSON.stringify(undefined)`（运行时就是 `undefined`）直接交给 `setItem`，
 * 于是盘上留下字符串 `'undefined'`；下次读取判真后 `JSON.parse` 抛 `SyntaxError`。
 * 读到它一律按「没存过」处理并顺手清理。
 */
const LEGACY_UNDEFINED = 'undefined';

/**
 * 值的运行时类型标签，用于校验同 key 复用时的类型是否一致。
 *
 * @remarks
 * 只区分 JSON 能表达的大类：`null` 与数组都会被 `typeof` 归为 `'object'`，
 * 单独拆出来才能挡住 `null` ↔ `{}` ↔ `[]` 这类静默串型。
 */
const typeTagOf = (value: unknown): string => {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
};

/** 把任意 throw 载荷归一化成 `Error`。 */
const toError = (cause: unknown): Error => (cause instanceof Error ? cause : new Error(String(cause)));

/**
 * 一个 `namespace + name` 的持久化状态入口。
 *
 * @typeParam T - 状态值类型
 *
 * @remarks
 * 同一个 `namespace + name` 在同一个 {@link PersistedStateRegistry} 内**始终是同一个对象**，
 * 因此任意持有者的写入对其余持有者立即可见，也不存在「两份陈旧副本互相覆盖盘上数据」。
 *
 * @public
 */
export interface PersistedStateEntry<T> {
  /** 该状态在 `localStorage` 中的键（已转义）。 */
  readonly storageKey: string;
  /**
   * 读当前值。
   *
   * @returns 内存中的当前值；引用在两次 {@link PersistedStateEntry.set} 之间保持稳定，
   * 可直接用作 React `useSyncExternalStore` 的 snapshot。
   */
  get(): T;
  /**
   * 写入并同步落盘，然后通知所有订阅者。
   *
   * @param next - 新值
   *
   * @remarks
   * **写盘失败不会抛错**：内存值照常更新，失败经 {@link PersistedStateEntry.persistError}
   * 暴露给调用方（RAN-010）。订阅者无论落盘成功与否都会收到通知 ——
   * `persistError` 的变化本身就是订阅者要看的状态变化。
   */
  set(next: T): void;
  /**
   * 最近一次持久化失败；写盘成功后自动清空。
   *
   * @returns 失败原因，或 `undefined`
   *
   * @remarks
   * 配额超限、循环引用、`BigInt` 等都会让写盘失败而内存值照常更新 ——
   * 只有这个字段能让调用方知道数据没落盘（RAN-010）。
   */
  persistError(): Error | undefined;
  /**
   * 订阅该状态的变化。
   *
   * @param listener - 值或 `persistError` 变化后调用；不接收参数，请在回调里重新 `get()`
   * @returns 退订函数；重复调用是幂等的
   */
  subscribe(listener: () => void): () => void;
}

/** {@link PersistedStateRegistry} 的构造选项。 */
export interface PersistedStateRegistryOptions {
  /**
   * 读盘 / 写盘失败时的旁路上报。
   *
   * @remarks
   * 用于接到宿主框架的全局错误通道（Angular `ErrorHandler`、Sentry、`console.error` 等）。
   * 与 {@link PersistedStateEntry.persistError} 是两条互补路径：前者给运维，后者给 UI。
   * 未提供时失败**静默**吞掉 —— 仍可从 `persistError()` 观察到。
   */
  onError?: (error: unknown) => void;
}

/** 注册表内部为每个键持有的可变状态。 */
interface EntryState<T> {
  value: T;
  persistError: Error | undefined;
  readonly typeTag: string;
  readonly storageKey: string;
  readonly listeners: Set<() => void>;
}

/**
 * 一个键的完整注册项：可变状态 + 对外的稳定门面。
 *
 * @remarks
 * 门面必须**只建一次**并缓存：React 的 `useSyncExternalStore` 以 `subscribe` 的函数
 * identity 判断是否需要重新订阅，每次 `entry()` 新建一份会让组件每渲染一次就退订重订一次。
 */
interface RegisteredEntry<T> {
  readonly state: EntryState<T>;
  readonly facade: PersistedStateEntry<T>;
}

/**
 * 同 key 复用时校验值类型。
 *
 * @throws 首次注册的类型与本次不一致时抛出
 */
const assertSameTypeTag = (namespace: string, name: string, registered: string, incoming: string): void => {
  if (registered === incoming) return;
  throw new Error(
    `Persisted state ('${namespace}', '${name}') was first registered with a ${registered} value ` +
      `but is now reused with a ${incoming} value. A key must keep one value type.`
  );
};

/**
 * 按 `namespace` / `name` 两级复用的持久化状态注册表。
 *
 * @remarks
 * 这是三端 `useState` / `usePersistedState` 的**框架无关内核**：键转义、旧键迁移、
 * 类型标签校验、`undefined` 的落盘语义、写盘失败可观测都只在这里定义一份（RVU-010）。
 * 框架侧只负责把 {@link PersistedStateEntry} 包成各自的响应式容器
 * （Angular `Signal`、Vue `Ref`、React `useSyncExternalStore`）。
 *
 * 采用**嵌套 Map**，namespace 与 name 各占一层，进程内不可能串号（RAN-005）。
 *
 * 非浏览器环境（SSR、Node）下不读也不写 `localStorage`，状态退化成纯内存值，
 * 因此服务端渲染不会因为缺少 `localStorage` 抛错。
 *
 * 暂不监听 `storage` 事件，因此**不跨标签页同步**：另一个标签页的写入不会反映到本实例。
 *
 * @example
 * ```ts
 * const registry = new PersistedStateRegistry({ onError: console.error });
 * const theme = registry.entry('my-app', 'theme', 'dark');
 *
 * theme.subscribe(() => render(theme.get()));
 * theme.set('light'); // 落盘到 'my-app:theme' 并通知订阅者
 * ```
 *
 * @public
 */
export class PersistedStateRegistry {
  readonly #entries = new Map<string, Map<string, RegisteredEntry<never>>>();
  readonly #onError: ((error: unknown) => void) | undefined;

  /**
   * @param options - 见 {@link PersistedStateRegistryOptions}
   */
  constructor(options?: PersistedStateRegistryOptions) {
    this.#onError = options?.onError;
  }

  /**
   * 取得（必要时创建）某个键的状态入口。
   *
   * @typeParam T - 状态值类型
   * @param namespace - 命名空间；与 `name` 各自转义后组成持久化键
   * @param name - 键名
   * @param initialValue - **仅首次注册生效**的初值；盘上已有值时以盘上值为准
   * @returns 同 `namespace + name` 始终返回**同一个** {@link PersistedStateEntry} 对象
   * @throws 同键此前以不同**值类型**注册过时抛出（RAN-010）
   *
   * @remarks
   * 首次创建时会把解析出的初值**立即落盘一次**：这样「初值即约定」在盘上可见，
   * 也让 `undefined` 初值顺手清掉可能遗留的旧键。
   */
  entry<T>(namespace: string, name: string, initialValue: T): PersistedStateEntry<T> {
    const names = this.#entries.get(namespace) ?? new Map<string, RegisteredEntry<never>>();
    this.#entries.set(namespace, names);
    const typeTag = typeTagOf(initialValue);

    const cached = names.get(name) as RegisteredEntry<T> | undefined;
    if (cached) {
      assertSameTypeTag(namespace, name, cached.state.typeTag, typeTag);
      return cached.facade;
    }

    const registered = this.#register(namespace, name, initialValue, typeTag);
    names.set(name, registered as RegisteredEntry<never>);
    return registered.facade;
  }

  /** 建立一个新键的状态与门面，并把初值落盘一次。 */
  #register<T>(namespace: string, name: string, initialValue: T, typeTag: string): RegisteredEntry<T> {
    const storageKey = storageKeyOf(namespace, name);
    const state: EntryState<T> = {
      value: this.#restore(storageKey, legacyStorageKeyOf(namespace, name), initialValue),
      persistError: undefined,
      typeTag,
      storageKey,
      listeners: new Set()
    };
    this.#persist(state);

    return {
      state,
      facade: {
        storageKey,
        get: () => state.value,
        set: (next: T) => this.#write(state, next),
        persistError: () => state.persistError,
        subscribe: (listener: () => void) => {
          state.listeners.add(listener);
          return () => {
            state.listeners.delete(listener);
          };
        }
      }
    };
  }

  /** 写内存值 → 落盘 → 通知订阅者。 */
  #write<T>(state: EntryState<T>, next: T): void {
    state.value = next;
    this.#persist(state);
    state.listeners.forEach(listener => listener());
  }

  /** 从盘上恢复初值；读失败或没存过都退回 `fallback`。 */
  #restore<T>(storageKey: string, legacyKey: string, fallback: T): T {
    if (!IS_BROWSER) return fallback;

    try {
      const raw = this.#read(storageKey, legacyKey);
      return raw === undefined ? fallback : (JSON.parse(raw) as T);
    } catch (error) {
      this.#onError?.(error);
      return fallback;
    }
  }

  /** 读当前键；没有就尝试从旧键迁移，并过滤掉遗留的 `'undefined'` 文本。 */
  #read(storageKey: string, legacyKey: string): string | undefined {
    const raw = localStorage.getItem(storageKey) ?? this.#migrate(storageKey, legacyKey);
    if (raw === null) return undefined;

    if (raw === LEGACY_UNDEFINED) {
      localStorage.removeItem(storageKey);
      return undefined;
    }
    return raw;
  }

  /**
   * 把旧键的值一次性搬到新键。
   *
   * @remarks
   * 仅当新旧键真的不同（即键含 `%` 或 `:`）时才发生。旧格式本身有歧义 ——
   * `('a:b','c')` 与 `('a','b:c')` 的旧键同为 `a:b:c` —— 迁移只能把这份数据交给
   * 先访问的那一方，另一方退回自己的 `initialValue`。这是旧格式不可逆造成的，
   * 迁移无法凭空还原。
   */
  #migrate(storageKey: string, legacyKey: string): string | null {
    if (legacyKey === storageKey) return null;

    const legacy = localStorage.getItem(legacyKey);
    if (legacy === null) return null;

    localStorage.setItem(storageKey, legacy);
    localStorage.removeItem(legacyKey);
    return legacy;
  }

  /** 写盘，并把结果反映到 `persistError`。 */
  #persist<T>(state: EntryState<T>): void {
    if (!IS_BROWSER) return;

    try {
      const serialized = JSON.stringify(state.value);
      // JSON.stringify 对 undefined / 函数 / symbol 返回 undefined。
      // 原样交给 setItem 会在盘上留下无法 parse 的字面文本 'undefined'（RAN-010）
      if (serialized === undefined) {
        localStorage.removeItem(state.storageKey);
      } else {
        localStorage.setItem(state.storageKey, serialized);
      }
      state.persistError = undefined;
    } catch (error) {
      state.persistError = toError(error);
      this.#onError?.(error);
    }
  }
}
