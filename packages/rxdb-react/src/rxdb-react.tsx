import { RxDB } from '@aiao/rxdb';
import { createContext, useContext, useEffect, useMemo, useState, type JSX, type ReactNode } from 'react';

/**
 * `RxDBProvider` 接受的数据库形态：实例、Promise，或返回二者之一的工厂。
 *
 * @typeParam T - 数据库类型
 *
 * @remarks
 * 三个框架包（Angular / React / Vue）的 provider 收的是**同一个**联合类型，
 * 名字也相同 —— 这是三框架对称铁律的落点之一：同一段「怎么把库交给框架」的说明
 * 在三端逐字成立，用户换框架时不需要重学。
 *
 * 允许 Promise 是为了「候选走动态 `import()`」这类场景（US-207 E11）：
 * 桌面分支不应被静态 import 打进 web bundle，而 `await import()` 只能给出 Promise。
 *
 * **非实例的 source 必须是稳定引用**（模块级常量或 `useMemo` 的结果）。写成内联箭头
 * `db={() => setup()}` 会让每次渲染都拿到新身份，于是每次渲染都重建一次数据库 ——
 * 这是 React 依赖数组的固有语义，不是本包能替你兜住的。
 */
export type RxDBSource<T extends RxDB = RxDB> = T | Promise<T> | (() => T | Promise<T>);

/**
 * {@link RxDBProvider} 的 props。
 *
 * @remarks
 * RRE-008：`db` 是**必填**。早先声明为可选，`<RxDBProvider>` 因此能合法编译，
 * 而子树要到 `useRxDB()` 才运行时抛错，且错误文案提示「use RxDBProvider」——
 * 用户明明正用着 Provider，提示把人指向了错误的方向。
 *
 * 支持异步就绪后这条依旧成立：放宽的是 `db` 的**取值**（可以是 Promise 或工厂），
 * 不是它的**必填性**。「有 Provider 但还没就绪」由 {@link useRxDBOptional} 表达。
 */
export interface ProviderProps<T extends RxDB> {
  /** Provider 子树；未提供时渲染空节点。 */
  children?: ReactNode;
  /** 数据库实例、Promise，或返回二者之一的工厂。 */
  db: RxDBSource<T>;
}

/** RxDB Provider 组件类型。 */
export type RxDBProviderType<T extends RxDB> = (props: ProviderProps<T>) => JSX.Element;

/** 从显式参数或最近的 Provider 读取 RxDB 的 hook 类型；未就绪时抛错。 */
export type UseRxDB<T extends RxDB> = (db?: T) => T;

/** 从显式参数或最近的 Provider 读取 RxDB 的 hook 类型；未就绪时返回 `undefined`。 */
export type UseRxDBOptional<T extends RxDB> = (db?: T) => T | undefined;

/** 一组相互隔离的 RxDB Provider 与读取 hook。 */
export interface RxDBProviderSet<T extends RxDB> {
  /** 与 `useRxDB` 共享 context 的 Provider 组件。 */
  RxDBProvider: RxDBProviderType<T>;
  /** 读取显式传入或 context 中的数据库实例；未就绪时抛错。 */
  useRxDB: UseRxDB<T>;
  /** 读取显式传入或 context 中的数据库实例；未就绪时返回 `undefined`。 */
  useRxDBOptional: UseRxDBOptional<T>;
}

/**
 * context 里放的是一个槽位而不是实例本身。
 *
 * @remarks
 * 三种失败态必须可区分，否则报错文案会把人指向错误的方向 —— 那正是 RRE-008 记下的坑：
 * 「组件树里根本没有 Provider」「有 Provider 但没给 `db`」「给了异步 source 还没解析完」。
 * 槽位存在与否回答第一种，`pending` 区分后两种。
 */
interface RxDBSlot<T extends RxDB> {
  /** 已就绪的实例；未就绪为 `undefined`。 */
  readonly db: T | undefined;
  /** 异步 source 的创建异常；由 `useRxDB()` 原样抛出。 */
  readonly failure: unknown;
  /** source 是异步的且尚未解析完成。 */
  readonly pending: boolean;
}

/** 组件树中没有 Provider 时的文案；与改动前逐字相同。 */
const NO_PROVIDER_MESSAGE = 'No RxDB instance found, use RxDBProvider to provide one';

/** 有 Provider 但没拿到 `db` 时的文案（类型上必填，只有绕过类型检查才会走到）。 */
const NO_DATABASE_MESSAGE =
  'RxDBProvider received no database: the `db` prop is required. ' +
  'Pass an instance, a Promise, or a factory returning either.';

/** 异步 source 尚未解析完成时的文案。 */
const NOT_READY_MESSAGE =
  'RxDB is not ready yet: the source passed to RxDBProvider is still resolving. ' +
  'Read it with useRxDBOptional() and render a loading state.';

/** 结构化的 thenable 判定；`await import()` 的返回值未必是原生 `Promise` 实例。 */
const isThenable = <T,>(value: T | PromiseLike<T>): value is PromiseLike<T> =>
  typeof (value as PromiseLike<T> | undefined)?.then === 'function';

