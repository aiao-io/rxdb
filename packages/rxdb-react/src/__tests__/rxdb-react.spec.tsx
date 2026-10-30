import { RxDB } from '@aiao/rxdb';
import { act, cleanup, configure, render, renderHook, waitFor } from '@testing-library/react';
import { Activity, useLayoutEffect, type PropsWithChildren } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as publicApi from '../index';
import {
  makeRxDBProvider,
  RxDBProvider,
  useHasRxDBProvider,
  useRxDB,
  useRxDBOptional,
  type RxDBSource
} from '../rxdb-react';

const contextDatabase = { name: 'context-database' } as unknown as RxDB;
const directDatabase = { name: 'direct-database' } as unknown as RxDB;

/** 带可观测 `destroy` 的假库，用来断言所有权规则。 */
const makeFakeDatabase = (name: string) => {
  const destroy = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  return { database: { name, destroy } as unknown as RxDB, destroy };
};

/** 由测试决定 settle 时机的 promise。 */
const deferred = <T,>() => {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>(settle => (resolve = settle));
  return { promise, resolve };
};

/** 让已排队的微任务与一轮宏任务全部跑完（租约断开推迟一个微任务，解析链也要几拍）。 */
const drain = () => act(() => new Promise<void>(resolve => setTimeout(resolve, 0)));

/** `useRxDB()` 的结果，或它抛出的异常。 */
const useRxDBOutcome = (): unknown => {
  try {
    return useRxDB();
  } catch (error) {
    return error;
  }
};

/**
 * 每次提交都在 **layout effect** 里记一笔 Provider 交出的东西。
 *
 * @remarks
 * 只等被动 effect 跑完再检查会漏掉首帧：子树的 layout effect 已经能拿着那一帧的库去订阅、去写。
 */
function LayoutProbe({ record }: { record: (outcome: unknown) => void }) {
  const outcome = useRxDBOutcome();
  useLayoutEffect(() => {
    record(outcome);
  });
  return null;
}

const messageOf = (outcome: unknown): string | undefined => (outcome instanceof Error ? outcome.message : undefined);

const wrap =
  (db: RxDBSource<RxDB>) =>
  ({ children }: PropsWithChildren) => <RxDBProvider db={db}>{children}</RxDBProvider>;

/**
 * 打开 RTL 的根级 `StrictMode`。
 *
 * @remarks
 * 不能改用 `{ wrapper: StrictMode }`：那样只会双调用 **render**，effect 一次都不会重来。
 * strict-effects（挂载 → 卸载 → 再挂载）要求 `StrictMode` 位于 `createRoot` 的**根**上，
 * 而 `wrapper` 渲染在根的里面。`reactStrictMode` 这个开关正是把它套到根上的那一层。
 * 实测：`wrapper` 版拿到 `['mount']`，本开关拿到 `['mount','cleanup','mount']`。
 */
const useRootStrictMode = (): void => {
  beforeEach(() => configure({ reactStrictMode: true }));
  afterEach(() => configure({ reactStrictMode: false }));
};

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

  // 同步抛出的工厂走的必须是同一条路径。不接住的话异常从 effect 里逃出去，掀掉最近的
  // error boundary —— 而 `useRxDBOptional` 承诺的是 loading/error 态。三端逐字对齐。
  it('routes a synchronously thrown factory error to the same failure slot', async () => {
    const failure = new Error('storage unavailable');
    const { result } = renderHook(
      () => {
        try {
          return { db: useRxDB(), error: undefined as unknown };
        } catch (error) {
          return { db: undefined, error };
        }
      },
      {
        wrapper: wrap(() => {
          throw failure;
        })
      }
    );

    await waitFor(() => expect(result.current.error).toBe(failure));
  });
});

