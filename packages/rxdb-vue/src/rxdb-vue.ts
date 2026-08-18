import { RxDB } from '@aiao/rxdb';
import { inject, isRef, onScopeDispose, provide, shallowRef, type InjectionKey, type Ref } from 'vue';

/**
 * `provideRxDB` 接受的数据库形态：实例、Promise，或返回二者之一的工厂。
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
 * Vue 侧在此之上还接受 `Ref`，见 {@link RxDBInput}。
 */
export type RxDBSource<T extends RxDB = RxDB> = T | Promise<T> | (() => T | Promise<T>);

/**
 * `provideRxDB` 接受的数据库形态（Vue 超集）。
 *
 * @remarks
 * 在三端共享的 {@link RxDBSource} 之外多收两种：
 *
 * - `Ref<T | undefined>` —— 调用方自己持有的响应式引用，由调用方决定何时填上。
 *   这是 Vue 独有的形态，也是它先于另外两端就支持异步就绪的原因。
 * - `undefined` —— 尚未就绪的占位。
 *
 * 这两种都归**调用方**所有，provider 不接管它们的生命周期，见 {@link provideRxDB}。
 */
export type RxDBInput<T extends RxDB> = RxDBSource<T> | Ref<T | undefined> | undefined;

/**
 * injector 返回的只读数据库引用；`undefined` 表示数据库尚未就绪。
 */
export type RxDBRef<T extends RxDB> = Readonly<Ref<T | undefined>>;

/**
 * {@link makeRxDBDependencyInjector} 产出的一组互相隔离的 provider / injector。
 */
export interface RxDBDependencyInjection<T extends RxDB> {
  /** 在当前组件上提供数据库，供其后代注入。 */
  provideRxDB: (db: RxDBInput<T>) => void;
  /** 注入当前已就绪的数据库实例；无 provider 或未就绪时返回 `undefined`。 */
  injectRxDB: () => T | undefined;
  /** 注入数据库的响应式引用；无 provider 时返回 `undefined`。 */
  injectRxDBRef: () => RxDBRef<T> | undefined;
}

/**
 * 注入的实际载荷：数据库引用 + 创建异常。
 *
 * @remarks
 * 异常单独占一格，是为了让 {@link useRxDB} 能像 Angular 的 `inject(RxDB)`、React 的
 * `useRxDB()` 那样把**原始创建异常**原样抛出，而不是笼统地报「还没就绪」。
 * 这个形状不出包，`injectRxDBRef()` 的返回类型因此保持不变。
 */
interface RxDBSlot<T extends RxDB> {
  readonly db: RxDBRef<T>;
  readonly failure: Ref<unknown>;
}

/** 组件树中没有 provider 时的文案。 */
const RXDB_NOT_FOUND_MESSAGE = 'RxDB instance not found. Make sure to call provideRxDB() in your app setup.';

/** 有 provider 但数据库尚未就绪时的文案。 */
const RXDB_NOT_READY_MESSAGE =
  'RxDB is not ready yet: the database passed to provideRxDB() has not resolved. ' +
  'Read it with useRxDBOptional() or injectRxDBRef() and render a loading state.';

/** 结构化的 thenable 判定；`await import()` 的返回值未必是原生 `Promise` 实例。 */
const isThenable = <T>(value: T | PromiseLike<T>): value is PromiseLike<T> =>
  typeof (value as PromiseLike<T> | undefined)?.then === 'function';

/**
 * source 需要异步解析吗？
 *
 * @remarks
 * 这个判定同时定义了所有权：**要解析的才是本 provider 造出来的**，也就只有它该被断开。
 */
const isDeferred = <T extends RxDB>(db: RxDBInput<T>): db is Promise<T> | (() => T | Promise<T>) =>
  typeof db === 'function' || isThenable(db);

const shutdown = (database: RxDB): void => {
  void database.disconnectAll().catch(error => console.error('RxDB shutdown failed', error));
};

