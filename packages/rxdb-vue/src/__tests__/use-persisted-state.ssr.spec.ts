// @vitest-environment node
/**
 * `usePersistedState` 的服务端渲染作用域（RV-01a1ba4b4adf）。
 *
 * @remarks
 * 长驻 SSR 进程会连续、并发地处理不同用户的请求。服务端状态按 SSR 上下文（每个请求一份）隔离：
 * 同一请求内同 key 仍是同一份状态，请求之间互不可见。
 */
import { createSSRApp, defineComponent, h } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { describe, expect, it } from 'vitest';
import { usePersistedState } from '../use-persisted-state';

const Profile = defineComponent({
  props: { secret: { type: String, required: true } },
  setup(props) {
    const state = usePersistedState('ssr-profile', 'secret', props.secret);
    return () => h('span', state.value.value);
  }
});

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>(settle => {
    resolve = settle;
  });
  return { promise, resolve };
};

/** setup 先登记状态、再等闸门：两个请求都登记完之后才开始渲染。 */
const gatedProfile = (gate: Promise<void>) =>
  defineComponent({
    props: { secret: { type: String, required: true } },
    async setup(props) {
      const state = usePersistedState('ssr-concurrent', 'secret', props.secret);
      await gate;
      return () => h('span', state.value.value);
    }
  });

describe('usePersistedState（SSR）', () => {
  it('运行在没有 window 的服务端环境', () => {
    expect(typeof window).toBe('undefined');
  });

  it('连续两个请求用同一业务键时，各自渲染本次的 initialValue', async () => {
    expect(await renderToString(createSSRApp(Profile, { secret: 'alice-private' }))).toBe(
      '<span>alice-private</span>'
    );
    expect(await renderToString(createSSRApp(Profile, { secret: 'bob-private' }))).toBe('<span>bob-private</span>');
  });

  it('并发请求交错登记同一业务键时互不可见', async () => {
    const alice = deferred();
    const bob = deferred();
    const pages = Promise.all([
      renderToString(createSSRApp(gatedProfile(alice.promise), { secret: 'alice-concurrent' })),
      renderToString(createSSRApp(gatedProfile(bob.promise), { secret: 'bob-concurrent' }))
    ]);

    bob.resolve();
    alice.resolve();

    expect(await pages).toEqual(['<span>alice-concurrent</span>', '<span>bob-concurrent</span>']);
  });

  it('一个请求在 setup 里的写入对下一个请求不可见', async () => {
    const Writer = defineComponent({
      setup() {
        const state = usePersistedState('ssr-write', 'owner', 'nobody');
        state.value.value = 'alice-wrote';
        return () => h('span', state.value.value);
      }
    });
    const Reader = defineComponent({
      setup() {
        const state = usePersistedState('ssr-write', 'owner', 'nobody');
        return () => h('span', state.value.value);
      }
    });

    expect(await renderToString(createSSRApp(Writer))).toBe('<span>alice-wrote</span>');
    expect(await renderToString(createSSRApp(Reader))).toBe('<span>nobody</span>');
  });

  it('同一请求内同 key 的调用点共享同一份状态', async () => {
    const Pair = defineComponent({
      setup() {
        const first = usePersistedState('ssr-shared', 'theme', 'dark');
        const second = usePersistedState('ssr-shared', 'theme', 'light');
        first.value.value = 'blue';
        return () => h('span', `${first.value.value}/${second.value.value}`);
      }
    });

    expect(await renderToString(createSSRApp(Pair))).toBe('<span>blue/blue</span>');
  });

  it('同一业务键在不同请求里换值类型不会因上一个请求抛错', async () => {
    const Slot = (initial: number | string) =>
      defineComponent({
        setup() {
          const state = usePersistedState('ssr-slot', 'value', initial);
          return () => h('span', String(state.value.value));
        }
      });

    expect(await renderToString(createSSRApp(Slot(42)))).toBe('<span>42</span>');
    expect(await renderToString(createSSRApp(Slot('forty-two')))).toBe('<span>forty-two</span>');
  });
});