// useRxDBOptional 在「没有 Provider」与「有 Provider 但还没就绪」时都是 undefined；组件要在
// 「独立使用、直接透传」与「等数据库就绪」之间分路，只能再问一句 Provider 在不在 —— 与库的状态无关。
describe('useHasRxDBProvider', () => {
  /** 同一次渲染里读两样：Provider 在不在、库就绪没有。 */
  const useProbe = () => ({ hasProvider: useHasRxDBProvider(), database: useRxDBOptional() });

  it('没有 Provider 时为 false', () => {
    const { result } = renderHook(useProbe);

    expect(result.current).toEqual({ hasProvider: false, database: undefined });
  });

  it('已就绪实例：true', () => {
    const { result } = renderHook(useProbe, { wrapper: wrap(contextDatabase) });

    expect(result.current).toEqual({ hasProvider: true, database: contextDatabase });
  });

  it('未决 Promise：库还没到也为 true', () => {
    const { result } = renderHook(useProbe, { wrapper: wrap(deferred<RxDB>().promise) });

    expect(result.current).toEqual({ hasProvider: true, database: undefined });
  });

  it('工厂：解析前后都为 true', async () => {
    const { database } = makeFakeDatabase('factory');
    const { result } = renderHook(useProbe, { wrapper: wrap(() => Promise.resolve(database)) });

    expect(result.current).toEqual({ hasProvider: true, database: undefined });
    await waitFor(() => expect(result.current).toEqual({ hasProvider: true, database }));
  });

  it('创建失败：仍为 true', async () => {
    const failure = new Error('storage unavailable');
    const { result } = renderHook(() => ({ hasProvider: useHasRxDBProvider(), outcome: useRxDBOutcome() }), {
      wrapper: wrap(() => Promise.reject(failure))
    });

    await waitFor(() => expect(result.current.outcome).toBe(failure));
    expect(result.current.hasProvider).toBe(true);
  });

  it('makeRxDBProvider 的各套互相隔离：只认同一套 context 里的 Provider', () => {
    const first = makeRxDBProvider<RxDB>();
    const second = makeRxDBProvider<RxDB>();
    const useEverySet = () => [first.useHasRxDBProvider(), second.useHasRxDBProvider(), useHasRxDBProvider()];
    const FirstProvider = ({ children }: PropsWithChildren) => (
      <first.RxDBProvider db={contextDatabase}>{children}</first.RxDBProvider>
    );

    expect(renderHook(useEverySet, { wrapper: FirstProvider }).result.current).toEqual([true, false, false]);
    expect(renderHook(useEverySet, { wrapper: wrap(contextDatabase) }).result.current).toEqual([false, false, true]);
  });
});

// 所有权规则：provider 只销毁自己造的东西。后一条是 StrictMode 双挂载下的正确性要求 ——
// 断开调用方的模块级单例，第二次挂载拿到的就是一个断掉且无人重连的库。
describe('生命周期所有权', () => {
  // 断开在卸载后**推迟一个微任务**才发生，因此这里必须 await：卸载与重新挂载在
  // `StrictMode` 下是同一批同步提交，只有等过那一拍才知道还有没有人来接手（见 `closeLease`）。
  it('disconnects a database it created itself', async () => {
    const { database, destroy } = makeFakeDatabase('owned');
    const { result, unmount } = renderHook(() => useRxDBOptional(), { wrapper: wrap(() => database) });

    await waitFor(() => expect(result.current).toBe(database));
    unmount();

    await waitFor(() => expect(destroy).toHaveBeenCalledTimes(1));
  });

  it('leaves a caller-supplied instance alone', () => {
    const { database, destroy } = makeFakeDatabase('caller-owned');
    const { unmount } = renderHook(() => useRxDBOptional(), { wrapper: wrap(database) });

    unmount();

    expect(destroy).not.toHaveBeenCalled();
  });

  it('disconnects a database that settles after unmount', async () => {
    const { database, destroy } = makeFakeDatabase('late');
    let settle: (value: RxDB) => void = () => undefined;
    const pending = new Promise<RxDB>(resolve => (settle = resolve));
    const { unmount } = renderHook(() => useRxDBOptional(), { wrapper: wrap(() => pending) });

    unmount();
    settle(database);

    await waitFor(() => expect(destroy).toHaveBeenCalledTimes(1));
  });
});

