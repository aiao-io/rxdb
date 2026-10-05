/**
 * @fileoverview R2-10 的真实 Angular fixture 与核心播放器状态链补证。
 * @remarks
 * 入口只转发真实核心源函数；组件用独立模块键，rrweb 按可解析的核心依赖路径受控。
 * 父子门面分轮加载、同时存活，不证明同轮动态装载、真实录像、iframe 布局、键盘或原生 IME。
 */
import {
  mountReplayer,
  replayRestoreHint,
  type ReplayCommitMarker,
  type ReplayManager,
  type ReplayRestoreResult,
  type ReplayState,
  type ReplayerCommitRestoreEvent
} from '@aiao/rxdb-plugin-replay';
import { Component, InjectionToken, inject, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { of } from 'rxjs';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReplayerComponent as ReplayerInstance } from '../replayer.component.js';

type eventWithTime = Awaited<ReturnType<ReplayManager['readEvents']>>[number];
type RrwebClass = typeof import('../../../rxdb-plugin-replay/node_modules/rrweb/dist/rrweb.js').Replayer;
type PlaybackContract = Pick<InstanceType<RrwebClass>, 'play' | 'pause' | 'destroy' | 'getMetaData' | 'getCurrentTime'>;
type PlaybackListener = Parameters<InstanceType<RrwebClass>['on']>[1];

vi.mock('@aiao/rxdb-plugin-replay', async () => {
  const { mountReplayer } = await import('../../../rxdb-plugin-replay/src/replayer/mount-replayer.js');
  const { replayRestoreHint } = await import('../../../rxdb-plugin-replay/src/restore.js');
  return { mountReplayer, replayRestoreHint };
});
const boundary = vi.hoisted(() => {
  const instances: ControlledReplayer[] = [];
  class ControlledReplayer implements PlaybackContract {
    position = 0;
    readonly play = vi.fn((offset = 0) => {
      this.position = offset;
    });
    readonly pause = vi.fn((offset?: number) => {
      if (offset !== undefined) this.position = offset;
    });
    readonly destroy = vi.fn();
    readonly listeners = new Map<string, PlaybackListener>();
    readonly on = vi.fn((event: string, listener: PlaybackListener) => {
      this.listeners.set(event, listener);
      return this;
    });

    constructor(
      readonly events: eventWithTime[],
      readonly config: ConstructorParameters<RrwebClass>[1]
    ) {
      instances.push(this);
    }

    getMetaData() {
      const first = this.events[0];
      const last = this.events.at(-1);
      if (!first || !last) throw new Error('受控播放器要求非空事件');
      return { startTime: first.timestamp, endTime: last.timestamp, totalTime: last.timestamp - first.timestamp };
    }

    getCurrentTime(): number {
      return this.position;
    }

    finish(): void {
      const listener = this.listeners.get('finish');
      if (!listener) throw new Error('核心未注册 finish 监听器');
      listener();
    }
  }
  return { Replayer: ControlledReplayer, instances };
});
vi.mock('../../../rxdb-plugin-replay/node_modules/rrweb/dist/rrweb.js', () => ({ Replayer: boundary.Replayer }));

const { ReplayerComponent } = await vi.importActual<typeof import('../replayer.component.js')>(
  '../replayer.component.ts?review-r3-real-core'
);

const events: eventWithTime[] = [
  { type: 4, timestamp: 1_000, data: { href: 'https://review.invalid/', width: 800, height: 600 } },
  { type: 2, timestamp: 1_000, data: { node: { type: 0, id: 1, childNodes: [] }, initialOffset: { left: 0, top: 0 } } },
  { type: 5, timestamp: 2_000, data: { tag: 'review-end', payload: null } }
];
const marker: ReplayCommitMarker = { seq: 99, timestamp: 1_500, commitId: 'commit-one', branchId: 'main' };
const restored: ReplayRestoreResult = { ok: true, restoredCount: 2, sessionId: 'restore-one', workingTreeRevision: 3 };
const createReplay = (overrides: Partial<ReplayManager> = {}) =>
  ({
    state$: of<ReplayState>({ kind: 'idle' }),
    start: vi.fn(async () => 'not-requested'),
    stop: vi.fn(async () => undefined),
    listSessions: vi.fn(async () => []),
    readEvents: vi.fn(async () => events),
    listCommitMarkers: vi.fn(async () => [marker]),
    restoreToCommit: vi.fn(async (): Promise<ReplayRestoreResult> => restored),
    exportSession: vi.fn(async () => {
      throw new Error('本探针不调用导出');
    }),
    deleteSession: vi.fn(async () => undefined),
    usage: vi.fn(async () => ({ bytes: 0, sessionCount: 0, limits: { sessionBytes: 1_000, storeBytes: 2_000 } })),
    ...overrides
  }) satisfies ReplayManager;

