import { RxDB } from '@aiao/rxdb';
import { inject, isRef, provide, shallowRef, type InjectionKey, type Ref } from 'vue';

/**
 * `provideRxDB` 接受的数据库形态。
 *
 * @remarks
 * 允许传 `undefined` 或一个尚未 resolve 的 `Ref`：数据库常常是异步打开的，
 * 组件树需要先挂载、等 ref 填上再发查询。
 */
export type RxDBInput<T extends RxDB> = Ref<T | undefined> | T | undefined;

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

const RXDB_NOT_FOUND_MESSAGE = 'RxDB instance not found. Make sure to call provideRxDB() in your app setup.';

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
  const RxDBKey: InjectionKey<RxDBRef<T>> = Symbol('RxDBProvider');

  const provideRxDB = (db: RxDBInput<T>): void => {
    const databaseRef: RxDBRef<T> = isRef(db) ? db : shallowRef<T | undefined>(db);
    provide(RxDBKey, databaseRef);
  };

  // 不传默认值：缺 provider 时 Vue 会在 dev 下发出 injection 未找到的警告
  const injectRxDBRef = (): RxDBRef<T> | undefined => inject(RxDBKey);
  const injectRxDB = (): T | undefined => injectRxDBRef()?.value;

  return {
    provideRxDB,
    injectRxDB,
    injectRxDBRef
  };
}

/**
 * 包级默认注入器。
 *
 * @remarks
 * 绝大多数应用只有一个数据库，直接用这三个导出即可 ——
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
const { injectRxDB, injectRxDBRef, provideRxDB } = makeRxDBDependencyInjector<RxDB>();

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
 * @throws 未提供 RxDB 或数据库尚未就绪时抛出错误。
 */
const useRxDB = (): RxDB => {
  const db = useRxDBRef().value;
  if (!db) {
    throw new Error(RXDB_NOT_FOUND_MESSAGE);
  }
  return db;
};

export { injectRxDB, injectRxDBRef, makeRxDBDependencyInjector, provideRxDB, useRxDB, useRxDBRef };
