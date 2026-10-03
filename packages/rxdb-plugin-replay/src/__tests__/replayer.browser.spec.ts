/**
 * @fileoverview 回放视图（`specs/005-us-909-session-replay/contracts/replayer-component.md` §1、§2，research D9）。
 *
 * @remarks
 * chromium 里用真 rrweb 录一段 DOM 变化（`#probe` 的文本 A → B → C），再交给 `mountReplayer` 回放：seek 到某一时刻时
 * 回放 iframe 里的 DOM 必须是那一刻的样子。`ReplayManager` 只用到读事件、读标记、恢复三个成员，这里给假的。
 */

import type { WorkingTreeRestoreResult } from '@aiao/rxdb-plugin-working-tree';
import type { eventWithTime } from '@rrweb/types';
import { record } from 'rrweb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { RxDBReplayError } from '../errors.js';
import { mountReplayer, type ReplayerHandle, type ReplayerOptions } from '../replayer/mount-replayer.js';
import type { ReplayCommitMarker, ReplayManager } from '../types.js';

/** 录制里每步之间的间隔（ms）：够 rrweb 把相邻两次变更分进不同时间戳。 */
const STEP = 150;

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

interface Recording {
  readonly events: eventWithTime[];
  /** `#probe` 变成 B / C 的那条增量事件相对录像起点的时刻。 */
  readonly offsets: { readonly b: number; readonly c: number };
}

/** rrweb `IncrementalSource.Mutation` 带文本变更的那条增量事件。 */
const isTextMutation = (event: eventWithTime): boolean =>
  event.type === 3 && 'texts' in event.data && event.data.source === 0 && event.data.texts.length > 0;

/** 真 rrweb 录一段：`#probe` 文本 A → B → C（改文本节点的 `data`，rrweb 记成 `texts` 变更）。 */
const recordProbe = async (): Promise<Recording> => {
  const probe = document.createElement('div');
  probe.id = 'probe';
  const text = document.createTextNode('A');
  probe.append(text);
  document.body.append(probe);
  const events: eventWithTime[] = [];
  const stop = record({ emit: event => events.push(event) });
  await sleep(STEP);
  text.data = 'B';
  await sleep(STEP);
  text.data = 'C';
  await sleep(STEP);
  stop?.();
  probe.remove();
  const start = events[0]?.timestamp ?? 0;
  const [b, c] = events.filter(isTextMutation).map(event => event.timestamp - start);
  if (b === undefined || c === undefined) throw new Error('录制里没找到两次文本变更');
  return { events, offsets: { b, c } };
};

const recording = await recordProbe();

const marker = (commitId: string, timestamp: number): ReplayCommitMarker => ({
  seq: 99,
  timestamp,
  commitId,
  branchId: 'main'
});

const fakeReplay = (overrides: Partial<ReplayManager> = {}) => {
  const replay = {
    readEvents: vi.fn(async () => recording.events),
    listCommitMarkers: vi.fn(async (): Promise<ReplayCommitMarker[]> => []),
    restoreToCommit: vi.fn(async (): Promise<WorkingTreeRestoreResult> => ({
      ok: true,
      restoredCount: 3,
      sessionId: 'r1',
      workingTreeRevision: 2
    })),
    ...overrides
  };
  return replay as typeof replay & ReplayManager;
};

let host: HTMLElement;
let handle: ReplayerHandle | undefined;

const mount = (options: Partial<ReplayerOptions> = {}) => {
  host = document.createElement('div');
  document.body.append(host);
  handle = mountReplayer(host, { replay: fakeReplay(), sessionId: 's1', ...options });
  return handle;
};

const root = () => host.querySelector<HTMLElement>('.rxdb-replayer');
const toggle = () => host.querySelector<HTMLButtonElement>('button.rxdb-replayer__toggle');
const timeline = () => host.querySelector<HTMLInputElement>('input[type=range][aria-label=Timeline]');
const statusRegion = () => host.querySelector<HTMLElement>('[role=status][aria-live=polite]');
const probeText = () =>
  host.querySelector<HTMLIFrameElement>('.rxdb-replayer__stage iframe')?.contentDocument?.querySelector('#probe')
    ?.textContent;
const ready = () => vi.waitFor(() => expect(root()?.dataset['state']).toBe('ready'));

afterEach(() => {
  handle?.destroy();
  handle = undefined;
  host.remove();
});