const hostOf = <T>(fixture: ComponentFixture<T>): HTMLElement => {
  const host: unknown = fixture.componentRef.location.nativeElement;
  if (!(host instanceof HTMLElement)) throw new Error('fixture 缺 HTMLElement 宿主');
  return host;
};
const element = <T extends HTMLElement>(host: HTMLElement, selector: string): T => {
  const node = host.querySelector<T>(selector);
  if (!node) throw new Error(`缺元素 ${selector}`);
  return node;
};
const state = (fixture: ComponentFixture<ReplayerInstance>) =>
  element(hostOf(fixture), '.rxdb-replayer').dataset['state'];
const settle = () => new Promise<void>(resolve => setTimeout(resolve, 0));
const mount = async (replay: ReplayManager, sessionId = 'session-one') => {
  const fixture = TestBed.createComponent(ReplayerComponent);
  fixture.componentRef.setInput('replay', replay);
  fixture.componentRef.setInput('sessionId', sessionId);
  await fixture.whenStable();
  return fixture;
};
const ready = (fixture: ComponentFixture<ReplayerInstance>) => vi.waitFor(() => expect(state(fixture)).toBe('ready'));

const playerAt = (index: number) => {
  const player = boundary.instances[index];
  if (!player) throw new Error(`缺受控播放器 ${index}`);
  return player;
};

const SOURCE = new InjectionToken<ReplayManager>('R2-10 父级门面');
const createParentHost = (childSource: ReplayManager) => {
  class ChildReplayHost {
    readonly replay = inject(SOURCE);
  }
  Component({
    selector: 'review-replay-child',
    imports: [ReplayerComponent],
    providers: [{ provide: SOURCE, useValue: childSource }],
    template: '<ao-replayer [replay]="replay" sessionId="child-session" />'
  })(ChildReplayHost);
  class ParentReplayHost {
    readonly replay = inject(SOURCE);
    readonly showChild = signal(false);
  }
  Component({
    imports: [ReplayerComponent, ChildReplayHost],
    template:
      '<ao-replayer [replay]="replay" sessionId="parent-session" />@if (showChild()) { <review-replay-child /> }'
  })(ParentReplayHost);
  return ParentReplayHost;
};

beforeEach(() => {
  boundary.instances.length = 0;
});

afterEach(() => {
  TestBed.resetTestingModule();
  vi.restoreAllMocks();
});

afterAll(() => {
  TestBed.resetTestingModule();
  vi.doUnmock('@aiao/rxdb-plugin-replay');
  vi.doUnmock('../../../rxdb-plugin-replay/node_modules/rrweb/dist/rrweb.js');
});

