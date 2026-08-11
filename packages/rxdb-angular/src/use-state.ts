/**
 * @packageDocumentation
 * useState Hook - 响应式状态管理
 * 基于 Angular Signal 的命名空间状态管理,支持 localStorage 持久化
 */
import { IS_BROWSER } from '@aiao/utils';
import {
  CreateSignalOptions,
  effect,
  ErrorHandler,
  inject,
  Injectable,
  Injector,
  signal as ngSignal,
  Signal,
  WritableSignal
} from '@angular/core';
import { toError } from './to-error';

/**
 * 转义 localStorage 键的一个片段。
 *
 * @remarks
 * RAN-005：早先 namespace 与 name 直接用 `:` 拼接，映射不可逆 ——
 * `useState('a:b')('c')` 与 `useState('a')('b:c')` 得到同一个键 `a:b:c`，
 * 两份业务状态静默共用一个 signal 与一份盘上数据。
 *
 * 这里只转义 `%` 与 `:` 两个字符（`%` 必须**先**转，否则还原时 `%3A` 会被二次解读），
 * 因此不含这两个字符的键 —— 也就是绝大多数既有键 —— 编码后逐字节不变，
 * 盘上数据不受影响；只有真正含冒号的键才改变，由 {@link StateRegistry} 一次性迁移。
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
 * RAN-010：旧实现把 `JSON.stringify(undefined)`（运行时就是 `undefined`）直接交给
 * `setItem`，于是盘上留下字符串 `'undefined'`；下次读取判真后 `JSON.parse` 抛 SyntaxError。
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

/**
 * 同 key 复用时校验值类型。
 *
 * @throws 首次注册的类型与本次不一致时抛出
 *
 * @remarks
 * RAN-010：旧实现是 `return cached as WritableSignal<T>` —— 一次无校验断言。
 * 首处以 number 建 signal、第二处以 string 同 key 调用，strict TS 两边都过，
 * 拿到的却是同一个对象。类型只能在运行时兜住。
 */
const assertSameTypeTag = (namespace: string, name: string, registered: string, incoming: string): void => {
  if (registered === incoming) return;
  throw new Error(
    `useState('${namespace}')('${name}') was first registered with a ${registered} value ` +
      `but is now reused with a ${incoming} value. A key must keep one value type.`
  );
};

/** 已创建的 signal 及其首次注册时的类型标签。 */
interface SignalHolder {
  readonly signal: WritableSignal<unknown>;
  readonly typeTag: string;
}

/** 一个 `namespace + name` 的注册项。 */
interface StateEntry {
  /** 最近一次持久化失败；键一被命名就存在，与 signal 的创建时机无关。 */
  readonly persistError: WritableSignal<Error | undefined>;
  /** 首次调用 `signal(initialValue)` 时创建。 */
  holder: SignalHolder | undefined;
}

/**
 * 按 `namespace` / `name` 两级复用 signal 的注册表。
 *
 * @remarks
 * 挂在 root injector 上而非模块级常量：状态不应跨 Angular 应用实例泄漏
 * （测试里每次 `TestBed.resetTestingModule()` 也因此拿到干净的注册表）。
 *
 * RAN-005：改用**嵌套 Map**，namespace 与 name 各占一层，进程内不可能串号。
 *
 * RAN-006：持久化 effect 由本服务用 **root injector** 创建并持有。早先它绑在首个
 * 调用点的 `EnvironmentInjector` 上 —— lazy route 的 child injector 一销毁 effect
 * 随之销毁，而 signal 还留在 root Map 里，后续同 key 调用命中缓存直接返回、
 * 不会重建 effect，于是该状态从此永不写盘。effect 的生命周期必须与它守护的
 * signal 同源，也就是都归 root。
 */
@Injectable({ providedIn: 'root' })
class StateRegistry {
  readonly #injector = inject(Injector);
  readonly #errorHandler = inject(ErrorHandler);
  readonly #entries = new Map<string, Map<string, StateEntry>>();

  /** 取得（必要时创建）一个注册项；不创建 signal 本身。 */
  entry(namespace: string, name: string): StateEntry {
    const names = this.#entries.get(namespace) ?? new Map<string, StateEntry>();
    this.#entries.set(namespace, names);

    const cached = names.get(name);
    if (cached) return cached;

    const created: StateEntry = { persistError: ngSignal<Error | undefined>(undefined), holder: undefined };
    names.set(name, created);
    return created;
  }

