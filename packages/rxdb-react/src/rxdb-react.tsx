import { RxDB } from '@aiao/rxdb';
import { createContext, useContext, useEffect, useMemo, useRef, useState, type JSX, type ReactNode } from 'react';

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
 *
 * **会被 `<Activity>` 隐藏的 Provider 请传工厂或已就绪实例，不要传 Promise。** 隐藏与卸载
 * 一样会执行 effect 清理，清理时两者无从区分，Provider 只能照所有权规则销毁自己持有的库
 * （`destroy()` 是终态）。重显时工厂会被重新调用、建出一个新库；Promise 不能重新求值，只会
 * 再解析出那个已销毁的实例 —— Provider 不会把它交出去，而是让 `useRxDB()` 抛出明确的错误
 * （`useRxDBOptional()` 为 `undefined`）。工厂每次调用都必须新建数据库，交回一个已被
 * Provider 销毁过的实例同样按错误处理；要共享同一个库，直接传实例。
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
  /** 组件树中有没有本套的 Provider；与数据库是否就绪、是否创建失败无关。 */
  useHasRxDBProvider: () => boolean;
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
  /**
   * 异步 source 的创建异常，或「已断开的 source 交不出可用实例」的错误；由 `useRxDB()` 原样抛出。
   */
  readonly failure: unknown;
  /**
   * source 需要异步解析（工厂或 Promise）。
   *
   * @remarks
   * 取值是 source 的**形态**，解析完成后依旧为 `true`，不是「此刻还在解析」。
   * 它只在 `db === undefined` 时被读，用于把「有 Provider 但没给 `db`」与
   * 「给了异步 source 还没解析完」这两种失败分开 —— 而 `db` 有值时二者都不成立。
   */
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

/** 已被断开过的 Promise source 又被接通（`<Activity>` 重显、source 换回来）时的文案。 */
const RELEASED_PROMISE_MESSAGE =
  'RxDBProvider cannot reopen a Promise source after releasing it: the database it resolved to was destroyed ' +
  'when the provider disconnected (an unmount, or a hidden <Activity>), and a Promise cannot be evaluated again. ' +
  'Pass a factory that creates a new database, or a ready instance you own.';

/** source 交回一个已被 Provider 销毁过的实例（典型是返回共享实例的工厂）时的文案。 */
const RELEASED_DATABASE_MESSAGE =
  'RxDBProvider received a database that a provider already destroyed when releasing it. ' +
  'Factory and Promise sources are owned by the provider, so each must yield a database of its own ' +
  '(a factory has to create a new one on every call); pass the instance itself to share one database.';

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

/**
 * 一次 source 解析的结果，带着产生它的 source。
 *
 * @remarks
 * 结果写进状态的时机（解析回调、旧 effect 的清理）都晚于新 props 的提交：换 source 的那一帧，
 * 状态里还是旧 source 的库或创建异常，子树的 layout effect 却已经在读了。渲染只认 `source`
 * 与当前 source 相同的结果，其余一律按未解析处理。
 */
interface RxDBResolution<T extends RxDB> {
  /** 产生本结果的 source；未解析时为 `undefined`。 */
  readonly source: RxDBSource<T> | undefined;
  /** 解析出的实例。 */
  readonly db: T | undefined;
  /** 解析失败的原因。 */
  readonly failure: unknown;
}

/** 尚未解析出结果的初始态；共享同一个引用，`setState` 回到它时 React 会跳过重渲染。 */
const UNRESOLVED = { source: undefined, db: undefined, failure: undefined } as const;

/**
 * 已被 Provider 断开过的 Promise source 与实例。
 *
 * @remarks
 * `RxDB.destroy()` 是终态（之后 `init()` 抛错、`connect()` reject），Promise 也不能重新求值：
 * 断开过的 Promise 只会再解析出那个已销毁的实例。`<Activity>` 隐藏与真正卸载在 effect 清理时
 * 无从区分，Provider 只能照所有权规则断开；之后再接通（重显、source 换回来）时凭这两张表明确
 * 失败，而不是把已销毁实例当就绪库交出去。
 *
 * 放在模块级而不是每个 Provider 一份：换一个 Provider 接手同一个 source，拿到的仍是那个已销毁
 * 的实例。WeakSet 不延长任何对象的寿命。
 */
