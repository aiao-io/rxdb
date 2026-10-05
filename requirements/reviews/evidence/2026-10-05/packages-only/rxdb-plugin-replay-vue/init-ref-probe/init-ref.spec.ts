import { mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick, onMounted, useTemplateRef } from 'vue';
import { Replayer, type ReplayerRef } from '/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-replay-vue/src/replayer.ts';

const state = vi.hoisted(() => ({ mounts: 0, seeks: [] as number[], trace: [] as string[] }));
vi.mock('@aiao/rxdb-plugin-replay', () => ({
  mountReplayer: () => {
    state.mounts++;
    state.trace.push('mountReplayer');
    return {
      update: () => undefined,
      play: () => undefined,
      pause: () => undefined,
      seek: (time: number) => {
        state.seeks.push(time);
        state.trace.push(`handle.seek:${time}`);
      },
      destroy: () => state.trace.push('handle.destroy')
    };
  }
}));

const wrappers: VueWrapper[] = [];
beforeEach(() => {
  state.mounts = 0;
  state.seeks.length = 0;
  state.trace.length = 0;
});
afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
});

const observe = (scenario: string): void => {
  console.info('INIT_OBSERVATION', JSON.stringify({ scenario, mounts: state.mounts, seeks: state.seeks, trace: state.trace }));
};

describe('Vue 公开 ReplayerRef 的首次 seek 初始化边界', () => {
  it('首次函数 ref 回调调用 seek(500)，加载后应保留意图', async () => {
    const Parent = defineComponent(() => () => h(Replayer, {
      replay: {} as never,
      sessionId: 's1',
      ref: (instance: unknown) => {
        if (instance === null) return;
        state.trace.push('function-ref:seek');
        (instance as ReplayerRef).seek(500);
      }
    }));
    wrappers.push(mount(Parent));
    await nextTick();
    observe('function-ref');
    expect(state.mounts).toBe(1);
    expect(state.seeks).toEqual([500]);
  });

  it('正向对照：父 onMounted 经模板 ref 调用 seek(500)', async () => {
    const Parent = defineComponent(() => {
      const player = useTemplateRef<ReplayerRef>('player');
      onMounted(() => {
        state.trace.push('parent-onMounted:seek');
        player.value?.seek(500);
      });
      return () => h(Replayer, { replay: {} as never, sessionId: 's1', ref: 'player' });
    });
    wrappers.push(mount(Parent));
    await nextTick();
    observe('parent-onMounted');
    expect(state.mounts).toBe(1);
    expect(state.seeks).toEqual([500]);
  });
});