describe('四态', () => {
  it('加载中：data-state=loading，aria-busy=true', () => {
    mount({ replay: fakeReplay({ readEvents: () => new Promise(() => undefined) }) });

    expect(root()?.dataset['state']).toBe('loading');
    expect(root()?.getAttribute('aria-busy')).toBe('true');
  });

  it('读事件失败：role=alert 显示错误消息', async () => {
    mount({ replay: fakeReplay({ readEvents: async () => Promise.reject(new Error('disk gone')) }) });

    await vi.waitFor(() => expect(root()?.dataset['state']).toBe('error'));
    expect(host.querySelector('[role=alert]')?.textContent).toBe('disk gone');
    expect(root()?.hasAttribute('aria-busy')).toBe(false);
  });

  it('不足两条事件或没有全量快照：空态', async () => {
    const withoutSnapshot = recording.events.filter(event => event.type !== 2);
    mount({ replay: fakeReplay({ readEvents: async () => withoutSnapshot }) });

    await vi.waitFor(() => expect(root()?.dataset['state']).toBe('empty'));
    expect(host.querySelector('.rxdb-replayer__empty')?.textContent).toBe('No events to replay');
  });

  it('就绪：播放键、时间轴（max = 总时长）、回放根', async () => {
    mount();
    await ready();

    const total = (recording.events.at(-1)?.timestamp ?? 0) - (recording.events[0]?.timestamp ?? 0);
    expect(toggle()?.textContent).toBe('Play');
    expect(toggle()?.getAttribute('aria-pressed')).toBe('false');
    expect(Number(timeline()?.max)).toBe(total);
    expect(timeline()?.getAttribute('aria-valuetext')).toBe('00:00');
    expect(host.querySelector('.rxdb-replayer__stage .replayer-wrapper iframe')).not.toBeNull();
    expect(statusRegion()).not.toBeNull();
  });
});

describe('跳转与播放', () => {
  it('seek 到某一时刻，回放 iframe 的 DOM 就是那一刻的样子；onTimeChange 收到该时刻', async () => {
    const onTimeChange = vi.fn();
    const { b, c } = recording.offsets;
    mount({ onTimeChange });
    await ready();
    expect(probeText()).toBe('A');

    const middle = Math.round((b + c) / 2);
    handle?.seek(middle);
    expect(probeText()).toBe('B');
    expect(Number(timeline()?.value)).toBe(middle);
    expect(onTimeChange).toHaveBeenLastCalledWith(middle);

    // c 是最后一条事件，也就是总时长：落在末尾必须看到它
    handle?.seek(c + 1);
    expect(probeText()).toBe('C');
    expect(Number(timeline()?.value)).toBe(c);
    handle?.seek(0);
    expect(probeText()).toBe('A');
  });

  it('initialTime：就绪后落在该时刻；加载中调 seek 以最后一次为准', async () => {
    const { b, c } = recording.offsets;
    mount({ initialTime: c + 1 });
    handle?.seek(b + 1);
    await ready();

    expect(probeText()).toBe('B');
  });

  it('拖时间轴等价于 seek', async () => {
    const { c } = recording.offsets;
    mount();
    await ready();

    const slider = timeline();
    if (slider === null) throw new Error('no timeline');
    slider.value = String(c + 1);
    slider.dispatchEvent(new Event('input', { bubbles: true }));

    expect(probeText()).toBe('C');
    expect(slider.getAttribute('aria-valuetext')).toBe('00:00');
  });

  it('play → Pause / aria-pressed=true，时刻前进；播完回到 Play', async () => {
    const onTimeChange = vi.fn();
    mount({ onTimeChange });
    await ready();

    handle?.play();
    expect(toggle()?.textContent).toBe('Pause');
    expect(toggle()?.getAttribute('aria-pressed')).toBe('true');

    await vi.waitFor(() => expect(toggle()?.textContent).toBe('Play'), { timeout: 5_000 });
    expect(probeText()).toBe('C');
    const times = onTimeChange.mock.calls.map(([time]) => time as number);
    expect(times.length).toBeGreaterThan(1);
    expect(times).toEqual([...times].sort((x, y) => x - y));
  });

  it('播放中跳转、暂停后再跳转都落到目标时刻（回归：播放起点也要按同一偏移换算）', async () => {
    const { b, c } = recording.offsets;
    const middle = Math.round((b + c) / 2);
    mount();
    await ready();

    handle?.play();
    handle?.seek(middle);
    expect(probeText()).toBe('B');

    handle?.pause();
    handle?.seek(0);
    expect(probeText()).toBe('A');
    handle?.seek(middle);
    expect(probeText()).toBe('B');
  });

  it('pause 停在当前时刻；非就绪态 play / pause 是空操作', async () => {
    mount({ replay: fakeReplay({ readEvents: () => new Promise(() => undefined) }) });
    handle?.play();
    handle?.pause();
    expect(root()?.dataset['state']).toBe('loading');
    handle?.destroy();

    mount();
    await ready();
    handle?.play();
    handle?.pause();
    expect(toggle()?.textContent).toBe('Play');
    expect(toggle()?.getAttribute('aria-pressed')).toBe('false');
  });
});

describe('键盘', () => {
  it('Tab 到播放键按空格开始播放；时间轴可聚焦，方向键前进', async () => {
    mount();
    await ready();

    toggle()?.focus();
    await userEvent.keyboard(' ');
    expect(toggle()?.textContent).toBe('Pause');
    await userEvent.keyboard(' ');
    expect(toggle()?.textContent).toBe('Play');

    handle?.seek(0);
    timeline()?.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(Number(timeline()?.value)).toBeGreaterThan(0);
  });
});

