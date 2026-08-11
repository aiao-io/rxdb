/**
 * `usePersistedState` —— Vue 侧（RVU-010）。
 *
 * @remarks
 * 键转义 / 迁移 / 类型标签 / 写盘可观测的语义由 `@aiao/utils` 的 `PersistedStateRegistry`
 * 保证，已在 `packages/utils/src/__tests__/@browser/persisted-state.spec.ts` 逐条锁住。
 * 这里只测**Vue 绑定层**该负责的部分：容器是不是真的响应式、同 key 是否共享同一个 `Ref`、
 * 模板会不会因为另一处写入而重渲染。
 *
 * 注册表是模块级单例（Vue 没有 Angular 的 root injector），用例之间用**互不相同的
 * namespace** 隔离，而不是重置单例 —— 后者需要为测试开一个公开的 reset 口子。
 */
import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick } from 'vue';
import { usePersistedState } from '../use-persisted-state';

const createMockLocalStorage = () => {
  const store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    snapshot: () => ({ ...store }),
    seed: (key: string, value: string) => {
      store[key] = value;
    }
  };
};

let mockLocalStorage: ReturnType<typeof createMockLocalStorage>;
let namespaceCounter = 0;

/** 每个用例一个全新 namespace：模块级注册表在用例之间不重置。 */
const freshNamespace = (): string => `vue-spec-${(namespaceCounter += 1)}`;

beforeEach(() => {
  mockLocalStorage = createMockLocalStorage();
  Object.defineProperty(globalThis, 'localStorage', { value: mockLocalStorage, writable: true });
});

describe('usePersistedState（RVU-010）', () => {
  it('首次读取使用 initialValue', () => {
    expect(usePersistedState(freshNamespace(), 'theme', 'dark').value.value).toBe('dark');
  });

  it('盘上已有值时以盘上值为准', () => {
    const namespace = freshNamespace();
    mockLocalStorage.seed(`${namespace}:theme`, JSON.stringify('light'));

    expect(usePersistedState(namespace, 'theme', 'dark').value.value).toBe('light');
  });

  it('写入 ref 会同步落盘', () => {
    const namespace = freshNamespace();
    const state = usePersistedState(namespace, 'theme', 'dark');

    state.value.value = 'light';

    expect(mockLocalStorage.setItem).toHaveBeenCalledWith(`${namespace}:theme`, JSON.stringify('light'));
  });

  it('同 key 的两个调用点拿到同一个 ref', () => {
    const namespace = freshNamespace();

    const first = usePersistedState(namespace, 'theme', 'dark');
    const second = usePersistedState(namespace, 'theme', 'dark');

    expect(second.value).toBe(first.value);
  });

  it('同 key 换值类型时 fail-fast', () => {
    const namespace = freshNamespace();
    usePersistedState(namespace, 'slot', 42);

    expect(() => usePersistedState(namespace, 'slot', 'forty-two')).toThrowError(/slot/);
  });

  // 这条是 Vue 绑定层真正要证明的东西：不是「值变了」，而是「模板跟着重渲染」
  it('另一处写入会让持有同 key 的组件重渲染', async () => {
    const namespace = freshNamespace();
    const Host = defineComponent({
      setup() {
        const state = usePersistedState(namespace, 'theme', 'dark');
        return () => h('span', state.value.value);
      }
    });
    const wrapper = mount(Host);
    expect(wrapper.text()).toBe('dark');

    usePersistedState(namespace, 'theme', 'dark').value.value = 'light';
    await nextTick();

    expect(wrapper.text()).toBe('light');
    wrapper.unmount();
  });

  it('组件内直接写 ref 也会重渲染', async () => {
    const namespace = freshNamespace();
    const Host = defineComponent({
      setup() {
        const state = usePersistedState(namespace, 'count', 0);
        return () => h('button', { onClick: () => (state.value.value += 1) }, String(state.value.value));
      }
    });
    const wrapper = mount(Host);

    await wrapper.trigger('click');

    expect(wrapper.text()).toBe('1');
    wrapper.unmount();
  });

  it('组件卸载后同 key 的状态与订阅仍然有效', async () => {
    const namespace = freshNamespace();
    const Host = defineComponent({
      setup() {
        const state = usePersistedState(namespace, 'theme', 'dark');
        return () => h('span', state.value.value);
      }
    });
    mount(Host).unmount();

    const state = usePersistedState(namespace, 'theme', 'dark');
    state.value.value = 'light';

    const remounted = mount(Host);
    await nextTick();

    expect(remounted.text()).toBe('light');
    remounted.unmount();
  });

  describe('persistError', () => {
    // 注册表的 onError 旁路会把写盘失败打到 console.error，这里是预期行为而非被测行为
    beforeEach(() => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
      vi.mocked(console.error).mockRestore();
    });

    it('写盘失败进入 persistError，且内存值照常更新', async () => {
      const namespace = freshNamespace();
      const state = usePersistedState(namespace, 'quota', 'a');
      mockLocalStorage.setItem.mockImplementationOnce(() => {
        throw new Error('QuotaExceeded');
      });

      state.value.value = 'b';
      await nextTick();

      expect(state.value.value).toBe('b');
      expect(state.persistError.value).toBeInstanceOf(Error);
    });

    it('后续写盘成功后 persistError 自动清空', async () => {
      const namespace = freshNamespace();
      const state = usePersistedState(namespace, 'quota', 'a');
      mockLocalStorage.setItem.mockImplementationOnce(() => {
        throw new Error('QuotaExceeded');
      });

      state.value.value = 'b';
      await nextTick();
      state.value.value = 'c';
      await nextTick();

      expect(state.persistError.value).toBeUndefined();
    });

    it('persistError 是响应式的：失败会让模板重渲染', async () => {
      const namespace = freshNamespace();
      const Host = defineComponent({
        setup() {
          const state = usePersistedState(namespace, 'reactive-error', 'a');
          return () => h('span', state.persistError.value ? 'failed' : 'ok');
        }
      });
      const wrapper = mount(Host);
      expect(wrapper.text()).toBe('ok');

      mockLocalStorage.setItem.mockImplementationOnce(() => {
        throw new Error('QuotaExceeded');
      });
      usePersistedState(namespace, 'reactive-error', 'a').value.value = 'b';
      await nextTick();

      expect(wrapper.text()).toBe('failed');
      wrapper.unmount();
    });

    it('persistError 只读，不接受外部写入', () => {
      const state = usePersistedState(freshNamespace(), 'readonly', 'a');

      // @ts-expect-error persistError 是 ComputedRef，只能由持久化结果决定
      state.persistError.value = new Error('nope');

      expect(state.persistError.value).toBeUndefined();
    });
  });
});