const releasedSources = new WeakSet<object>();
const releasedDatabases = new WeakSet<RxDB>();

const shutdown = (database: RxDB): void => {
  releasedDatabases.add(database);
  void database.destroy().catch(error => console.error('RxDB shutdown failed', error));
};

/**
 * 求值 source，拒绝任何已被断开过的结果。
 *
 * @param source - 要求值的 source
 * @param reopened - 打开租约时这个 Promise source 是否已被更早的租约断开过
 *
 * @remarks
 * Promise 按 source 判而不只按实例判：更早的租约可能在解析完成之前就已断开，那时实例还没到、无从
 * 登记，到货时是旧租约先销毁还是新租约先交出，取决于微任务次序。先等结果再判，是为了让失败的
 * Promise 照旧报它自己的创建异常 —— 那种情况下没有实例被销毁。工厂每次求值都可能得到新实例，
 * 只能按结果判。
 */
const evaluateSource = async <T extends RxDB>(source: RxDBSource<T>, reopened: boolean): Promise<T> => {
  const database = await (typeof source === 'function' ? source() : source);
  if (reopened) throw new Error(RELEASED_PROMISE_MESSAGE);
  if (releasedDatabases.has(database)) throw new Error(RELEASED_DATABASE_MESSAGE);
  return database;
};

/**
 * 一次 source 解析的**租约**：解析只发生一次，断不断开取决于「还有没有挂载持有它」。
 *
 * @remarks
 * 把断开直接挂在 effect 清理上是不够的。`StrictMode` 的「挂载 → 卸载 → 再挂载」会把第一次
 * 生命周期整个丢弃，而 provider 判所有权靠的是 source 的**形状**（工厂 / Promise），
 * 看不出 `db={() => sharedDb}` 这种工厂里其实什么都没造 —— 于是被丢弃的那次清理断开了
 * 调用方的模块级单例，第二次挂载拿到的是一个已经断掉、且没有人会重连的库。
 *
 * 租约把判据从「这次 effect 结束了吗」换成「还有挂载持有它吗」，两个症状一并消失：
 * 单例不再被误断，真工厂也不再被调用两次（开发期少建一整套表）。
 */
interface RxDBLease<T extends RxDB> {
  /** 建立本租约的 source；换了 source 就得换租约。 */
  readonly source: RxDBSource<T>;
  /** source 的唯一一次解析。 */
  readonly resolved: Promise<T>;
  /** 当前是否有挂载持有它。 */
  held: boolean;
  /** 已经断开并移出存放处，不可再被接手；同一租约排了多次断开微任务时，后到的据此跳过。 */
  closed: boolean;
}

/**
 * 租约存放处：还没断开的租约，按 source 索引。每个 Provider 各持一份：两棵子树传同一个工厂时
 * 仍各建各的库，与改动前一致。
 *
 * @remarks
 * 不能只记最新的一个：source 换走又在断开微任务之前换回来（A → B → A 落在同一批提交里）时，
 * A 的租约还没断开、实例也还活着，接手它就行。只记最新一个就只能新开一个租约，旧租约随后照常
 * 断开，销毁的正是新租约将要交出的同一个实例。
 */
type RxDBLeaseSlot<T extends RxDB> = Map<RxDBSource<T>, RxDBLease<T>>;

