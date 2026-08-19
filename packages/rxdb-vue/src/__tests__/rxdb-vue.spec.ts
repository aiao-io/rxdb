import { RxDB } from '@aiao/rxdb';
import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick, shallowRef } from 'vue';
import * as PublicApi from '../index';
import * as RxDBVue from '../rxdb-vue';
import { createRxDBProviderHarness } from './rxdb-provider-harness';
import { createSetupHarness } from './setup-harness';

const createRxDB = (name: string): RxDB => ({ name }) as unknown as RxDB;

/** 带可观测 `disconnectAll` 的假库，用来断言所有权规则。 */
const createOwnableRxDB = (name: string) => {
  const disconnectAll = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  return { database: { name, disconnectAll } as unknown as RxDB, disconnectAll };
};

const mountWithProvider = <T>(source: RxDBVue.RxDBInput<RxDB>, consume: () => T) => {
  let result: { value: T } | undefined;

  const Consumer = createSetupHarness(() => {
    result = { value: consume() };
  });
  const wrapper = mount(createRxDBProviderHarness(source, Consumer));

  if (!result) {
    wrapper.unmount();
    throw new Error('Consumer setup did not run');
  }

  return { result: result.value, wrapper };
};

describe('rxdb-vue dependency injection', () => {
  it('provides and consumes a synchronous RxDB instance through real Vue injection', () => {
    const database = createRxDB('sync');
    const mounted = mountWithProvider(database, () => ({
      injected: RxDBVue.injectRxDB(),
      required: RxDBVue.useRxDB()
    }));

    expect(mounted.result).toEqual({ injected: database, required: database });
    mounted.wrapper.unmount();
  });

  it('returns undefined when no provider exists', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    let injected: RxDB | undefined;
    const Consumer = createSetupHarness(() => {
      injected = RxDBVue.injectRxDB();
    });
    const wrapper = mount(Consumer);

    expect(injected).toBeUndefined();
    expect(warning).toHaveBeenCalled();

    wrapper.unmount();
    warning.mockRestore();
  });

  it('keeps useRxDB strict when the provided ref has no current value', () => {
    const mounted = mountWithProvider(shallowRef<RxDB>(), () => {
      // 有 provider、只是还没就绪 —— 文案必须与「压根没有 provider」区分开，
      // 否则会反过来提示用户去 call provideRxDB()，而他们正调用着它。
      expect(() => RxDBVue.useRxDB()).toThrow('RxDB is not ready yet');
      return true;
    });

    expect(mounted.result).toBe(true);
    mounted.wrapper.unmount();
  });

  it('exposes an observable ref API for asynchronous database initialization', async () => {
    const databaseRef = shallowRef<RxDB>();
    const mounted = mountWithProvider(databaseRef, () => ({
      injected: RxDBVue.injectRxDBRef(),
      required: RxDBVue.useRxDBRef()
    }));

    expect(mounted.result.injected).toBe(databaseRef);
    expect(mounted.result.required).toBe(databaseRef);
    expect(mounted.result.required.value).toBeUndefined();

    const database = createRxDB('async');
    databaseRef.value = database;
    await nextTick();

    expect(mounted.result.required.value).toBe(database);
    expect(RxDBVue.injectRxDB).toBeTypeOf('function');
    mounted.wrapper.unmount();
  });

  it('throws from useRxDBRef when no provider exists', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const Consumer = createSetupHarness(() => {
      expect(() => RxDBVue.useRxDBRef()).toThrow('RxDB instance not found');
    });
    const wrapper = mount(Consumer);

    expect(warning).toHaveBeenCalled();
    wrapper.unmount();
    warning.mockRestore();
  });

  // 工厂存在的意义就是隔离（对照 React 的 makeRxDBProvider 每次都新建 context）。
  // RxDBKey 定义在模块顶层时，两套 provider/injector 读写同一个 Symbol：
  // 后 provide 的库覆盖前者，injectRxDB 拿到的实例类型 T 只是虚假的编译期断言。
  it('isolates each dependency injector created by the factory', () => {
    const userDb = createRxDB('user');
    const cacheDb = createRxDB('cache');
    const userInjection = RxDBVue.makeRxDBDependencyInjector<RxDB>();
    const cacheInjection = RxDBVue.makeRxDBDependencyInjector<RxDB>();

    let seen: { user: RxDB | undefined; cache: RxDB | undefined } | undefined;
    const Consumer = createSetupHarness(() => {
      seen = { user: userInjection.injectRxDB(), cache: cacheInjection.injectRxDB() };
    });
    const Provider = defineComponent({
      setup() {
        userInjection.provideRxDB(userDb);
        cacheInjection.provideRxDB(cacheDb);
        return () => h(Consumer);
      }
    });
    const wrapper = mount(Provider);

    expect(seen).toEqual({ user: userDb, cache: cacheDb });
    wrapper.unmount();
  });

  it('publishes the documented API from the package entry point', () => {
    expect(PublicApi).toMatchObject({
      injectRxDB: RxDBVue.injectRxDB,
      injectRxDBRef: RxDBVue.injectRxDBRef,
      provideRxDB: RxDBVue.provideRxDB,
      useFind: expect.any(Function),
      useInfiniteScroll: expect.any(Function),
      useRepositoryQuery: expect.any(Function),
      useRxDB: RxDBVue.useRxDB,
      useRxDBOptional: RxDBVue.useRxDBOptional,
      useRxDBRef: RxDBVue.useRxDBRef
    });
  });
});

