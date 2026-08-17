import { RxDB } from '@aiao/rxdb';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { type PropsWithChildren } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as publicApi from '../index';
import { makeRxDBProvider, RxDBProvider, useRxDB, useRxDBOptional, type RxDBSource } from '../rxdb-react';

const contextDatabase = { name: 'context-database' } as unknown as RxDB;
const directDatabase = { name: 'direct-database' } as unknown as RxDB;

/** 带可观测 `disconnectAll` 的假库，用来断言所有权规则。 */
const makeFakeDatabase = (name: string) => {
  const disconnectAll = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  return { database: { name, disconnectAll } as unknown as RxDB, disconnectAll };
};

const wrap =
  (db: RxDBSource<RxDB>) =>
  ({ children }: PropsWithChildren) => <RxDBProvider db={db}>{children}</RxDBProvider>;

afterEach(cleanup);

describe('makeRxDBProvider', () => {
  it('returns the context database through a real provider', () => {
    const Provider = ({ children }: PropsWithChildren) => <RxDBProvider db={contextDatabase}>{children}</RxDBProvider>;
    const { result } = renderHook(() => useRxDB(), { wrapper: Provider });

    expect(result.current).toBe(contextDatabase);
  });

  it('prefers an explicitly supplied database', () => {
    const Provider = ({ children }: PropsWithChildren) => <RxDBProvider db={contextDatabase}>{children}</RxDBProvider>;
    const { result } = renderHook(() => useRxDB(directDatabase), { wrapper: Provider });

    expect(result.current).toBe(directDatabase);
  });

  it('throws when neither an argument nor provider value exists', () => {
    expect(() => renderHook(() => useRxDB())).toThrow('No RxDB instance found, use RxDBProvider to provide one');
  });

  // RRE-008：README 明确「RxDBProvider 必须接收已创建的数据库」，
  // 但 `db?: T` 让 `<RxDBProvider>` 合法编译，子树要到 `useRxDB()` 才运行时抛错，
  // 文案还反过来提示用户「use RxDBProvider」—— 而他们正用着 Provider。
  // 契约应由类型在编译期拒绝，而不是等运行时。
  it('rejects a provider without a database at compile time', () => {
    // @ts-expect-error db 是必填项：缺少它必须编译失败
    const WrapperWithoutDb = ({ children }: PropsWithChildren) => <RxDBProvider>{children}</RxDBProvider>;

    // 绕过类型检查后的运行时文案也不再把人指回 Provider —— 用户明明正用着它。
    expect(() => renderHook(() => useRxDB(), { wrapper: WrapperWithoutDb })).toThrow(
      'RxDBProvider received no database'
    );
  });

  it('creates isolated typed provider pairs', () => {
    const pair = makeRxDBProvider<RxDB>();
    const Provider = ({ children }: PropsWithChildren) => (
      <pair.RxDBProvider db={contextDatabase}>{children}</pair.RxDBProvider>
    );
    const { result } = renderHook(() => pair.useRxDB(), { wrapper: Provider });

    expect(result.current).toBe(contextDatabase);
  });
});

// 三框架统一异步契约：provider 收 `RxDB | Promise<RxDB> | (() => RxDB | Promise<RxDB>)`，
// 读取分 useRxDB（未就绪抛错）与 useRxDBOptional（未就绪返回 undefined）两条。
describe('异步 source', () => {
  it('exposes a ready instance synchronously on the first render', () => {
    const { result } = renderHook(() => useRxDBOptional(), { wrapper: wrap(contextDatabase) });

    expect(result.current).toBe(contextDatabase);
  });

  it('resolves a factory returning a promise', async () => {
    const { database } = makeFakeDatabase('async-factory');
    const { result } = renderHook(() => useRxDBOptional(), { wrapper: wrap(() => Promise.resolve(database)) });

    expect(result.current).toBeUndefined();
    await waitFor(() => expect(result.current).toBe(database));
  });

  it('resolves a bare promise', async () => {
    const { database } = makeFakeDatabase('async-promise');
    const { result } = renderHook(() => useRxDBOptional(), { wrapper: wrap(Promise.resolve(database)) });

    await waitFor(() => expect(result.current).toBe(database));
  });

  it('throws a resolving-specific message from useRxDB before the source settles', () => {
    const { database } = makeFakeDatabase('pending');

    expect(() => renderHook(() => useRxDB(), { wrapper: wrap(() => Promise.resolve(database)) })).toThrow(
      'RxDB is not ready yet'
    );
  });

  it('rethrows the original creation error from useRxDB', async () => {
    const failure = new Error('storage unavailable');
    // 创建异常原样抛出，不包一层 —— 与 Angular 侧 require() 同语义。
    const { result } = renderHook(
      () => {
        try {
          return { db: useRxDB(), error: undefined as unknown };
        } catch (error) {
          return { db: undefined, error };
        }
      },
      { wrapper: wrap(() => Promise.reject(failure)) }
    );

    await waitFor(() => expect(result.current.error).toBe(failure));
  });
});

// 所有权规则：provider 只销毁自己造的东西。后一条是 StrictMode 双挂载下的正确性要求 ——
// 断开调用方的模块级单例，第二次挂载拿到的就是一个断掉且无人重连的库。
describe('生命周期所有权', () => {
  it('disconnects a database it created itself', async () => {
    const { database, disconnectAll } = makeFakeDatabase('owned');
    const { result, unmount } = renderHook(() => useRxDBOptional(), { wrapper: wrap(() => database) });

    await waitFor(() => expect(result.current).toBe(database));
    unmount();

    expect(disconnectAll).toHaveBeenCalledTimes(1);
  });

  it('leaves a caller-supplied instance alone', () => {
    const { database, disconnectAll } = makeFakeDatabase('caller-owned');
    const { unmount } = renderHook(() => useRxDBOptional(), { wrapper: wrap(database) });

    unmount();

    expect(disconnectAll).not.toHaveBeenCalled();
  });

  it('disconnects a database that settles after unmount', async () => {
    const { database, disconnectAll } = makeFakeDatabase('late');
    let settle: (value: RxDB) => void = () => undefined;
    const pending = new Promise<RxDB>(resolve => (settle = resolve));
    const { unmount } = renderHook(() => useRxDBOptional(), { wrapper: wrap(() => pending) });

    unmount();
    settle(database);

    await waitFor(() => expect(disconnectAll).toHaveBeenCalledTimes(1));
  });
});

describe('named exports', () => {
  it('exports provider factories, hooks, and infinite scroll without claiming defaults', () => {
    expect(publicApi).toMatchObject({
      makeRxDBProvider,
      RxDBProvider,
      useRxDB,
      useRxDBOptional,
      useInfiniteScroll: expect.any(Function),
      useFind: expect.any(Function),
      useRepositoryQuery: expect.any(Function)
    });
    expect('default' in publicApi).toBe(false);
  });
});