const openLease = <T extends RxDB>(leases: RxDBLeaseSlot<T>, source: RxDBSource<T>): RxDBLease<T> => {
  const existing = leases.get(source);
  // 同一个 source 的租约还没关掉：接手它，不再解析第二次。
  if (existing !== undefined) {
    existing.held = true;
    return existing;
  }
  // 在打开的这一刻判：此后再登记这个 Promise 的只会是本租约自己的断开，而那时到货的实例
  // 本就该由本租约收掉，不能反过来拦住它。
  const reopened = isThenable(source) && releasedSources.has(source);
  const lease: RxDBLease<T> = {
    source,
    held: true,
    closed: false,
    // 工厂在 `then` 回调**里**求值，同步抛出因此也变成一次 reject，与 Promise source 走同一条路。
    // 在外面求值的话，异常会从调用它的 effect 里逃出去掀掉最近的 error boundary，
    // 而 `useRxDBOptional` 承诺的是 loading/error 态。Angular / Vue 侧同理。
    resolved: Promise.resolve().then(() => evaluateSource(source, reopened))
  };
  leases.set(source, lease);
  return lease;
};

const closeLease = <T extends RxDB>(leases: RxDBLeaseSlot<T>, lease: RxDBLease<T>): void => {
  lease.held = false;
  // 推迟一个微任务再决定：`StrictMode` 的「卸载 → 再挂载」落在同一批同步提交里，
  // 第二次挂载会赶在这之前把 `held` 置回 true。真正的卸载没有人来接，那时才断开。
  // `<Activity>` 隐藏同样走到这里，且重显可能远在这个微任务之后 —— 它与卸载在此刻无从区分。
  queueMicrotask(() => {
    if (lease.held || lease.closed) return;
    lease.closed = true;
    leases.delete(lease.source);
    // 从此刻起这个 Promise 只能解析出一个将被销毁的实例，在它到货之前就登记下来。
    if (isThenable(lease.source)) releasedSources.add(lease.source);
    // 还没解析完也照挂：实例到货时已经没有挂载在等它，仍旧该由本 provider 收掉。
    // 创建失败的那一路由 `failure` 槽位负责报告，这里只要别炸。
    void lease.resolved.then(shutdown, () => undefined);
  });
};

/**
 * 把 source 解析成槽位，并按所有权决定要不要在卸载时断开。
 *
 * @remarks
 * **所有权规则：provider 只销毁自己造的东西。** 传进来的是工厂或 Promise，实例就是本
 * Provider 造/等来的，卸载时负责 `destroy()`；传进来的是一个已就绪实例，它归调用方
 * 所有，本 Provider 不碰。
 *
 * 后半条不是洁癖，是 `StrictMode` 下的正确性：开发期的双挂载会跑一次「挂载 → 卸载 → 挂载」，
 * 若对调用方传进来的模块级单例执行断开，第二次挂载拿到的就是一个已经断掉、且没有人会重连的库。
 * 「传进来的是工厂」这一半同样会踩到它 —— `() => sharedDb` 从形状上看不出没造东西 ——
 * 因此解析与断开都走 {@link RxDBLease}，由「还有没有挂载持有」决定，而不是由某一次 effect 决定。
 *
 * 已就绪的实例走同步路径（首帧即可读），工厂与 Promise 走 effect —— 后者首帧读到 `undefined`，
 * 这正是 {@link useRxDBOptional} 要表达的 loading 态。
 */
const useResolvedRxDB = <T extends RxDB>(source: RxDBSource<T>): RxDBSlot<T> => {
  const pending = isDeferred(source);
  const ready = pending ? undefined : (source as T | undefined);
  const [resolution, setResolution] = useState<RxDBResolution<T>>(UNRESOLVED);
  const slot = useRef<RxDBLeaseSlot<T> | undefined>(undefined);

  useEffect(() => {
    if (!pending) return;

    const leases = (slot.current ??= new Map());
    const lease = openLease(leases, source);
    let disposed = false;

    void lease.resolved.then(
      database => {
        if (!disposed) setResolution({ source, db: database, failure: undefined });
      },
      failure => {
        if (!disposed) setResolution({ source, db: undefined, failure });
      }
    );

    // 复位不能省：`<Activity>` 隐藏再重显时 source 没换，身份判据挡不住旧结果，而它此时已被销毁。
    // 隐藏期间排下的这次更新会在重显那次渲染里一并处理，重显的首个提交因此是未解析（React 19.3
    // 实测：同步隐藏、默认优先级隐藏、隐藏提交后赶在被动 effect 之前同步重显，三种时序都如此）。
    return () => {
      disposed = true;
      setResolution(UNRESOLVED);
      closeLease(leases, lease);
    };
  }, [source, pending]);

  const current = resolution.source === source ? resolution : UNRESOLVED;
  return useMemo(() => ({ db: ready ?? current.db, failure: current.failure, pending }), [ready, current, pending]);
};

