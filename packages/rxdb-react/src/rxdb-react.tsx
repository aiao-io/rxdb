import { RxDB } from '@aiao/rxdb';
import { createContext, useContext, type JSX, type ReactNode } from 'react';

/**
 * {@link RxDBProvider} 的 props。
 *
 * @remarks
 * RRE-008：`db` 是**必填**。早先声明为可选，`<RxDBProvider>` 因此能合法编译，
 * 而子树要到 `useRxDB()` 才运行时抛错，且错误文案提示「use RxDBProvider」——
 * 用户明明正用着 Provider，提示把人指向了错误的方向。
 *
 * 若将来要支持「异步就绪」，正确做法是显式提供 `useRxDBOptional(): T | undefined`
 * 并定义 loading 语义，而不是把 `db` 放宽为可选（当前没有任何 optional reader，
 * 放宽只会让非法用法通过编译）。
 */
export interface ProviderProps<T extends RxDB> {
  /** Provider 子树；未提供时渲染空节点。 */
  children?: ReactNode;
  /** 已创建并 `init()` 完成的 RxDB 实例。 */
  db: T;
}

/** RxDB Provider 组件类型。 */
export type RxDBProviderType<T extends RxDB> = (props: ProviderProps<T>) => JSX.Element;

/** 从显式参数或最近的 Provider 读取 RxDB 的 hook 类型。 */
export type UseRxDB<T extends RxDB> = (db?: T) => T;

/** 一组相互隔离的 RxDB Provider 与读取 hook。 */
export interface RxDBProviderSet<T extends RxDB> {
  /** 与 `useRxDB` 共享 context 的 Provider 组件。 */
  RxDBProvider: RxDBProviderType<T>;
  /** 读取显式传入或 context 中的数据库实例。 */
  useRxDB: UseRxDB<T>;
}

/**
 * 创建隔离的 RxDB React context 与访问 hook。
 *
 * @returns 共享同一个 context 的 Provider 与 `useRxDB`。
 */
export function makeRxDBProvider<T extends RxDB>(): RxDBProviderSet<T> {
  const context = createContext<T | undefined>(undefined);
  const useDatabase = (db?: T): T => {
    const contextDatabase = useContext(context);
    if (db !== undefined) return db;
    if (contextDatabase === undefined) {
      throw new Error('No RxDB instance found, use RxDBProvider to provide one');
    }
    return contextDatabase;
  };
  const DatabaseProvider = ({ children, db }: ProviderProps<T>): JSX.Element => (
    <context.Provider value={db}>{children}</context.Provider>
  );

  return { RxDBProvider: DatabaseProvider, useRxDB: useDatabase };
}

const defaultProvider = makeRxDBProvider<RxDB>();

/** 默认 RxDB Provider；`db` 必须是已经初始化完成的实例。 */
export const RxDBProvider = defaultProvider.RxDBProvider;

/**
 * 读取显式传入的 RxDB，或最近的 {@link RxDBProvider}。
 *
 * @param db 可选的显式数据库；省略时读取最近的 Provider。
 * @throws 没有显式实例且组件树中没有 Provider 时抛错。
 */
export const useRxDB = defaultProvider.useRxDB;
