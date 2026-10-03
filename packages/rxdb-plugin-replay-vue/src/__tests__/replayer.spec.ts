/**
 * @fileoverview Vue `Replayer` 跑三端共用的 parity 用例（contracts/replayer-component.md §4）。
 *
 * @remarks
 * `mountReplayer` 打桩成 `MountReplayerSpy`：这里只验证组件把输入 / 输出 / 命令 / 卸载接到核心视图上，回放本身由核心的浏览器测试覆盖。
 */

import { MountReplayerSpy, replayerParityCases, type ReplayerParityDriver } from '@aiao/rxdb-plugin-replay/testing';
import { mount, type VueWrapper } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick, reactive, shallowRef } from 'vue';
import { Replayer, type ReplayerRef } from '../replayer.js';

const spy = vi.hoisted(() => ({ current: undefined as MountReplayerSpy | undefined }));
vi.mock('@aiao/rxdb-plugin-replay', () => ({
  mountReplayer: (...args: Parameters<MountReplayerSpy['mountReplayer']>) => spy.current?.mountReplayer(...args)
}));

type ReplayerWrapper = VueWrapper<InstanceType<typeof Replayer>>;

const createDriver = (): ReplayerParityDriver => {
  let wrapper: ReplayerWrapper | undefined;
  const mounted = (): ReplayerWrapper => {
    if (!wrapper) throw new Error('not mounted');
    return wrapper;
  };
  // expose() 的成员不进组件实例类型，模板 ref 拿到的就是这组命令
  const commands = (): ReplayerRef => mounted().vm as unknown as ReplayerRef;

  return {
    async mount(inputs, outputs) {
      wrapper = mount(Replayer, {
        props: { ...inputs, onTimeChange: outputs.timeChange, onCommitRestore: outputs.commitRestore }
      });
      await nextTick();
    },
    async setInputs(inputs) {
      await mounted().setProps(inputs);
    },
    play: () => commands().play(),
    pause: () => commands().pause(),
    seek: timeMs => commands().seek(timeMs),
    async unmount() {
      mounted().unmount();
      await nextTick();
    },
    container: () => mounted().element
  };
};

beforeEach(() => {
  spy.current = new MountReplayerSpy();
});

describe('Replayer（Vue）parity', () => {
  it.each(replayerParityCases.map(testCase => [testCase.name, testCase] as const))('%s', async (_, testCase) => {
    const current = spy.current;
    if (!current) throw new Error('spy missing');
    await testCase.run(createDriver(), current);
  });
});

describe('Replayer（Vue）', () => {
  it('换 replay 实例 → update({ replay })；同时改两项合成一次 update', async () => {
    const current = spy.current;
    if (!current) throw new Error('spy missing');
    const next = { next: true };
    const wrapper = mount(Replayer, { props: { replay: {} as never, sessionId: 's1' } });
    await wrapper.setProps({ replay: next as never });
    await wrapper.setProps({ sessionId: 's2', initialTime: 9 });
    expect(current.argsOf('update')).toEqual([[{ replay: next }], [{ sessionId: 's2', initialTime: 9 }]]);
    expect(current.mounts).toHaveLength(1);
  });

  it('门面换成同一对象的 reactive 代理 → 按原对象比较，不 update', async () => {
    const current = spy.current;
    if (!current) throw new Error('spy missing');
    const replay = { raw: true };
    // setProps 走测试工具的深 reactive，会先把代理拆回原对象；这里用 shallowRef 让代理原样进 props
    const facade = shallowRef<object>(replay);
    mount(defineComponent(() => () => h(Replayer, { replay: facade.value as never, sessionId: 's1' })));
    facade.value = reactive(replay);
    await nextTick();
    expect(current.argsOf('update')).toEqual([]);
    expect(current.mounts).toHaveLength(1);
    expect(current.mounts[0]?.options.replay).toBe(replay);
  });

  it('宿主是组件根元素自身', () => {
    const current = spy.current;
    if (!current) throw new Error('spy missing');
    const wrapper = mount(Replayer, { props: { replay: {} as never, sessionId: 's1' } });
    expect(current.mounts[0]?.host).toBe(wrapper.element);
  });
});