describe('R2-10 Angular + 真实核心：加载与生命周期', () => {
  it('R3 夹具守卫：组件入口转发真实核心，rrweb 使用同一可解析模块', async () => {
    // 本包 vite 配置下 `@aiao/rxdb-plugin-replay` 解析到 dist；这里改走顶部已静态导入的
    // `mountReplayer`（经由上方 `vi.mock` 工厂转发到核心 src），不再额外动态 `import()`
    // 同一个包名，避免被 `@nx/enforce-module-boundaries` 误判成「懒加载」。`source` / `rrweb`
    // 两个相对路径导入拿的是核心包未导出的内部实现文件与其私有依赖，没有包名可走，是这条断言
    // 要证「同一可解析模块」本身要求的，无法消去。
    const source = await import('../../../rxdb-plugin-replay/src/replayer/mount-replayer.js');
    const rrweb = await import('../../../rxdb-plugin-replay/node_modules/rrweb/dist/rrweb.js');
    expect(mountReplayer).toBe(source.mountReplayer);
    expect(vi.isMockFunction(mountReplayer)).toBe(false);
    expect(rrweb.Replayer).toBe(boundary.Replayer);
    const fixture = await mount(createReplay());
    await ready(fixture);
    expect(boundary.instances).toHaveLength(1);
    expect(boundary.instances[0]?.config).toEqual({
      root: element(hostOf(fixture), '.rxdb-replayer__stage'),
      mouseTail: false,
      showWarning: false
    });
  });
  it('空 recording 与加载失败显示各自状态，不启动录制', async () => {
    const pending = Promise.withResolvers<eventWithTime[]>();
    const replay = createReplay({ readEvents: vi.fn(() => pending.promise) });
    const fixture = await mount(replay);
    expect(state(fixture)).toBe('loading');
    expect(element(hostOf(fixture), '.rxdb-replayer').getAttribute('aria-busy')).toBe('true');
    pending.resolve([]);
    await vi.waitFor(() => expect(state(fixture)).toBe('empty'));
    expect(hostOf(fixture).textContent).toContain('No events to replay');
    const failure = createReplay({
      readEvents: vi.fn(async () => {
        throw new Error('read failed');
      })
    });
    fixture.componentRef.setInput('replay', failure);
    await fixture.whenStable();
    await vi.waitFor(() => expect(state(fixture)).toBe('error'));
    expect(element(hostOf(fixture), '[role="alert"]').textContent).toBe('read failed');
    expect(boundary.instances).toHaveLength(0);
    expect(replay.start).not.toHaveBeenCalled();
    expect(failure.start).not.toHaveBeenCalled();
  });

  it('切 session 和 replay 不重建组件，旧 load 晚完成不能覆盖新 recording', async () => {
    const pending = Promise.withResolvers<eventWithTime[]>();
    const source = createReplay({
      readEvents: vi.fn<ReplayManager['readEvents']>().mockReturnValueOnce(pending.promise).mockResolvedValue(events)
    });
    const fixture = await mount(source);
    fixture.componentRef.setInput('sessionId', 'session-two');
    await fixture.whenStable();
    await ready(fixture);
    expect(source.readEvents).toHaveBeenCalledTimes(2);
    expect(source.readEvents).toHaveBeenLastCalledWith('session-two');
    const firstPlayer = boundary.instances[0];
    if (!firstPlayer) throw new Error('缺首个播放器');
    const other = createReplay();
    fixture.componentRef.setInput('replay', other);
    await fixture.whenStable();
    await ready(fixture);
    expect(firstPlayer.destroy).toHaveBeenCalledTimes(1);
    expect(other.readEvents).toHaveBeenCalledWith('session-two');
    pending.resolve(events);
    await settle();
    expect(boundary.instances).toHaveLength(2);
    fixture.destroy();
    expect(boundary.instances.every(player => player.destroy.mock.calls.length === 1)).toBe(true);
  });

  it('挂载后加载中的 seek 与之后 initialTime 走真实时间轴和输出', async () => {
    const pending = Promise.withResolvers<eventWithTime[]>();
    const fixture = await mount(createReplay({ readEvents: () => pending.promise }));
    const time = vi.fn<(value: number) => void>();
    fixture.componentInstance.aoTimeChange.subscribe(time);
    fixture.componentInstance.seek(125);
    pending.resolve(events);
    await ready(fixture);
    const timeline = element<HTMLInputElement>(hostOf(fixture), 'input[aria-label="Timeline"]');
    expect(timeline.value).toBe('125');
    expect(time).toHaveBeenLastCalledWith(125);
    fixture.componentRef.setInput('initialTime', 300);
    await fixture.whenStable();
    expect(timeline.value).toBe('300');
    expect(time).toHaveBeenLastCalledWith(300);
    const toggle = element<HTMLButtonElement>(hostOf(fixture), '.rxdb-replayer__toggle');
    expect(toggle.type).toBe('button');
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    toggle.click();
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    fixture.componentInstance.pause();
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    timeline.value = '400';
    timeline.dispatchEvent(new Event('input'));
    expect(time).toHaveBeenLastCalledWith(400);
    expect(timeline.getAttribute('aria-valuetext')).toBe('00:00');
    expect(hostOf(fixture).querySelector('[role="status"][aria-live="polite"]')).not.toBeNull();
  });

  it('父子 provider 分别供给同组件的两个实例，各自读取和销毁', async () => {
    const parent = createReplay();
    const childSource = createReplay();
    const ParentReplayHost = createParentHost(childSource);
    TestBed.configureTestingModule({ providers: [{ provide: SOURCE, useValue: parent }] });
    const fixture = TestBed.createComponent(ParentReplayHost);
    await fixture.whenStable();
    await vi.waitFor(() => expect(boundary.instances).toHaveLength(1));
    fixture.componentInstance.showChild.set(true);
    await fixture.whenStable();
    await vi.waitFor(() => expect(boundary.instances).toHaveLength(2));
    expect(parent.readEvents).toHaveBeenCalledWith('parent-session');
    expect(childSource.readEvents).toHaveBeenCalledWith('child-session');
    expect(hostOf(fixture).querySelectorAll('ao-replayer .rxdb-replayer')).toHaveLength(2);
    expect(parent.start).not.toHaveBeenCalled();
    expect(childSource.start).not.toHaveBeenCalled();
    fixture.destroy();
    expect(boundary.instances.every(player => player.destroy.mock.calls.length === 1)).toBe(true);
  });

  it('加载中销毁，晚 load 不生成播放器、不向已销毁组件输出', async () => {
    const pending = Promise.withResolvers<eventWithTime[]>();
    const fixture = await mount(createReplay({ readEvents: () => pending.promise }));
    const host = hostOf(fixture);
    const time = vi.fn<(value: number) => void>();
    fixture.componentInstance.aoTimeChange.subscribe(time);
    fixture.destroy();
    pending.resolve(events);
    await settle();
    expect(host.querySelector('.rxdb-replayer')).toBeNull();
    expect(boundary.instances).toHaveLength(0);
    expect(time).not.toHaveBeenCalled();
    fixture.componentInstance.play();
    fixture.componentInstance.pause();
    fixture.componentInstance.seek(100);
    expect(time).not.toHaveBeenCalled();
  });

  it('首次渲染前销毁，afterNextRender 不留后台 mount', async () => {
    const replay = createReplay();
    const fixture = TestBed.createComponent(ReplayerComponent);
    fixture.componentRef.setInput('replay', replay);
    fixture.componentRef.setInput('sessionId', 'unmounted');
    fixture.destroy();
    await settle();
    expect(replay.readEvents).not.toHaveBeenCalled();
    expect(replay.start).not.toHaveBeenCalled();
    expect(boundary.instances).toHaveLength(0);
  });
});