/**
 * `StrictMode` 的「挂载 → 卸载 → 再挂载」会把第一次 effect 生命周期整个丢弃。
 *
 * @remarks
 * `db={() => sharedDb}`（模块级单例 + 稳定引用）是最自然的写法之一，可按 source 的**形状**
 * 判所有权时，工厂里到底造没造东西是看不出来的：被丢弃的那次生命周期照样执行断开，
 * 第二次挂载于是拿到一个已经断掉、且没有人会重连的库。这正是「生命周期所有权」顶上那条
 * 注释要防的事，只是它当时只覆盖了「直接传实例」那一半。
 */
describe('StrictMode 双挂载', () => {
  useRootStrictMode();

  it('keeps the instance alive across the remount', async () => {
    const { database, destroy } = makeFakeDatabase('shared');
    const { result } = renderHook(() => useRxDBOptional(), { wrapper: wrap(() => database) });

    await waitFor(() => expect(result.current).toBe(database));

    expect(destroy).not.toHaveBeenCalled();
  });

  // 被丢弃的那次生命周期也不该留下第二个实例：工厂真造库时双挂载会建两次库（连带建表、
  // 迁移、打开文件），其中一个随即被断开 —— 开发期凭空多跑一整轮副作用。
  it('resolves the source once across the remount', async () => {
    const { database } = makeFakeDatabase('once');
    const source = vi.fn(() => database);
    const { result } = renderHook(() => useRxDBOptional(), { wrapper: wrap(source) });

    await waitFor(() => expect(result.current).toBe(database));

    expect(source).toHaveBeenCalledTimes(1);
  });

  // 双挂载不改变所有权：真正卸载时，工厂造出来的库仍然由 provider 负责断开。
  it('still disconnects what it created once the tree really unmounts', async () => {
    const { database, destroy } = makeFakeDatabase('strict-owned');
    const { result, unmount } = renderHook(() => useRxDBOptional(), { wrapper: wrap(() => database) });

    await waitFor(() => expect(result.current).toBe(database));
    unmount();

    await waitFor(() => expect(destroy).toHaveBeenCalledTimes(1));
  });
});

/**
 * 同一个 Provider 换 source：从新 source 的**首个提交**起，交出的只能是属于它的结果。
 *
 * @remarks
 * 旧 source 的结果要等它的被动 effect 清理才复位，而新 props 的提交与子树 layout effect
 * 都早于那一步 —— 首帧拿到旧库，订阅就先落在错误的实例上。
 */
