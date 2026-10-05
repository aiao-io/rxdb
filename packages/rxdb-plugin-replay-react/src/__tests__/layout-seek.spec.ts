import { MountReplayerSpy } from '@aiao/rxdb-plugin-replay/testing';
import { cleanup, render } from '@testing-library/react';
import { createElement, StrictMode, useLayoutEffect, useRef } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Replayer, type ReplayerProps, type ReplayerRef } from '../replayer.js';

const state = vi.hoisted(() => ({ current: undefined as MountReplayerSpy | undefined }));
vi.mock('@aiao/rxdb-plugin-replay', () => ({
  mountReplayer: (...args: Parameters<MountReplayerSpy['mountReplayer']>) => state.current?.mountReplayer(...args)
}));

beforeEach(() => {
  state.current = new MountReplayerSpy();
});
afterEach(cleanup);

interface PlayerWithInitialSeekProps {
  readonly sessionId?: string;
}

// 整个解构参数上挂默认值（`= {}`）会让 `createElement<P>` 的重载推导退化成 `P = {}`，
// 导致 `{ sessionId }` 被当成未知属性报错；改成具名 props 类型 + 字段级默认值即可。
function PlayerWithInitialSeek({ sessionId = 'session-1' }: PlayerWithInitialSeekProps) {
  const player = useRef<ReplayerRef>(null);
  useLayoutEffect(() => player.current?.seek(500), []);
  return createElement(Replayer, { ref: player, replay: {} as ReplayerProps['replay'], sessionId });
}

describe('播放器加载前命令的公开契约（RV-070 回归）', () => {
  it('首个 consumer layout effect 的 seek 在句柄建立后仍送达核心', () => {
    render(createElement(PlayerWithInitialSeek));
    expect(state.current?.mounts).toHaveLength(1);
    expect(state.current?.argsOf('seek')).toEqual([[500]]);
  });

  // 回归：SSR——服务端渲染不跑任何 effect，既不应该报错，也不该去调 mountReplayer
  // （那是浏览器端的 rrweb 回放视图，核心侧按需 import，服务端一次都不该碰）。
  it('服务端渲染不执行 layout effect，不调用 mountReplayer，不抛错', () => {
    const html = renderToString(createElement(PlayerWithInitialSeek));
    expect(html).toContain('<div');
    expect(state.current?.mounts).toHaveLength(0);
  });

  // 回归：StrictMode——开发期挂载→卸载→再挂载同一实例，被丢弃的第一个 handle 与
  // 真正留下来的第二个 handle 都该收到这份挂载前的 seek 意图（pendingSeekRef 不因为
  // 第一次“假”挂载被消费掉），而不是只有先被丢弃的那个收到。
  it('StrictMode 双挂载下，最终留下来的句柄仍收到挂载前的 seek 意图', () => {
    render(createElement(StrictMode, null, createElement(PlayerWithInitialSeek)));
    const mounts = state.current?.mounts.length ?? 0;
    const destroys = state.current?.argsOf('destroy').length ?? 0;
    // 严格模式探测性地多挂载一次，但活着的句柄只剩一个
    expect(mounts - destroys).toBe(1);
    // 每一次挂载（包括被丢弃的那次）都应该把同一个目标时刻补发给各自的句柄
    expect(state.current?.argsOf('seek')).toEqual(Array.from({ length: mounts }, () => [500]));
  });

  // 回归：卸载——挂载前记下的 seek 意图兑现之后，正常卸载仍只触发一次 destroy，
  // 不因为新增的 pendingSeekRef 而遗留额外的收尾工作。
  it('卸载时仍只 destroy 一次，不受挂载前 seek 记忆影响', () => {
    const view = render(createElement(PlayerWithInitialSeek));
    expect(state.current?.argsOf('destroy')).toHaveLength(0);
    view.unmount();
    expect(state.current?.argsOf('destroy')).toHaveLength(1);
  });

  // 回归：多 root——两个独立实例各自在挂载前记下不同的目标时刻，互不串线。
  it('多个独立 root 各自的挂载前 seek 意图互不影响', () => {
    const first = render(createElement(PlayerWithInitialSeek, { sessionId: 'session-first' }));
    const second = render(createElement(PlayerWithInitialSeek, { sessionId: 'session-second' }));
    expect(state.current?.mounts).toHaveLength(2);
    expect(state.current?.argsOf('seek')).toEqual([[500], [500]]);
    const [firstMount, secondMount] = state.current?.mounts ?? [];
    expect(firstMount?.options.sessionId).toBe('session-first');
    expect(secondMount?.options.sessionId).toBe('session-second');
    first.unmount();
    second.unmount();
  });
});