// 三框架统一异步契约：provider 收 `RxDB | Promise<RxDB> | (() => RxDB | Promise<RxDB>)`，
// 读取分 useRxDB（未就绪抛错）与 useRxDBOptional（未就绪返回 undefined）两条。
describe('异步 source', () => {
  it('resolves a factory returning a promise', async () => {
    const { database } = createOwnableRxDB('async-factory');
    const mounted = mountWithProvider(
      () => Promise.resolve(database),
      () => RxDBVue.injectRxDBRef()
    );

    expect(mounted.result?.value).toBeUndefined();
    await flushPromises();

    expect(mounted.result?.value).toBe(database);
    mounted.wrapper.unmount();
  });

  it('resolves a bare promise', async () => {
    const { database } = createOwnableRxDB('async-promise');
    const mounted = mountWithProvider(Promise.resolve(database), () => RxDBVue.injectRxDBRef());

    await flushPromises();

    expect(mounted.result?.value).toBe(database);
    mounted.wrapper.unmount();
  });

  it('returns undefined from useRxDBOptional without warning while pending', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { database } = createOwnableRxDB('pending');
    const mounted = mountWithProvider(
      () => Promise.resolve(database),
      () => RxDBVue.useRxDBOptional()
    );

    expect(mounted.result).toBeUndefined();
    expect(warning).not.toHaveBeenCalled();

    mounted.wrapper.unmount();
    warning.mockRestore();
  });

  it('does not warn from useRxDBOptional when no provider exists', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    let seen: RxDB | undefined = createRxDB('sentinel');
    const Consumer = createSetupHarness(() => {
      seen = RxDBVue.useRxDBOptional();
    });
    const wrapper = mount(Consumer);

    expect(seen).toBeUndefined();
    expect(warning).not.toHaveBeenCalled();

    wrapper.unmount();
    warning.mockRestore();
  });

  it('rethrows the original creation error from useRxDB', async () => {
    const failure = new Error('storage unavailable');
    const seen: unknown[] = [];
    // 在 render 里读：创建异常落到 slot 上会触发重渲染，因此能观察到「就绪前」与「失败后」两次。
    const Consumer = defineComponent({
      setup: () => () => {
        try {
          RxDBVue.useRxDB();
        } catch (error) {
          seen.push(error);
        }
        return h('div');
      }
    });
    const wrapper = mount(createRxDBProviderHarness(() => Promise.reject(failure), Consumer));

    await flushPromises();

    // 创建异常原样抛出，不包一层 —— 与 Angular / React 同语义。
    expect(seen.at(-1)).toBe(failure);
    expect(seen.at(0)).toHaveProperty('message', expect.stringContaining('RxDB is not ready yet'));
    wrapper.unmount();
  });

  // 同步抛出的工厂走的必须是同一条路径。不接住的话异常从 setup 里逃出去，
  // 整棵子树挂掉 —— 而 `useRxDBOptional` 承诺的是 loading/error 态。三端逐字对齐。
  it('routes a synchronously thrown factory error to the same failure slot', async () => {
    const failure = new Error('storage unavailable');
    const seen: unknown[] = [];
    const Consumer = defineComponent({
      setup: () => () => {
        try {
          RxDBVue.useRxDB();
        } catch (error) {
          seen.push(error);
        }
        return h('div');
      }
    });
    const wrapper = mount(
      createRxDBProviderHarness(() => {
        throw failure;
      }, Consumer)
    );

    await flushPromises();

    expect(seen.at(-1)).toBe(failure);
    wrapper.unmount();
  });
});

// 所有权规则：provider 只销毁自己造的东西。调用方自己的实例或 Ref 不该被顺手断掉 ——
// 否则一个模块级单例会随某个子组件卸载而失效，且没有人会去重连。
describe('生命周期所有权', () => {
  it('disconnects a database it created itself', async () => {
    const { database, disconnectAll } = createOwnableRxDB('owned');
    const mounted = mountWithProvider(
      () => database,
      () => RxDBVue.injectRxDBRef()
    );

    await flushPromises();
    expect(mounted.result?.value).toBe(database);

    mounted.wrapper.unmount();
    expect(disconnectAll).toHaveBeenCalledTimes(1);
  });

  it('leaves a caller-supplied instance alone', () => {
    const { database, disconnectAll } = createOwnableRxDB('caller-owned');
    const mounted = mountWithProvider(database, () => RxDBVue.injectRxDB());

    mounted.wrapper.unmount();

    expect(disconnectAll).not.toHaveBeenCalled();
  });

  it('leaves a caller-supplied ref alone', () => {
    const { database, disconnectAll } = createOwnableRxDB('caller-ref');
    const mounted = mountWithProvider(shallowRef<RxDB | undefined>(database), () => RxDBVue.injectRxDB());

    mounted.wrapper.unmount();

    expect(disconnectAll).not.toHaveBeenCalled();
  });

  it('disconnects a database that settles after unmount', async () => {
    const { database, disconnectAll } = createOwnableRxDB('late');
    let settle: (value: RxDB) => void = () => undefined;
    const pending = new Promise<RxDB>(resolve => (settle = resolve));
    const mounted = mountWithProvider(
      () => pending,
      () => RxDBVue.injectRxDBRef()
    );

    mounted.wrapper.unmount();
    settle(database);
    await flushPromises();

    expect(disconnectAll).toHaveBeenCalledTimes(1);
  });
});
