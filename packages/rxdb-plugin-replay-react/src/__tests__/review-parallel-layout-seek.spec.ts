import { MountReplayerSpy } from '@aiao/rxdb-plugin-replay/testing';
import { cleanup, render } from '@testing-library/react';
import { createElement, useLayoutEffect, useRef } from 'react';
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

function PlayerWithInitialSeek() {
  const player = useRef<ReplayerRef>(null);
  useLayoutEffect(() => player.current?.seek(500), []);
  return createElement(Replayer, { ref: player, replay: {} as ReplayerProps['replay'], sessionId: 'session-1' });
}

describe('并行评审：播放器加载前命令的公开契约', () => {
  it('首个 consumer layout effect 的 seek 在句柄建立后仍送达核心', () => {
    render(createElement(PlayerWithInitialSeek));
    expect(state.current?.mounts).toHaveLength(1);
    expect(state.current?.argsOf('seek')).toEqual([[500]]);
  });
});
