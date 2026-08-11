import { RxDB } from '@aiao/rxdb';
import { cleanup, renderHook } from '@testing-library/react';
import { type PropsWithChildren } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import * as publicApi from '../index';
import { makeRxDBProvider, RxDBProvider, useRxDB } from '../rxdb-react';

const contextDatabase = { name: 'context-database' } as unknown as RxDB;
const directDatabase = { name: 'direct-database' } as unknown as RxDB;

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

    expect(() => renderHook(() => useRxDB(), { wrapper: WrapperWithoutDb })).toThrow(
      'No RxDB instance found, use RxDBProvider to provide one'
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

describe('named exports', () => {
  it('exports provider factories, hooks, and infinite scroll without claiming defaults', () => {
    expect(publicApi).toMatchObject({
      makeRxDBProvider,
      RxDBProvider,
      useRxDB,
      useInfiniteScroll: expect.any(Function),
      useFind: expect.any(Function),
      useRepositoryQuery: expect.any(Function)
    });
    expect('default' in publicApi).toBe(false);
  });
});