/**
 * 创建隔离的 RxDB React context 与访问 hook。
 *
 * @returns 共享同一个 context 的 Provider、`useRxDB`、`useRxDBOptional` 与 `useHasRxDBProvider`。
 */
export function makeRxDBProvider<T extends RxDB>(): RxDBProviderSet<T> {
  const context = createContext<RxDBSlot<T> | undefined>(undefined);

  const useOptionalDatabase = (db?: T): T | undefined => {
    const slot = useContext(context);
    return db ?? slot?.db;
  };

  // 槽位存在与否只回答「有没有 Provider」，不看 `db` / `failure` / `pending`。
  const useHasProvider = (): boolean => useContext(context) !== undefined;

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

  return {
    RxDBProvider: DatabaseProvider,
    useRxDB: useDatabase,
    useRxDBOptional: useOptionalDatabase,
    useHasRxDBProvider: useHasProvider
  };
}

const defaultProvider = makeRxDBProvider<RxDB>();

/** 默认 RxDB Provider；`db` 可以是实例、Promise 或工厂，见 {@link RxDBSource}。 */
export const RxDBProvider = defaultProvider.RxDBProvider;

/**
 * 读取显式传入的 RxDB，或最近的 {@link RxDBProvider}。
 *
 * @param db 可选的显式数据库；省略时读取最近的 Provider。
 * @throws 组件树中没有 Provider、Provider 没拿到 `db`、异步 source 尚未就绪时各抛一条
 *   不同的文案；异步 source 创建失败时原样抛出创建异常；Provider 断开（卸载或 `<Activity>`
 *   隐藏）过的 Promise source 被重新接通、或工厂交回已被销毁的实例时，抛出说明原因的错误
 *   （见 {@link RxDBSource}）。
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
 * 「没有 Provider」与「有 Provider 但尚未就绪」在这里都是 `undefined`，要区分时配合
 * {@link useHasRxDBProvider}。
 */
export const useRxDBOptional = defaultProvider.useRxDBOptional;

/**
 * 组件树中有没有最近的 {@link RxDBProvider}。
 *
 * @returns 有 Provider 时为 `true`，不论数据库是否就绪、异步 source 是否创建失败；没有时为 `false`
 *
 * @remarks
 * 与 {@link useRxDBOptional} 配合区分它的两种 `undefined`：「组件树里根本没有 Provider」
 * （本 hook 为 `false`，组件按独立形态运行，不该等数据库）与「有 Provider 但异步 source 还在解析
 * 或已失败」（本 hook 为 `true`，应渲染 loading 态并拦截依赖数据库的操作）。
 *
 * 只认同一套 context：{@link makeRxDBProvider} 创建的 Provider 不会让它为 `true`，
 * 那一套请用它自己返回的 `useHasRxDBProvider`。
 *
 * @example
 * ```tsx
 * const database = useRxDBOptional();
 * const hasProvider = useHasRxDBProvider();
 * if (hasProvider && !database) return <Loading />; // 有 Provider：等它就绪（或展示创建失败）
 * return <Form database={database} />; // 已就绪，或没有 Provider、按独立形态运行
 * ```
 */
export const useHasRxDBProvider = defaultProvider.useHasRxDBProvider;