/**
 * 建一个数据库引用。
 *
 * @remarks
 * 不走 `shallowRef(initial)` 的带参重载：它的返回类型是条件类型（`Ref extends T ? … : …`），
 * 在泛型 `T` 下无法求值，tsc 只能退回到两个分支的并集，其中一支是按约束实例化的
 * `ShallowRef<RxDB>` —— 与 `Ref<T | undefined>` 不兼容。无参重载
 * `shallowRef<T>(): ShallowRef<T | undefined>` 没有条件类型，先建后填即可。
 */
const createDatabaseRef = <T extends RxDB>(initial: T | undefined): Ref<T | undefined> => {
  const database = shallowRef<T>();
  database.value = initial;
  return database;
};

/**
 * 把入参解析成注入载荷，并按所有权决定要不要在作用域销毁时断开。
 *
 * @remarks
 * **所有权规则：provider 只销毁自己造的东西。** 传进来的是工厂或 Promise，实例就是本
 * provider 造/等来的，作用域销毁时负责 `disconnectAll()`；传进来的是已就绪实例或调用方
 * 自己的 `Ref`，它归调用方所有，本 provider 不碰 —— 否则一个模块级单例会被某个子组件的
 * 卸载顺手断掉，而没有人会去重连。这条规则三端逐字相同。
 */
const createSlot = <T extends RxDB>(db: RxDBInput<T>): RxDBSlot<T> => {
  const failure = shallowRef<unknown>(undefined);

  if (isRef(db)) return { db, failure };
  if (!isDeferred(db)) return { db: createDatabaseRef<T>(db), failure };

  const databaseRef = createDatabaseRef<T>(undefined);
  let disposed = false;
  let owned: T | undefined;

  void Promise.resolve(typeof db === 'function' ? db() : db).then(
    database => {
      owned = database;
      // 作用域已销毁才 resolve：实例仍然是本 provider 造的，仍要负责断开。
      if (disposed) shutdown(database);
      else databaseRef.value = database;
    },
    error => (failure.value = error)
  );

  // provideRxDB 在 setup 里调用，作用域必定存在；failSilently 只是为了在无作用域环境
  // （比如直接在测试里调用）复用时不发多余警告。
  onScopeDispose(() => {
    disposed = true;
    if (owned !== undefined) shutdown(owned);
  }, true);

  return { db: databaseRef, failure };
};

/** 内部注入器：比公开的 {@link RxDBDependencyInjection} 多两个读 slot 的入口。 */
interface InternalInjection<T extends RxDB> extends RxDBDependencyInjection<T> {
  /** 读注入载荷；缺 provider 时 Vue 在 dev 下告警。 */
  readonly injectSlot: () => RxDBSlot<T> | undefined;
  /** 读注入载荷；缺 provider 时不告警，供 `useRxDBOptional` 使用。 */
  readonly injectSlotQuietly: () => RxDBSlot<T> | undefined;
}

const createInjection = <T extends RxDB>(): InternalInjection<T> => {
  const RxDBKey: InjectionKey<RxDBSlot<T>> = Symbol('RxDBProvider');

  const provideRxDB = (db: RxDBInput<T>): void => provide(RxDBKey, createSlot(db));

  // 不传默认值：缺 provider 时 Vue 会在 dev 下发出 injection 未找到的警告
  const injectSlot = (): RxDBSlot<T> | undefined => inject(RxDBKey);
  // 传默认值：可选读取本就允许缺 provider，不该顺带告警
  const injectSlotQuietly = (): RxDBSlot<T> | undefined => inject(RxDBKey, undefined);
  const injectRxDBRef = (): RxDBRef<T> | undefined => injectSlot()?.db;
  const injectRxDB = (): T | undefined => injectRxDBRef()?.value;

  return { provideRxDB, injectRxDB, injectRxDBRef, injectSlot, injectSlotQuietly };
};