describe('update / destroy', () => {
  it('换 sessionId 重新加载；只改 initialTime 等价于 seek，不重新读事件', async () => {
    const replay = fakeReplay();
    const { c } = recording.offsets;
    mount({ replay });
    await ready();

    handle?.update({ initialTime: c + 1 });
    expect(probeText()).toBe('C');
    expect(replay.readEvents).toHaveBeenCalledTimes(1);

    handle?.update({ sessionId: 's2' });
    expect(root()?.dataset['state']).toBe('loading');
    await ready();
    expect(replay.readEvents).toHaveBeenLastCalledWith('s2');
    expect(host.querySelectorAll('.rxdb-replayer__stage iframe')).toHaveLength(1);
  });

  it('换会话时旧会话的加载晚到，不覆盖新会话', async () => {
    let releaseOld: (events: eventWithTime[]) => void = () => undefined;
    const readEvents = vi.fn((sessionId: string) =>
      sessionId === 'old' ?
        new Promise<eventWithTime[]>(resolve => (releaseOld = resolve))
      : Promise.resolve(recording.events.filter(event => event.type !== 2))
    );
    mount({ replay: fakeReplay({ readEvents }), sessionId: 'old' });

    handle?.update({ sessionId: 'new' });
    await vi.waitFor(() => expect(root()?.dataset['state']).toBe('empty'));
    releaseOld(recording.events);
    await sleep(0);

    expect(root()?.dataset['state']).toBe('empty');
  });

  it('destroy 清空宿主、幂等；之后的调用都是空操作，加载晚到也不再渲染', async () => {
    let release: (events: eventWithTime[]) => void = () => undefined;
    mount({ replay: fakeReplay({ readEvents: () => new Promise(resolve => (release = resolve)) }) });

    handle?.destroy();
    handle?.destroy();
    handle?.play();
    handle?.seek(10);
    handle?.update({ sessionId: 's2' });
    release(recording.events);
    await sleep(0);

    expect(host.childElementCount).toBe(0);
  });
});

describe('commit 标记', () => {
  const start = recording.events[0]?.timestamp ?? 0;
  const markers = [
    marker('0123456789abcdef', start + recording.offsets.b + 1),
    marker('fedcba9876543210', start + 61_000)
  ];

  it('每个标记一个按钮：data-commit-id，文本「id 前 8 位 · mm:ss」', async () => {
    mount({ replay: fakeReplay({ listCommitMarkers: async () => markers }) });
    await ready();

    const buttons = [...host.querySelectorAll<HTMLButtonElement>('ul[aria-label=Commits] > li > button')];
    expect(buttons.map(button => button.dataset['commitId'])).toEqual(['0123456789abcdef', 'fedcba9876543210']);
    expect(buttons.map(button => button.textContent)).toEqual(['01234567 · 00:00', 'fedcba98 · 01:01']);
  });

  it('点标记：跳到标记时刻并暂停，调 restoreToCommit，状态区写结果并回调宿主', async () => {
    const onCommitRestore = vi.fn();
    const replay = fakeReplay({ listCommitMarkers: async () => markers });
    mount({ replay, onCommitRestore });
    await ready();
    handle?.play();

    host.querySelector<HTMLButtonElement>('[data-commit-id="0123456789abcdef"]')?.click();

    expect(probeText()).toBe('B');
    expect(toggle()?.textContent).toBe('Play');
    await vi.waitFor(() => expect(statusRegion()?.textContent).toBe('Restored 3 changes'));
    expect(replay.restoreToCommit).toHaveBeenCalledWith('0123456789abcdef');
    expect(onCommitRestore).toHaveBeenCalledWith({
      marker: markers[0],
      result: { ok: true, restoredCount: 3, sessionId: 'r1', workingTreeRevision: 2 }
    });
  });

  it('恢复被拒：状态区写提示', async () => {
    const replay = fakeReplay({
      listCommitMarkers: async () => markers,
      restoreToCommit: async () => ({ ok: false, reason: 'dirty_working_tree' })
    });
    mount({ replay });
    await ready();

    host.querySelector<HTMLButtonElement>('[data-commit-id="0123456789abcdef"]')?.click();

    await vi.waitFor(() =>
      expect(statusRegion()?.textContent).toBe(
        'There are uncommitted changes. Commit or discard them before restoring.'
      )
    );
  });

  it('restoreToCommit 抛错：状态区写错误消息，回调收到 reason: error', async () => {
    const onCommitRestore = vi.fn();
    const error = new RxDBReplayError('working_tree_unavailable', 'no working tree here');
    const replay = fakeReplay({
      listCommitMarkers: async () => markers,
      restoreToCommit: async () => Promise.reject(error)
    });
    mount({ replay, onCommitRestore });
    await ready();

    host.querySelector<HTMLButtonElement>('[data-commit-id="fedcba9876543210"]')?.click();

    await vi.waitFor(() => expect(statusRegion()?.textContent).toBe(error.message));
    expect(onCommitRestore).toHaveBeenCalledWith({ marker: markers[1], result: { ok: false, reason: 'error', error } });
  });
});