/**
 * source 需要异步解析吗？
 *
 * @remarks
 * 这个判定同时定义了所有权：**要解析的才是本 Provider 造出来的**，也就只有它该被断开。
 */
const isDeferred = <T extends RxDB>(source: RxDBSource<T>): boolean =>
  typeof source === 'function' || isThenable(source);

/** 尚未解析出结果的初始态；共享同一个引用，`setState` 回到它时 React 会跳过重渲染。 */
const UNRESOLVED = { db: undefined, failure: undefined } as const;

/**
 * 把 source 解析成槽位，并按所有权决定要不要在卸载时断开。
 *
 * @remarks
 * **所有权规则：provider 只销毁自己造的东西。** 传进来的是工厂或 Promise，实例就是本
 * Provider 造/等来的，卸载时负责 `disconnectAll()`；传进来的是一个已就绪实例，它归调用方
 * 所有，本 Provider 不碰。
 *
 * 后半条不是洁癖，是 `StrictMode` 下的正确性：开发期的双挂载会跑一次「挂载 → 卸载 → 挂载」，
 * 若对调用方传进来的模块级单例执行断开，第二次挂载拿到的就是一个已经断掉、且没有人会重连的库。
 *
 * 已就绪的实例走同步路径（首帧即可读），工厂与 Promise 走 effect —— 后者首帧读到 `undefined`，
 * 这正是 {@link useRxDBOptional} 要表达的 loading 态。
 */
const useResolvedRxDB = <T extends RxDB>(source: RxDBSource<T>): RxDBSlot<T> => {
  const pending = isDeferred(source);
  const ready = pending ? undefined : (source as T | undefined);
  const [state, setState] = useState<{ readonly db: T | undefined; readonly failure: unknown }>(UNRESOLVED);

  useEffect(() => {
    if (!pending) return;

    let disposed = false;
    let owned: T | undefined;
    const shutdown = (database: T): void => {
      void database.disconnectAll().catch(error => console.error('RxDB shutdown failed', error));
    };

    void Promise.resolve(typeof source === 'function' ? source() : source).then(
      database => {
        owned = database;
        // 已经卸载了才 resolve：实例仍然是本 Provider 造的，仍要负责断开。
        if (disposed) shutdown(database);
        else setState({ db: database, failure: undefined });
      },
      failure => {
        if (!disposed) setState({ db: undefined, failure });
      }
    );

    return () => {
      disposed = true;
      setState(UNRESOLVED);
      if (owned !== undefined) shutdown(owned);
    };
  }, [source, pending]);

  return useMemo(() => ({ db: ready ?? state.db, failure: state.failure, pending }), [ready, state, pending]);
};

/**
 * 创建隔离的 RxDB React context 与访问 hook。
 *
 * @returns 共享同一个 context 的 Provider、`useRxDB` 与 `useRxDBOptional`。
 */
export function makeRxDBProvider<T extends RxDB>(): RxDBProviderSet<T> {
  const context = createContext<RxDBSlot<T> | undefined>(undefined);

  const useOptionalDatabase = (db?: T): T | undefined => {
    const slot = useContext(context);
    return db ?? slot?.db;
  };

  const useDatabase = (db?: T): T => {
    const slot = useContext(context);
    if (db !== undefined) return db;
    if (slot === undefined) throw new Error(NO_PROVIDER_MESSAGE);
    if (slot.failure !== undefined) throw slot.failure;
    if (slot.db === undefined) throw new Error(slot.pending ? NOT_READY_MESSAGE : NO_DATABASE_MESSAGE);
    return slot.db;
  };

  const DatabaseProvider = ({ children, db }: ProviderProps<T>): JSX.Element => {
    const slot = useResolvedRxDB(db);

    return <context.Provider value={slot}>{children}</context.Provider>;
  };

  return { RxDBProvider: DatabaseProvider, useRxDB: useDatabase, useRxDBOptional: useOptionalDatabase };
}

const defaultProvider = makeRxDBProvider<RxDB>();

/** 默认 RxDB Provider；`db` 可以是实例、Promise 或工厂，见 {@link RxDBSource}。 */
export const RxDBProvider = defaultProvider.RxDBProvider;

/**
 * 读取显式传入的 RxDB，或最近的 {@link RxDBProvider}。
 *
 * @param db 可选的显式数据库；省略时读取最近的 Provider。
 * @throws 组件树中没有 Provider、Provider 没拿到 `db`、异步 source 尚未就绪时各抛一条
 *   不同的文案；异步 source 创建失败时原样抛出创建异常。
 */
export const useRxDB = defaultProvider.useRxDB;

/**
 * 读取显式传入的 RxDB，或最近的 {@link RxDBProvider}，取不到时返回 `undefined`。
 *
 * @param db 可选的显式数据库；省略时读取最近的 Provider。
 * @returns 已就绪的实例；没有 Provider 或数据库尚未就绪时为 `undefined`
 *
 * @remarks
 * 与 {@link useRxDB} 的区别只有「没有时怎么办」：这个不抛错，用于异步 source 下渲染 loading 态。
 */
export const useRxDBOptional = defaultProvider.useRxDBOptional;