describe('切换 source 的首个提交', () => {
  const tree = (db: RxDBSource<RxDB>, record: (outcome: unknown) => void) => (
    <RxDBProvider db={db}>
      <LayoutProbe record={record} />
    </RxDBProvider>
  );

  it('A 已解析 → B 挂起：首个提交即为未就绪，不再交出 A', async () => {
    const a = makeFakeDatabase('A');
    const sourceA = Promise.resolve(a.database);
    const sourceB = deferred<RxDB>().promise;
    const record = vi.fn();
    const view = render(tree(sourceA, record));
    await waitFor(() => expect(record).toHaveBeenLastCalledWith(a.database));
    record.mockClear();

    view.rerender(tree(sourceB, record));

    expect(record.mock.calls.map(([outcome]) => messageOf(outcome))).toEqual([
      expect.stringContaining('RxDB is not ready yet')
    ]);
  });

  it('A 失败 → 同步 B：首个提交即为 B，不再抛 A 的创建异常', async () => {
    const failure = new Error('storage unavailable');
    const b = makeFakeDatabase('B');
    const record = vi.fn();
    const view = render(tree(() => Promise.reject(failure), record));
    await waitFor(() => expect(record).toHaveBeenLastCalledWith(failure));
    record.mockClear();

    view.rerender(tree(b.database, record));

    expect(record.mock.calls).toEqual([[b.database]]);
  });

  it('A/B 反序解析：B 先到、A 后到，A 的结果永不出现', async () => {
    const a = makeFakeDatabase('A');
    const b = makeFakeDatabase('B');
    const sourceA = deferred<RxDB>();
    const sourceB = deferred<RxDB>();
    const record = vi.fn();
    const view = render(tree(sourceA.promise, record));
    view.rerender(tree(sourceB.promise, record));

    sourceB.resolve(b.database);
    await waitFor(() => expect(record).toHaveBeenLastCalledWith(b.database));
    sourceA.resolve(a.database);
    await drain();

    expect(record).not.toHaveBeenCalledWith(a.database);
    expect(record).toHaveBeenLastCalledWith(b.database);
    await waitFor(() => expect(a.destroy).toHaveBeenCalledTimes(1));
  });

  // A 的解析结果与换 source 落在同一批更新里：旧 effect 还没清理，它的结果照常写进状态，
  // 与新 source 在同一次渲染里相遇。只有结果带着 source 身份，渲染才认得出它不属于 B。
  it('A 的迟到结果与换成 B 同批提交：B 的首个提交仍为未就绪', async () => {
    const a = makeFakeDatabase('A');
    const sourceA = deferred<RxDB>();
    const sourceB = deferred<RxDB>().promise;
    const record = vi.fn();
    const view = render(tree(sourceA.promise, record));
    record.mockClear();

    await act(async () => {
      sourceA.resolve(a.database);
      await new Promise(resolve => setTimeout(resolve, 0));
      view.rerender(tree(sourceB, record));
    });

    expect(record).not.toHaveBeenCalledWith(a.database);
    expect(messageOf(record.mock.calls[0]?.[0])).toContain('RxDB is not ready yet');
  });

  it('换走后再换回同一个 Promise：它的实例已随断开销毁，报明确错误而不交出它', async () => {
    const a = makeFakeDatabase('A');
    const sourceA = Promise.resolve(a.database);
    const record = vi.fn();
    const view = render(tree(sourceA, record));
    await waitFor(() => expect(record).toHaveBeenLastCalledWith(a.database));

    view.rerender(tree(deferred<RxDB>().promise, record));
    await waitFor(() => expect(a.destroy).toHaveBeenCalledTimes(1));
    record.mockClear();
    view.rerender(tree(sourceA, record));
    await drain();

    expect(record).not.toHaveBeenCalledWith(a.database);
    expect(messageOf(record.mock.lastCall?.[0])).toContain('cannot reopen a Promise source');
  });

  it('A → B → A 落在断开微任务之前：接手 A 的租约，沿用同一个实例且不销毁', async () => {
    const a = makeFakeDatabase('A');
    const sourceA = Promise.resolve(a.database);
    const record = vi.fn();
    const view = render(tree(sourceA, record));
    await waitFor(() => expect(record).toHaveBeenLastCalledWith(a.database));

    view.rerender(tree(deferred<RxDB>().promise, record));
    view.rerender(tree(sourceA, record));
    await drain();

    expect(a.destroy).not.toHaveBeenCalled();
    expect(record).toHaveBeenLastCalledWith(a.database);
  });

  it('同步实例 → 工厂：首个提交即为未就绪，不再交出旧实例', () => {
    const x = makeFakeDatabase('X');
    const record = vi.fn();
    const view = render(tree(x.database, record));
    record.mockClear();

    view.rerender(tree(() => deferred<RxDB>().promise, record));

    expect(record.mock.calls.map(([outcome]) => messageOf(outcome))).toEqual([
      expect.stringContaining('RxDB is not ready yet')
    ]);
  });
});

/**
 * `<Activity>` 隐藏会执行 effect 清理、重显时重新接通，组件状态保留 —— 与真正卸载在清理那一刻
 * 无从区分，Provider 只能照所有权规则断开（销毁）自己持有的实例。
 *
 * @remarks
 * 工厂可以重新求值，重显时建一个新库；Promise 不能，它只会再解析出那个已销毁的实例。
 * 无论哪种，已销毁的实例都不能被当作就绪库交给消费者。
 */
