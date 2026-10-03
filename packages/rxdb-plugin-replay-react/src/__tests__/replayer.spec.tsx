/**
 * @fileoverview React `Replayer` 跑三端共用的 parity 用例（contracts/replayer-component.md §4）。
 *
 * @remarks
 * `mountReplayer` 打桩成 `MountReplayerSpy`：这里只验证组件把输入 / 输出 / 命令 / 卸载接到核心视图上，回放本身由核心的浏览器测试覆盖。
 */

import { MountReplayerSpy, replayerParityCases, type ReplayerParityDriver } from '@aiao/rxdb-plugin-replay/testing';
import { render, type RenderResult } from '@testing-library/react';
import { createRef, StrictMode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Replayer, type ReplayerProps, type ReplayerRef } from '../replayer.js';

const spy = vi.hoisted(() => ({ current: undefined as MountReplayerSpy | undefined }));
vi.mock('@aiao/rxdb-plugin-replay', () => ({
  mountReplayer: (...args: Parameters<MountReplayerSpy['mountReplayer']>) => spy.current?.mountReplayer(...args)
}));

const createDriver = (): ReplayerParityDriver => {
  const ref = createRef<ReplayerRef>();
  let props: ReplayerProps | undefined;
  let rendered: RenderResult | undefined;
  const element = (next: ReplayerProps) => <Replayer ref={ref} {...next} />;

  return {
    async mount(inputs, outputs) {
      props = { ...inputs, onTimeChange: outputs.timeChange, onCommitRestore: outputs.commitRestore };
      rendered = render(element(props));
    },
    async setInputs(inputs) {
      if (!props || !rendered) throw new Error('not mounted');
      props = { ...props, ...inputs };
      rendered.rerender(element(props));
    },
    play: () => ref.current?.play(),
    pause: () => ref.current?.pause(),
    seek: timeMs => ref.current?.seek(timeMs),
    async unmount() {
      rendered?.unmount();
    },
    container() {
      if (!rendered) throw new Error('not mounted');
      return rendered.container;
    }
  };
};

beforeEach(() => {
  spy.current = new MountReplayerSpy();
});

describe('Replayer（React）parity', () => {
  it.each(replayerParityCases.map(testCase => [testCase.name, testCase] as const))('%s', async (_, testCase) => {
    const current = spy.current;
    if (!current) throw new Error('spy missing');
    await testCase.run(createDriver(), current);
  });
});

describe('Replayer（React）', () => {
  it('StrictMode 下双挂载后只剩一个活视图：先 destroy 再重新 mountReplayer', () => {
    const current = spy.current;
    if (!current) throw new Error('spy missing');
    const view = render(
      <StrictMode>
        <Replayer replay={{} as ReplayerProps['replay']} sessionId='s1' />
      </StrictMode>
    );
    // 严格模式会探测性地挂载→清理→再挂载：活着的视图只有一个
    expect(current.mounts.length - current.argsOf('destroy').length).toBe(1);
    view.unmount();
    expect(current.argsOf('destroy')).toHaveLength(current.mounts.length);
  });

  it('回调换新后，核心视图的事件转到最新的回调，不重新挂载', () => {
    const current = spy.current;
    if (!current) throw new Error('spy missing');
    const replay = {} as ReplayerProps['replay'];
    const first = vi.fn();
    const second = vi.fn();
    const view = render(<Replayer replay={replay} sessionId='s1' onTimeChange={first} />);
    view.rerender(<Replayer replay={replay} sessionId='s1' onTimeChange={second} />);
    current.mounts[0]?.options.onTimeChange?.(42);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith(42);
    expect(current.mounts).toHaveLength(1);
    expect(current.calls).toEqual([]);
  });

  it('换 replay 实例 → update({ replay })', () => {
    const current = spy.current;
    if (!current) throw new Error('spy missing');
    const next = { next: true } as unknown as ReplayerProps['replay'];
    const view = render(<Replayer replay={{} as ReplayerProps['replay']} sessionId='s1' />);
    view.rerender(<Replayer replay={next} sessionId='s1' />);
    expect(current.argsOf('update')).toEqual([[{ replay: next }]]);
  });
});