  /**
   * 取得（必要时创建）某个键的 signal。
   *
   * @remarks
   * 同 key 必须复用：否则两个调用点互不感知，各自的持久化 effect
   * 还会用自己那份陈旧值覆盖对方刚写入的盘上数据。
   */
  getOrCreate<T>(
    namespace: string,
    name: string,
    initialValue: T,
    options?: CreateSignalOptions<T>
  ): WritableSignal<T> {
    const entry = this.entry(namespace, name);
    const typeTag = typeTagOf(initialValue);

    const { holder } = entry;
    if (holder) {
      assertSameTypeTag(namespace, name, holder.typeTag, typeTag);
      return holder.signal as WritableSignal<T>;
    }

    const key = storageKeyOf(namespace, name);
    const restored = this.#restore(key, legacyStorageKeyOf(namespace, name), initialValue);
    const state = ngSignal<T>(restored, options);
    entry.holder = { signal: state as WritableSignal<unknown>, typeTag };

    effect(() => this.#persist(key, state(), entry.persistError), { injector: this.#injector });
    return state;
  }

  /** 从盘上恢复初值；读失败或没存过都退回 `fallback`。 */
  #restore<T>(key: string, legacyKey: string, fallback: T): T {
    if (!IS_BROWSER) return fallback;

    try {
      const raw = this.#read(key, legacyKey);
      return raw === undefined ? fallback : (JSON.parse(raw) as T);
    } catch (error) {
      this.#errorHandler.handleError(error);
      return fallback;
    }
  }

  /** 读当前键；没有就尝试从旧键迁移，并过滤掉遗留的 `'undefined'` 文本。 */
  #read(key: string, legacyKey: string): string | undefined {
    const raw = localStorage.getItem(key) ?? this.#migrate(key, legacyKey);
    if (raw === null) return undefined;

    if (raw === LEGACY_UNDEFINED) {
      localStorage.removeItem(key);
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
  #migrate(key: string, legacyKey: string): string | null {
    if (legacyKey === key) return null;

    const legacy = localStorage.getItem(legacyKey);
    if (legacy === null) return null;

    localStorage.setItem(key, legacy);
    localStorage.removeItem(legacyKey);
    return legacy;
  }

  /**
   * 写盘，并把结果反映到 `persistError`。
   *
   * @remarks
   * RAN-010：写盘失败此前只经 `ErrorHandler` 打一条日志，而 signal 值早已更新完毕 ——
   * 调用方从返回值上完全看不出数据没落盘。现在失败进入可观察状态，成功后自动清空。
   */
  #persist(key: string, value: unknown, persistError: WritableSignal<Error | undefined>): void {
    if (!IS_BROWSER) return;

    try {
      const serialized = JSON.stringify(value);
      // JSON.stringify 对 undefined / 函数 / symbol 返回 undefined。
      // 原样交给 setItem 会在盘上留下无法 parse 的字面文本 'undefined'（RAN-010）
      if (serialized === undefined) {
        localStorage.removeItem(key);
      } else {
        localStorage.setItem(key, serialized);
      }
      persistError.set(undefined);
    } catch (error) {
      persistError.set(toError(error));
      this.#errorHandler.handleError(error);
    }
  }
}

/**
 * 某个 `namespace + name` 的状态入口。
 *
 * @public
 */
export interface NamespacedState {
  /**
   * 取得该键的 signal；同键始终返回同一个。
   *
   * @param initialValue - 首次注册时的初值；盘上已有值时以盘上值为准
   * @param options - 传给 Angular `signal()` 的选项，仅首次注册生效
   * @throws 同键此前以不同**值类型**注册过时抛出（RAN-010）
   */
  readonly signal: <T>(initialValue: T, options?: CreateSignalOptions<T>) => WritableSignal<T>;
  /**
   * 最近一次持久化失败；写盘成功后自动清空。
   *
   * @remarks
   * 配额超限、循环引用、BigInt 等都会让写盘失败而 signal 值照常更新 ——
   * 只有这个字段能让调用方知道数据没落盘（RAN-010）。
   */
  readonly persistError: Signal<Error | undefined>;
}

function state(namespace: string) {
  return (name: string): NamespacedState => {
    const registry = inject(StateRegistry);
    const entry = registry.entry(namespace, name);

    return {
      signal: <T>(initialValue: T, options?: CreateSignalOptions<T>): WritableSignal<T> =>
        registry.getOrCreate(namespace, name, initialValue, options),
      persistError: entry.persistError.asReadonly()
    };
  };
}

/**
 * 创建命名空间下的持久化状态读写入口。
 *
 * @param namespace 状态命名空间，与 name 组成 localStorage 的键
 * @returns 传入 name 后返回 {@link NamespacedState}，同一 `namespace + name` 始终返回同一个 signal
 *
 * @remarks
 * **必须在 Angular 注入上下文中调用** `useState(namespace)(name)` —— 注册表是 root 服务。
 *
 * 首次调用时的 `initialValue` 决定初值；后续同 key 调用直接复用已有 signal，
 * 传入的 `initialValue` 与 `options` 会被忽略；值类型与首次不一致时会抛错（RAN-010）。
 *
 * `namespace` 与 `name` 可以包含任意字符：两者在持久化键里各自转义，
 * 不会互相串号（RAN-005）。含 `:` 或 `%` 的旧键在首次读取时一次性迁移到新键。
 *
 * 暂不监听 `storage` 事件，因此**不跨标签页同步**：另一个标签页的写入不会反映到本页 signal。
 */
export const useState = (namespace: string) => state(namespace);
