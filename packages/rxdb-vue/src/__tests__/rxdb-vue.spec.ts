import { RxDB } from '@aiao/rxdb';
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick, shallowRef, type Ref } from 'vue';
import * as PublicApi from '../index';
import * as RxDBVue from '../rxdb-vue';
import { createRxDBProviderHarness } from './rxdb-provider-harness';
import { createSetupHarness } from './setup-harness';

const createRxDB = (name: string): RxDB => ({ name }) as unknown as RxDB;

const mountWithProvider = <T>(source: RxDB | Ref<RxDB | undefined> | undefined, consume: () => T) => {
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
      expect(() => RxDBVue.useRxDB()).toThrow('RxDB instance not found');
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
      useRxDBRef: RxDBVue.useRxDBRef
    });
  });
});