/**
 * 创建一组类型安全的 RxDB Vue 依赖注入函数。
 *
 * @returns RxDB provider 与同步、响应式 injector。
 *
 * @remarks
 * 每次调用生成独立的注入 key，因此多次调用得到的是**互相隔离**的 provider/injector
 * （与 React 的 `makeRxDBProvider` 每次新建 context 对齐）。key 若提到模块顶层，
 * 两套注入器会读写同一个 Symbol，后 provide 的数据库覆盖前者，而泛型 `T` 只是虚假的
 * 编译期断言 —— 拿到的可能是另一套注入的数据库。
 */
function makeRxDBDependencyInjector<T extends RxDB>(): RxDBDependencyInjection<T> {
  const { provideRxDB, injectRxDB, injectRxDBRef } = createInjection<T>();
  return { provideRxDB, injectRxDB, injectRxDBRef };
}

/**
 * 包级默认注入器。
 *
 * @remarks
 * 绝大多数应用只有一个数据库，直接用这几个导出即可 ——
 * 它们共享同一个模块级注入 key，`provideRxDB` 与 `injectRxDB*` 天然配对。
 *
 * - `provideRxDB(db)`：在当前组件的 setup 中提供数据库，作用域是该组件的整棵子树。
 * - `injectRxDB()`：取当前已就绪的实例，无 provider 或数据库未就绪时返回 `undefined`。
 * - `injectRxDBRef()`：取响应式引用，用于等待异步就绪；无 provider 时返回 `undefined`
 *   （dev 下 Vue 会额外发出 injection 未找到的警告）。
 *
 * 需要在同一棵组件树里隔离多个数据库时，改用 {@link makeRxDBDependencyInjector}。
 * 需要「没有就抛错」而非返回 `undefined` 的语义时，用 {@link useRxDB} / {@link useRxDBRef}。
 */
const { injectRxDB, injectRxDBRef, injectSlot, injectSlotQuietly, provideRxDB } = createInjection<RxDB>();

/**
 * 获取已提供的 RxDB 响应式引用。
 *
 * @returns 当前 provider 中的只读引用，允许数据库异步就绪。
 * @throws 未找到 RxDB provider 时抛出错误。
 */
const useRxDBRef = (): RxDBRef<RxDB> => {
  const databaseRef = injectRxDBRef();
  if (!databaseRef) {
    throw new Error(RXDB_NOT_FOUND_MESSAGE);
  }
  return databaseRef;
};

/**
 * 获取当前已就绪的 RxDB 实例。
 *
 * @returns 当前 RxDB 实例。
 * @throws 没有 provider、数据库尚未就绪时各抛一条不同的文案；异步 source 创建失败时
 *   原样抛出创建异常（与 Angular / React 同语义）。
 */
const useRxDB = (): RxDB => {
  const slot = injectSlot();
  if (!slot) {
    throw new Error(RXDB_NOT_FOUND_MESSAGE);
  }
  if (slot.failure.value !== undefined) {
    throw slot.failure.value;
  }
  if (!slot.db.value) {
    throw new Error(RXDB_NOT_READY_MESSAGE);
  }
  return slot.db.value;
};

/**
 * 获取当前已就绪的 RxDB 实例，取不到时返回 `undefined`。
 *
 * @returns 已就绪的实例；没有 provider 或数据库尚未就绪时为 `undefined`
 *
 * @remarks
 * 与 {@link useRxDB} 的区别只有「没有时怎么办」：这个不抛错，用于异步 source 下渲染 loading 态。
 * 语义与 {@link injectRxDB} 相同，区别只有缺 provider 时**不发** Vue 的 injection 告警 ——
 * 可选读取本就允许没有 provider。名字与 Angular / React 的 `useRxDBOptional` 对齐。
 */
const useRxDBOptional = (): RxDB | undefined => injectSlotQuietly()?.db.value;

export { injectRxDB, injectRxDBRef, makeRxDBDependencyInjector, provideRxDB, useRxDB, useRxDBOptional, useRxDBRef };