const restoreResults: readonly (ReplayRestoreResult | Error)[] = [
  restored,
  { ok: false, reason: 'unreachable_target' },
  { ok: false, reason: 'dirty_working_tree' },
  { ok: false, reason: 'conflict' },
  { ok: false, reason: 'incompatible_schema' },
  new Error('restore failed')
];

describe('R2-10 Angular + 真实核心：marker、恢复状态与取消', () => {
  it.each(restoreResults)('实际 marker 点击后转发受控恢复结果 %#', async result => {
    const pending = Promise.withResolvers<ReplayRestoreResult>();
    const replay = createReplay({ restoreToCommit: vi.fn(() => pending.promise) });
    const fixture = await mount(replay);
    const output = vi.fn<(event: ReplayerCommitRestoreEvent) => void>();
    fixture.componentInstance.aoCommitRestore.subscribe(output);
    await ready(fixture);
    const host = hostOf(fixture);
    element<HTMLButtonElement>(host, '[data-commit-id="commit-one"]').click();
    expect(replay.restoreToCommit).toHaveBeenCalledWith(marker.commitId);
    expect(element(host, '[role="status"]').textContent).toBe('Restoring…');
    expect(output).not.toHaveBeenCalled();
    if (result instanceof Error) pending.reject(result);
    else pending.resolve(result);
    await vi.waitFor(() => expect(output).toHaveBeenCalledTimes(1));
    const expected = result instanceof Error ? { ok: false, reason: 'error', error: result } : result;
    expect(output).toHaveBeenCalledWith({ marker, result: expected });
    const hint =
      result instanceof Error ? result.message
      : result.ok ? 'Restored 2 changes'
      : replayRestoreHint(result.reason);
    expect(element(host, '[role="status"]').textContent).toBe(hint);
    expect(host.querySelector('ul[aria-label="Commits"]')).not.toBeNull();
  });

  it('同播放器的两个在途 restore 各自完成，不把受控结果冒充真实工作树 CAS', async () => {
    const first = Promise.withResolvers<ReplayRestoreResult>();
    const second = Promise.withResolvers<ReplayRestoreResult>();
    const restoreToCommit = vi
      .fn<ReplayManager['restoreToCommit']>()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const fixture = await mount(createReplay({ restoreToCommit }));
    const output = vi.fn<(event: ReplayerCommitRestoreEvent) => void>();
    fixture.componentInstance.aoCommitRestore.subscribe(output);
    await ready(fixture);
    const button = element<HTMLButtonElement>(hostOf(fixture), '[data-commit-id="commit-one"]');
    button.click();
    button.click();
    expect(restoreToCommit).toHaveBeenCalledTimes(2);
    first.resolve({ ok: false, reason: 'conflict' });
    await vi.waitFor(() => expect(output).toHaveBeenCalledTimes(1));
    second.resolve(restored);
    await vi.waitFor(() => expect(output).toHaveBeenCalledTimes(2));
    expect(element(hostOf(fixture), '[role="status"]').textContent).toBe('Restored 2 changes');
  });

  it('恢复中卸载，晚结果不输出、不复建 DOM，核心播放器销毁一次', async () => {
    const pending = Promise.withResolvers<ReplayRestoreResult>();
    const fixture = await mount(createReplay({ restoreToCommit: () => pending.promise }));
    const output = vi.fn<(event: ReplayerCommitRestoreEvent) => void>();
    fixture.componentInstance.aoCommitRestore.subscribe(output);
    await ready(fixture);
    const host = hostOf(fixture);
    element<HTMLButtonElement>(host, '[data-commit-id="commit-one"]').click();
    fixture.destroy();
    pending.resolve(restored);
    await settle();
    expect(output).not.toHaveBeenCalled();
    expect(host.querySelector('.rxdb-replayer')).toBeNull();
    expect(boundary.instances).toHaveLength(1);
    expect(boundary.instances[0]?.destroy).toHaveBeenCalledTimes(1);
  });
});

