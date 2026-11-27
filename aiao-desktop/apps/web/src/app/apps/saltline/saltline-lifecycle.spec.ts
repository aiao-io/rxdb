import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const shipped = readFileSync(resolve(import.meta.dirname, '../../../../public/saltline.html'), 'utf8');

interface Bridge {
  readonly active: boolean;
  readonly state: string;
  readonly error: string | null;
  attach(runtime: unknown): void;
  setVisible(visible: boolean): void;
  subscribe(listener: (state: string, error: string | null) => void): () => void;
  settled(): Promise<void>;
}

function setup(embedded = true) {
  const source = shipped.match(/<script id="saltline-desktop-lifecycle">([\s\S]*?)<\/script>/)?.[1];
  expect(source).toBeDefined();
  const document = Object.assign(new EventTarget(), { hidden: false });
  const view = Object.assign(new EventTarget(), { parent: {}, saltlineDesktop: undefined as Bridge | undefined });
  if (!embedded) view.parent = view;
  runInNewContext(source!, { window: view, document, Event, console });
  const bridge = view.saltlineDesktop!;
  const audio = Object.assign(new EventTarget(), {
    state: 'running',
    suspend: vi.fn(async () => {
      audio.state = 'suspended';
    }),
    resume: vi.fn(async () => {
      audio.state = 'running';
    })
  });
  const runtime = {
    frame: vi.fn(),
    renderer: { setAnimationLoop: vi.fn() },
    game: { pause: vi.fn(), resume: vi.fn() },
    input: { exitLock: vi.fn(), endFrame: vi.fn() },
    audio,
    resetClock: vi.fn()
  };
  return { bridge, runtime, document, view, audio };
}

describe('发布游戏的桌面生命周期桥接', () => {
  it('嵌入且尚未得到宿主可见状态时不启动循环；独立打开正常启动', async () => {
    const { bridge, runtime, audio } = setup();
    bridge.attach(runtime);
    await bridge.settled();
    expect(runtime.renderer.setAnimationLoop).toHaveBeenLastCalledWith(null);
    expect(audio.suspend).toHaveBeenCalledOnce();
    expect(bridge.state).toBe('paused');
    const standalone = setup(false);
    standalone.bridge.attach(standalone.runtime);
    await standalone.bridge.settled();
    expect(standalone.runtime.renderer.setAnimationLoop).toHaveBeenLastCalledWith(standalone.runtime.frame);
  });

  it('隐藏停止绘制与音频；还原重设时钟且不自动继续游戏', async () => {
    const { bridge, runtime, audio } = setup(false);
    bridge.attach(runtime);
    await bridge.settled();
    bridge.setVisible(false);
    expect(runtime.renderer.setAnimationLoop).toHaveBeenLastCalledWith(null);
    expect(runtime.game.pause).toHaveBeenCalledOnce();
    expect(runtime.input.exitLock).toHaveBeenCalledOnce();
    await bridge.settled();
    expect(audio.state).toBe('suspended');
    bridge.setVisible(true);
    await bridge.settled();
    expect(audio.state).toBe('running');
    expect(runtime.resetClock).toHaveBeenCalledTimes(2);
    expect(runtime.game.resume).not.toHaveBeenCalled();
    expect(runtime.renderer.setAnimationLoop).toHaveBeenLastCalledWith(runtime.frame);
  });

  it('加载前隐藏、文档不可见、重复切换均按最终可见性运行', async () => {
    const { bridge, runtime, document } = setup();
    bridge.setVisible(true);
    document.hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
    bridge.attach(runtime);
    await bridge.settled();
    expect(bridge.active).toBe(false);
    bridge.setVisible(true);
    expect(runtime.renderer.setAnimationLoop).toHaveBeenCalledTimes(1);
    document.hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
    bridge.setVisible(false);
    bridge.setVisible(true);
    await bridge.settled();
    expect(bridge.state).toBe('running');
    expect(runtime.renderer.setAnimationLoop).toHaveBeenLastCalledWith(runtime.frame);
  });

  it('没有已授权运行的音频时不主动解锁；无音频也可绘制', async () => {
    const { bridge, runtime, audio } = setup();
    audio.state = 'suspended';
    bridge.attach(runtime);
    await bridge.settled();
    bridge.setVisible(true);
    await bridge.settled();
    expect(audio.resume).not.toHaveBeenCalled();
    const silent = setup(false);
    silent.bridge.attach({ ...silent.runtime, audio: undefined });
    await silent.bridge.settled();
    expect(silent.bridge.state).toBe('running');
  });

  it('音频失败明确上报，下一次切换可重试；订阅解除不再回报', async () => {
    const { bridge, runtime, audio } = setup(false);
    const listener = vi.fn();
    const unsubscribe = bridge.subscribe(listener);
    bridge.attach(runtime);
    await bridge.settled();
    audio.suspend.mockRejectedValueOnce(new Error('Audio suspended failed'));
    bridge.setVisible(false);
    await bridge.settled();
    expect(bridge.state).toBe('failed');
    expect(bridge.error).toBe('Audio suspended failed');
    bridge.setVisible(false);
    await bridge.settled();
    expect(bridge.state).toBe('paused');
    unsubscribe();
    const count = listener.mock.calls.length;
    bridge.setVisible(true);
    await bridge.settled();
    expect(listener).toHaveBeenCalledTimes(count);
  });

  it('异步恢复途中再次隐藏最终保持暂停，不被迟到结果覆盖', async () => {
    const { bridge, runtime, audio } = setup(false);
    bridge.attach(runtime);
    await bridge.settled();
    bridge.setVisible(false);
    await bridge.settled();
    let complete!: () => void;
    audio.resume.mockImplementationOnce(
      () =>
        new Promise<void>(resolve => {
          complete = () => {
            audio.state = 'running';
            resolve();
          };
        })
    );
    bridge.setVisible(true);
    await Promise.resolve();
    bridge.setVisible(false);
    complete();
    await bridge.settled();
    expect(audio.state).toBe('suspended');
    expect(bridge.state).toBe('paused');
    expect(runtime.renderer.setAnimationLoop).toHaveBeenLastCalledWith(null);
  });
});