describe('<Activity> 隐藏再显示', () => {
  type ActivityMode = 'hidden' | 'visible';
  const tree = (db: RxDBSource<RxDB>, mode: ActivityMode, record: (outcome: unknown) => void) => (
    <Activity mode={mode}>
      <RxDBProvider db={db}>
        <LayoutProbe record={record} />
      </RxDBProvider>
    </Activity>
  );
  const RELEASED_PROMISE = 'cannot reopen a Promise source';

  it('稳定 Promise 已解析：隐藏时销毁，重显报明确错误而不交出已销毁实例', async () => {
    const { database, destroy } = makeFakeDatabase('owned');
    const source = Promise.resolve(database);
    const record = vi.fn();
    const view = render(tree(source, 'visible', record));
    await waitFor(() => expect(record).toHaveBeenLastCalledWith(database));

    view.rerender(tree(source, 'hidden', record));
    await waitFor(() => expect(destroy).toHaveBeenCalledTimes(1));
    record.mockClear();
    view.rerender(tree(source, 'visible', record));
    await drain();

    expect(record).not.toHaveBeenCalledWith(database);
    expect(messageOf(record.mock.lastCall?.[0])).toContain(RELEASED_PROMISE);

    view.rerender(tree(source, 'hidden', record));
    await drain();
    view.rerender(tree(source, 'visible', record));
    await drain();

    expect(record).not.toHaveBeenCalledWith(database);
    expect(messageOf(record.mock.lastCall?.[0])).toContain(RELEASED_PROMISE);
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  // act 会把隐藏期间排下的更新在同一个 act 里渲染掉，造不出「实例已销毁、复位还没渲染」就重显的
  // 时序；这里绕开 act 直接驱动 root：同步隐藏（被动 effect 随提交同步执行）→ 只让微任务跑完
  // （租约断开、实例销毁，低优先级的隐藏子树渲染还排在宏任务里）→ 同步重显。
  it('实例已销毁、隐藏期间的复位尚未渲染就重显：首个提交仍不交出已销毁实例', async () => {
    const { database, destroy } = makeFakeDatabase('owned');
    const source = Promise.resolve(database);
    const record = vi.fn();
    const container = document.body.appendChild(document.createElement('div'));
    const actEnvironment = Reflect.get(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
    Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', false);
    const root = createRoot(container);
    try {
      flushSync(() => root.render(tree(source, 'visible', record)));
      await waitFor(() => expect(record).toHaveBeenLastCalledWith(database));

      flushSync(() => root.render(tree(source, 'hidden', record)));
      for (let tick = 0; tick < 5; tick += 1) await Promise.resolve();
      expect(destroy).toHaveBeenCalledTimes(1);
      record.mockClear();
      flushSync(() => root.render(tree(source, 'visible', record)));

      expect(messageOf(record.mock.calls[0]?.[0])).toContain('RxDB is not ready yet');
      await waitFor(() => expect(messageOf(record.mock.lastCall?.[0])).toContain(RELEASED_PROMISE));
      expect(record).not.toHaveBeenCalledWith(database);
    } finally {
      flushSync(() => root.unmount());
      container.remove();
      Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', actEnvironment);
    }
  });

  it('稳定 Promise 未解析时隐藏：到货即销毁，重显后也不交出它', async () => {
    const { database, destroy } = makeFakeDatabase('late');
    const source = deferred<RxDB>();
    const record = vi.fn();
    const view = render(tree(source.promise, 'visible', record));

    view.rerender(tree(source.promise, 'hidden', record));
    await drain();
    view.rerender(tree(source.promise, 'visible', record));
    source.resolve(database);
    await drain();

    expect(destroy).toHaveBeenCalledTimes(1);
    expect(record).not.toHaveBeenCalledWith(database);
    expect(messageOf(record.mock.lastCall?.[0])).toContain(RELEASED_PROMISE);
  });

  it('失败的稳定 Promise：重显照旧报它自己的创建异常（没有实例被销毁）', async () => {
    const failure = new Error('storage unavailable');
    const source = Promise.reject(failure);
    source.catch(() => undefined);
    const record = vi.fn();
    const view = render(tree(source, 'visible', record));
    await waitFor(() => expect(record).toHaveBeenLastCalledWith(failure));

    view.rerender(tree(source, 'hidden', record));
    await drain();
    record.mockClear();
    view.rerender(tree(source, 'visible', record));
    await drain();

    expect(record).toHaveBeenLastCalledWith(failure);
  });

  it('稳定 Promise：隐藏后在清理微任务之前重显，沿用同一个实例', async () => {
    const { database, destroy } = makeFakeDatabase('quick');
    const source = Promise.resolve(database);
    const record = vi.fn();
    const view = render(tree(source, 'visible', record));
    await waitFor(() => expect(record).toHaveBeenLastCalledWith(database));

    view.rerender(tree(source, 'hidden', record));
    view.rerender(tree(source, 'visible', record));
    await drain();

    expect(destroy).not.toHaveBeenCalled();
    expect(record).toHaveBeenLastCalledWith(database);
  });

  it('稳定 Promise：真正卸载仍回收解析出的实例', async () => {
    const { database, destroy } = makeFakeDatabase('unmounted');
    const source = Promise.resolve(database);
    const record = vi.fn();
    const view = render(tree(source, 'visible', record));
    await waitFor(() => expect(record).toHaveBeenLastCalledWith(database));

    view.unmount();

    await waitFor(() => expect(destroy).toHaveBeenCalledTimes(1));
  });

  it('对照 · 直接实例：归调用方所有，隐藏不销毁，重显交出同一个实例', async () => {
    const { database, destroy } = makeFakeDatabase('caller-owned');
    const record = vi.fn();
    const view = render(tree(database, 'visible', record));

    view.rerender(tree(database, 'hidden', record));
    await drain();
    record.mockClear();
    view.rerender(tree(database, 'visible', record));
    await drain();

    expect(destroy).not.toHaveBeenCalled();
    expect(record.mock.calls).toEqual([[database]]);
  });

  it('对照 · 每次新建库的工厂：隐藏销毁旧库，重显重新求值交出新库，卸载回收新库', async () => {
    const first = makeFakeDatabase('first');
    const second = makeFakeDatabase('second');
    const source = vi.fn<() => RxDB>().mockReturnValueOnce(first.database).mockReturnValueOnce(second.database);
    const record = vi.fn();
    const view = render(tree(source, 'visible', record));
    await waitFor(() => expect(record).toHaveBeenLastCalledWith(first.database));

    view.rerender(tree(source, 'hidden', record));
    await waitFor(() => expect(first.destroy).toHaveBeenCalledTimes(1));
    record.mockClear();
    view.rerender(tree(source, 'visible', record));
    await waitFor(() => expect(record).toHaveBeenLastCalledWith(second.database));

    expect(record).not.toHaveBeenCalledWith(first.database);
    expect(source).toHaveBeenCalledTimes(2);
    view.unmount();
    await waitFor(() => expect(second.destroy).toHaveBeenCalledTimes(1));
  });

  it('工厂返回已被销毁的共享实例：重显报明确错误而不交出它', async () => {
    const { database, destroy } = makeFakeDatabase('shared');
    const source = () => database;
    const record = vi.fn();
    const view = render(tree(source, 'visible', record));
    await waitFor(() => expect(record).toHaveBeenLastCalledWith(database));

    view.rerender(tree(source, 'hidden', record));
    await waitFor(() => expect(destroy).toHaveBeenCalledTimes(1));
    record.mockClear();
    view.rerender(tree(source, 'visible', record));
    await drain();

    expect(record).not.toHaveBeenCalledWith(database);
    expect(messageOf(record.mock.lastCall?.[0])).toContain('already destroyed');
    expect(destroy).toHaveBeenCalledTimes(1);
  });
});

describe('named exports', () => {
  it('exports provider factories, hooks, and infinite scroll without claiming defaults', () => {
    expect(publicApi).toMatchObject({
      makeRxDBProvider,
      RxDBProvider,
      useRxDB,
      useRxDBOptional,
      useHasRxDBProvider,
      useInfiniteScroll: expect.any(Function),
      useFind: expect.any(Function),
      useRepositoryQuery: expect.any(Function)
    });
    expect('default' in publicApi).toBe(false);
  });
});