describe('R3-03 真实核心：控制契约与代际取消', () => {
  it('加载中的 play/pause 不启动，最后一次 seek 落位并按总时长夹紧', async () => {
    const pending = Promise.withResolvers<eventWithTime[]>();
    const fixture = await mount(createReplay({ readEvents: () => pending.promise }));
    const time = vi.fn<(value: number) => void>();
    fixture.componentInstance.aoTimeChange.subscribe(time);
    fixture.componentInstance.play();
    fixture.componentInstance.pause();
    fixture.componentInstance.seek(-20);
    fixture.componentInstance.seek(2_000);
    expect(boundary.instances).toHaveLength(0);
    expect(time).not.toHaveBeenCalled();
    pending.resolve(events);
    await ready(fixture);
    const player = playerAt(0);
    const timeline = element<HTMLInputElement>(hostOf(fixture), 'input[aria-label="Timeline"]');
    expect(timeline.value).toBe('1000');
    expect(player.pause).toHaveBeenLastCalledWith(1_001);
    expect(time).toHaveBeenLastCalledWith(1_000);
    fixture.componentInstance.seek(-20);
    expect(player.pause).toHaveBeenLastCalledWith(1);
    expect(timeline.value).toBe('0');
    expect(time).toHaveBeenLastCalledWith(0);
  });

  it('相同输入和单改 initialTime 不重载，同轮 replay/session/initialTime 只产生新一代', async () => {
    const replay = createReplay();
    const fixture = await mount(replay);
    const component = fixture.componentInstance;
    await ready(fixture);
    const first = playerAt(0);
    fixture.componentRef.setInput('sessionId', 'session-one');
    fixture.componentRef.setInput('replay', replay);
    fixture.componentRef.setInput('initialTime', 300);
    await fixture.whenStable();
    expect(replay.readEvents).toHaveBeenCalledTimes(1);
    expect(boundary.instances).toHaveLength(1);
    expect(first.pause).toHaveBeenLastCalledWith(301);
    const next = createReplay();
    fixture.componentRef.setInput('replay', next);
    fixture.componentRef.setInput('sessionId', 'next-session');
    fixture.componentRef.setInput('initialTime', 600);
    await fixture.whenStable();
    await ready(fixture);
    expect(fixture.componentInstance).toBe(component);
    expect(next.readEvents).toHaveBeenCalledExactlyOnceWith('next-session');
    expect(next.listCommitMarkers).toHaveBeenCalledExactlyOnceWith('next-session');
    expect(first.destroy).toHaveBeenCalledTimes(1);
    expect(boundary.instances).toHaveLength(2);
    expect(playerAt(1).pause).toHaveBeenLastCalledWith(601);
  });

  it('真实 play/pause/tick/finish 切换控件，销毁取消帧且晚帧不再输出', async () => {
    const fixture = await mount(createReplay());
    await ready(fixture);
    const frames = new Map<number, FrameRequestCallback>();
    let frameId = 0;
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(callback => {
      const id = ++frameId;
      frames.set(id, callback);
      return id;
    });
    const cancel = vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(id => {
      frames.delete(id);
    });
    const player = playerAt(0);
    const time = vi.fn<(value: number) => void>();
    fixture.componentInstance.aoTimeChange.subscribe(time);
    const toggle = element<HTMLButtonElement>(hostOf(fixture), '.rxdb-replayer__toggle');
    fixture.componentInstance.play();
    expect(player.play).toHaveBeenLastCalledWith(1);
    expect(time).toHaveBeenLastCalledWith(1);
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(frames.size).toBe(1);
    fixture.componentInstance.pause();
    expect(player.pause).toHaveBeenLastCalledWith();
    expect(cancel).toHaveBeenLastCalledWith(1);
    expect(frames.size).toBe(0);
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    fixture.componentInstance.play();
    const tick = frames.get(frameId);
    if (!tick) throw new Error('缺播放帧');
    frames.delete(frameId);
    player.position = 700;
    tick(16);
    expect(time).toHaveBeenLastCalledWith(700);
    player.finish();
    expect(time).toHaveBeenLastCalledWith(1_000);
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    expect(frames.size).toBe(0);
    fixture.componentInstance.play();
    expect(player.play).toHaveBeenLastCalledWith(1);
    const late = frames.get(frameId);
    if (!late) throw new Error('缺待销毁帧');
    fixture.destroy();
    const count = time.mock.calls.length;
    late(32);
    fixture.componentInstance.play();
    fixture.componentInstance.pause();
    fixture.componentInstance.seek(500);
    // `fixture.destroy()` 里 `this.#mounted.set(false)` 这次 signal 写入，会让 Angular 自己的
    // 无 Zone 调度器（`scheduleCallbackWithRafRace`）额外登记一次全局 `requestAnimationFrame`，
    // 和 setTimeout 赛跑去通知一次变更检测——这与被测的播放帧循环无关，但同一个全局 spy 会把它也
    // 记进 `frames`。它靠自己那个 setTimeout（同样 0 延迟、先入队）在下一轮宏任务里自行
    // cancelAnimationFrame 收尾，所以这里要等一轮宏任务，才能把「Angular 框架自身的陪跑帧」
    // 和「核心播放器真的泄漏的帧」分开：若核心真的泄漏，settle 后 frames 仍不会清零。
    await settle();
    expect(time).toHaveBeenCalledTimes(count);
    expect(player.destroy).toHaveBeenCalledTimes(1);
    expect(frames.size).toBe(0);
    expect(hostOf(fixture).querySelector('.rxdb-replayer')).toBeNull();
  });

  it('restore 在途换 replay 后，旧拒绝结果不更新新 DOM 或回调', async () => {
    const pending = Promise.withResolvers<ReplayRestoreResult>();
    const fixture = await mount(createReplay({ restoreToCommit: () => pending.promise }));
    await ready(fixture);
    const first = playerAt(0);
    const output = vi.fn<(event: ReplayerCommitRestoreEvent) => void>();
    fixture.componentInstance.aoCommitRestore.subscribe(output);
    element<HTMLButtonElement>(hostOf(fixture), '[data-commit-id="commit-one"]').click();
    expect(element(hostOf(fixture), '[role="status"]').textContent).toBe('Restoring…');
    const next = createReplay();
    fixture.componentRef.setInput('replay', next);
    await fixture.whenStable();
    await ready(fixture);
    pending.reject(new Error('旧恢复失败'));
    await settle();
    expect(output).not.toHaveBeenCalled();
    expect(first.destroy).toHaveBeenCalledTimes(1);
    expect(playerAt(1).destroy).not.toHaveBeenCalled();
    expect(element(hostOf(fixture), '[role="status"]').textContent).toBe('');
    expect(state(fixture)).toBe('ready');
  });
});
