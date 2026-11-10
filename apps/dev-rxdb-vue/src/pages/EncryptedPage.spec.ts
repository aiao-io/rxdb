import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { of, Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * @fileoverview 加密页的初始化随页面有效期走（与 React `bindEncryptionFacade` 的 active 判据同口径）：
 * 连接或加密元数据查询晚于卸载才回来时，不再建锁状态订阅，以后解锁也不会让已离开的页面再去读全部加密用户。
 */

const mocks = vi.hoisted(() => ({ connect: vi.fn(), findAll: vi.fn(), getRepository: vi.fn() }));

vi.mock('@aiao/rxdb-vue', () => ({
  injectRxDB: () => ({ connect: mocks.connect, entityManager: { getRepository: mocks.getRepository } })
}));
// 页面只把两个适配器包当类型用；桩掉免得测试加载 sqlite 适配器源码
vi.mock('@aiao/rxdb-adapter-sqlite-core', () => ({ AdapterEncryptionFacade: class {} }));
vi.mock('@aiao/rxdb-adapter-sqlite-wasm', () => ({ RxDBAdapterSqlite: class {} }));

import EncryptedPage from './EncryptedPage.vue';

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(settle => (resolve = settle));
  return { promise, resolve };
}

function createFacade(initialized: Promise<boolean> = Promise.resolve(true)) {
  return {
    isLocked: true,
    isInitialized: vi.fn(() => initialized),
    lockChange$: new Subject<boolean>(),
    lock: vi.fn(),
    unlock: vi.fn()
  };
}

const wrappers: VueWrapper[] = [];
const render = () => {
  const wrapper = mount(EncryptedPage);
  wrappers.push(wrapper);
  return wrapper;
};

beforeEach(() => {
  mocks.connect.mockReset();
  mocks.findAll.mockReset().mockReturnValue(of([]));
  mocks.getRepository.mockReset().mockReturnValue({ findAll: mocks.findAll });
});

afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
});

describe('EncryptedPage：初始化晚于卸载', () => {
  it('连接在卸载之后才回来：不建锁状态订阅，之后解锁也不读加密用户', async () => {
    const facade = createFacade();
    const connecting = deferred<{ encryption: typeof facade }>();
    mocks.connect.mockReturnValue(connecting.promise);

    render().unmount();
    connecting.resolve({ encryption: facade });
    await flushPromises();
    facade.lockChange$.next(false);
    await flushPromises();

    expect(facade.lockChange$.observed).toBe(false);
    expect(mocks.findAll).not.toHaveBeenCalled();
  });

  it('加密元数据查询在卸载之后才回来：同样不建订阅', async () => {
    const initialized = deferred<boolean>();
    const facade = createFacade(initialized.promise);
    mocks.connect.mockResolvedValue({ encryption: facade });

    const wrapper = render();
    await flushPromises();
    expect(facade.isInitialized).toHaveBeenCalledOnce();
    wrapper.unmount();
    initialized.resolve(true);
    await flushPromises();
    facade.lockChange$.next(false);
    await flushPromises();

    expect(facade.lockChange$.observed).toBe(false);
    expect(mocks.findAll).not.toHaveBeenCalled();
  });

  it('页面挂着时解锁会读加密用户，卸载后摘掉订阅', async () => {
    const facade = createFacade();
    mocks.connect.mockResolvedValue({ encryption: facade });

    const wrapper = render();
    await flushPromises();
    facade.lockChange$.next(false);
    await flushPromises();

    expect(mocks.findAll).toHaveBeenCalledOnce();
    wrapper.unmount();
    expect(facade.lockChange$.observed).toBe(false);
  });
});
