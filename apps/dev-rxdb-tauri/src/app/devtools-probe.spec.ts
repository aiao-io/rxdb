import { describe, expect, it, vi } from 'vitest';
import {
  mergeDevToolsProbeRounds,
  watchDevToolsHandshake,
  type DevToolsEventSurface,
  type DevToolsProbeResult
} from './devtools-probe';

/**
 * 造一个可以手动投帧的事件面，并记录退订调用。
 *
 * @remarks
 * 按**事件名**分发，而不是记住最后一个 handler：观察者订的是两条独立通道
 * （帧 `devtools:message` 与驱动汇报 `devtools:drive-result`），共用一个槽位的话，
 * 后订的那条会把先订的挤掉，而症状是「投了帧却没人收」——一个与被测代码无关的假故障。
 */
const surfaceOf = (): {
  surface: DevToolsEventSurface;
  emit: (frame: unknown) => void;
  emitNative: (result: unknown) => void;
  unlisten: ReturnType<typeof vi.fn>;
} => {
  const handlers = new Map<string, (message: { payload: never }) => void>();
  const unlisten = vi.fn();
  const deliver = (event: string, payload: unknown) =>
    handlers.get(event)?.({ payload: payload as never });
  return {
    surface: {
      listen: (event, next) => {
        handlers.set(event, next as (message: { payload: never }) => void);
        return Promise.resolve(unlisten);
      }
    },
    emit: frame =>
      deliver('devtools:message', typeof frame === 'string' ? frame : JSON.stringify(frame)),
    emitNative: result => deliver('devtools:drive-result', result),
    unlisten
  };
};

describe('watchDevToolsHandshake', () => {
  it('收到 HANDSHAKE_ACK 就立刻结束这一轮，并交出 session id 与去重后的类型', async () => {
    const { surface, emit, unlisten } = surfaceOf();
    const watcher = watchDevToolsHandshake(surface);
    const round = watcher.waitForHandshake(60_000);
    // 等监听真的挂上去：`listen` 是异步的，抢在它之前投帧会全部落空。
    await Promise.resolve();

    emit({ type: 'PROTOCOL_HELLO', payload: null });
    emit({ type: 'PROTOCOL_HELLO', payload: null });
    emit({ type: 'HANDSHAKE_ACK', payload: { sessionId: 'session-a' } });

    // 预算给了 60s，用例却能立刻拿到结果——这本身就是「握上手就结束这一轮」的判据。
    await expect(round).resolves.toBe(1);
    expect(watcher.settle()).toEqual({
      panelFrameTypes: ['PROTOCOL_HELLO', 'HANDSHAKE_ACK'],
      sessionIds: ['session-a'],
      handshakeCompleted: true,
      // 观察者不管冒名窗口那一趟，恒报 0；真实值由调用方在拿到探测结果后补上。
      relayRejected: 0
    });
    await Promise.resolve();
    // 两条通道各退一次：帧与驱动汇报是分开订的（见 surfaceOf 的说明）。
    expect(unlisten).toHaveBeenCalledTimes(2);
  });

  /**
   * US-905 阶段 1 AC#4：同 label 重开之后是**另一个** session，两个都要留在报告里。
   *
   * 只记最后一个的话，「换了」与「一直是同一个」在报告里长得完全一样——而后者正是这条 AC
   * 要抓的缺陷（Electron 侧 US-904 AC#51 上真的发生过）。
   */
  it('连等两轮握手，交出两个不同的 session id', async () => {
    const { surface, emit } = surfaceOf();
    const watcher = watchDevToolsHandshake(surface);

    const first = watcher.waitForHandshake(60_000);
    await Promise.resolve();
    emit({ type: 'HANDSHAKE_ACK', payload: { sessionId: 'session-a' } });
    await expect(first).resolves.toBe(1);

    const second = watcher.waitForHandshake(60_000);
    // 同一个 session 的重发不算新一轮——数的是不同身份。
    emit({ type: 'HANDSHAKE_ACK', payload: { sessionId: 'session-a' } });
    emit({ type: 'HANDSHAKE_ACK', payload: { sessionId: 'session-b' } });
    await expect(second).resolves.toBe(2);

    expect(watcher.settle().sessionIds).toEqual(['session-a', 'session-b']);
  });

  it('预算内没握上手就如实报 0，并且照样退订', async () => {
    const { surface, emit, unlisten } = surfaceOf();
    const watcher = watchDevToolsHandshake(surface);
    const round = watcher.waitForHandshake(5);
    await Promise.resolve();
    emit({ type: 'PROTOCOL_HELLO', payload: null });

    // 关键在于它**解决**而不是抛：没握上手是一条要如实上报的事实，
    // 抛出去会被上层落成 `status: 'failed'`，与「探针本身坏了」混成一个结论。
    await expect(round).resolves.toBe(0);
    expect(watcher.settle()).toEqual({
      panelFrameTypes: ['PROTOCOL_HELLO'],
      sessionIds: [],
      handshakeCompleted: false,
      relayRejected: 0
    });
    await Promise.resolve();
    // 两条通道各退一次：帧与驱动汇报是分开订的（见 surfaceOf 的说明）。
    expect(unlisten).toHaveBeenCalledTimes(2);
  });

  it('解不动的帧与缺 sessionId 的 ACK 都不算握手', async () => {
    const { surface, emit } = surfaceOf();
    const watcher = watchDevToolsHandshake(surface);
    const round = watcher.waitForHandshake(5);
    await Promise.resolve();

    emit('not json at all');
    emit({ payload: { sessionId: 'x' } }); // 没有 type
    emit({ type: 'HANDSHAKE_ACK', payload: {} }); // 有 type 没 sessionId

    // 探针不替协议层做判定：形状不对就跳过，绝不"猜一个"session id 出来。
    await expect(round).resolves.toBe(0);
    expect(watcher.settle()).toEqual({
      panelFrameTypes: ['HANDSHAKE_ACK'],
      sessionIds: [],
      handshakeCompleted: false,
      relayRejected: 0
    });
  });
});

describe('watchDevToolsHandshake — 驱动汇报通道（US-905 阶段 2）', () => {
  it('把驱动汇报的结论交给 waitForNative，并带进快照', async () => {
    const { surface, emitNative } = surfaceOf();
    const watcher = watchDevToolsHandshake(surface);
    const pending = watcher.waitForNative(50);

    // 通道是独立的：驱动的结论不是协议帧，混进帧通道会让 `panelFrameTypes` 多出一个
    // 不存在的「帧类型」，而那份列表是 AC#2 的证据。
    await Promise.resolve();
    emitNative({ sessionSeen: true, filesList: 'ok', settingsExport: 'export_unsupported' });

    await expect(pending).resolves.toMatchObject({ sessionSeen: true, filesList: 'ok' });
    expect(watcher.settle().native).toMatchObject({ settingsExport: 'export_unsupported' });
    // 驱动的汇报不该被当成一帧协议消息记进去。
    expect(watcher.settle().panelFrameTypes).toEqual([]);
  });

  it('先到的阶段打点不结束等待', async () => {
    const { surface, emitNative } = surfaceOf();
    const watcher = watchDevToolsHandshake(surface);
    const pending = watcher.waitForNative(80);

    await Promise.resolve();
    // 打点先到：它不能把等待提前结束掉——那样拿回去的「结论」里每个字段都是 undefined，
    // 与「驱动压根没跑」长得一模一样。这条竞态实测发生过（同一份代码一次红一次绿）。
    emitNative({ sessionSeen: false, failure: 'stage:listening' });
    await Promise.resolve();
    emitNative({ sessionSeen: true, createDirectory: 'ok' });

    await expect(pending).resolves.toMatchObject({ sessionSeen: true, createDirectory: 'ok' });
    expect(watcher.settle().native).toMatchObject({ sessionSeen: true, createDirectory: 'ok' });
  });

  it('只收到阶段打点时，快照里留的是那条打点', async () => {
    const { surface, emitNative } = surfaceOf();
    const watcher = watchDevToolsHandshake(surface);
    const pending = watcher.waitForNative(30);

    await Promise.resolve();
    emitNative({ sessionSeen: false, failure: 'stage:booted' });

    // 一条结论都没有时，打点就是仅有的观察——「卡在 booted」因此是可读的结论，
    // 而不是一个什么都没有的 undefined。
    await expect(pending).resolves.toMatchObject({ failure: 'stage:booted' });
    expect(watcher.settle().native).toMatchObject({ failure: 'stage:booted' });
  });

  /**
   * US-905 阶段 2 AC#15：一个进程里驱动会跑**不止一遍**，快照必须留第一遍那份。
   *
   * @remarks
   * 探针为了 AC#4 会把调试窗口关掉再以同 label 重开，而重开的那扇窗又带着同一份注入脚本。
   * 第二遍看到的世界**已经被第一遍改过**——它的观察因此不是独立证据：
   * 「重启之后那个目录还在」与「本进程第一遍刚把它建出来」在第二遍眼里完全同形。
   *
   * 只有第一遍的前置条件是已知的（这个进程还没碰过存储），所以跨重启比对只能读它。
   */
  it('驱动在一个进程里跑了两遍时，快照留的是第一遍的结论', async () => {
    const { surface, emitNative } = surfaceOf();
    const watcher = watchDevToolsHandshake(surface);
    const pending = watcher.waitForNative(80);

    await Promise.resolve();
    emitNative({ sessionSeen: true, keptDirSeen: false, filesEntryCount: 3 });
    await expect(pending).resolves.toMatchObject({ keptDirSeen: false });

    // 第二扇窗口的驱动跑完，报的是被第一遍改过之后的世界。
    emitNative({ sessionSeen: true, keptDirSeen: true, filesEntryCount: 4 });

    expect(watcher.settle().native).toMatchObject({ keptDirSeen: false, filesEntryCount: 3 });
  });

  /**
   * 结论之后到的打点不得顶掉结论。
   *
   * @remarks
   * `settle()` 紧跟在 `waitForNative()` 之后，而两者之间隔着一次 `await`——第二扇窗口的
   * 驱动刚好在这条缝里发出 `stage:booted` 的话，交出去的「结论」每个字段都是 undefined。
   * 这与上一条是同一个竞态的两半：等待不被打点提前结束，快照也不被打点事后覆盖。
   */
  it('结论之后到的阶段打点不会顶掉结论', async () => {
    const { surface, emitNative } = surfaceOf();
    const watcher = watchDevToolsHandshake(surface);
    const pending = watcher.waitForNative(80);

    await Promise.resolve();
    emitNative({ sessionSeen: true, filesList: 'ok' });
    await expect(pending).resolves.toMatchObject({ filesList: 'ok' });

    emitNative({ sessionSeen: false, failure: 'stage:booted' });

    expect(watcher.settle().native).toMatchObject({ filesList: 'ok' });
    expect(watcher.settle().native?.failure ?? null).toBeNull();
  });

  it('预算内没等到汇报就返回 undefined，而不是编一份空结论', async () => {
    const { surface } = surfaceOf();
    const watcher = watchDevToolsHandshake(surface);

    // `undefined` 与 `{ sessionSeen: false }` 是两个结论：前者说明驱动根本没装上，
    // 后者说明装上了但没等到握手。编一份空的会把前者伪装成后者。
    await expect(watcher.waitForNative(10)).resolves.toBeUndefined();
    expect(watcher.settle().native).toBeUndefined();
  });
});

/** 一份最小快照；每条用例只覆盖它关心的字段。 */
const snapshot = (patch: Partial<DevToolsProbeResult> = {}): DevToolsProbeResult => ({
  panelFrameTypes: [],
  sessionIds: [],
  handshakeCompleted: false,
  relayRejected: 0,
  ...patch
});

describe('mergeDevToolsProbeRounds', () => {
  it('把两侧的帧类型并起来去重，session id 按发生顺序接上', () => {
    const merged = mergeDevToolsProbeRounds(
      snapshot({
        panelFrameTypes: ['PROTOCOL_HELLO', 'HANDSHAKE_ACK'],
        sessionIds: ['a', 'b'],
        handshakeCompleted: true
      }),
      snapshot({ panelFrameTypes: ['HANDSHAKE_ACK', 'PANEL_READY'], sessionIds: ['c'], handshakeCompleted: true })
    );

    expect(merged.panelFrameTypes).toEqual(['PROTOCOL_HELLO', 'HANDSHAKE_ACK', 'PANEL_READY']);
    expect(merged.sessionIds).toEqual(['a', 'b', 'c']);
  });

  it('刷新后没重连不会抹掉「刷新前确实握上过」这条事实', () => {
    const merged = mergeDevToolsProbeRounds(snapshot({ sessionIds: ['a'], handshakeCompleted: true }), snapshot());

    // 写成 before && after 的话，这里会是 false——而第一轮握手是 AC#2 的证据。
    expect(merged.handshakeCompleted).toBe(true);
  });

  it('冒名窗口的拒帧数只认刷新前那一份', () => {
    const merged = mergeDevToolsProbeRounds(snapshot({ relayRejected: 2 }), snapshot({ relayRejected: 9 }));

    // 冒名窗口那一趟整个发生在刷新之前，刷新后的观察者不可能数到它。
    expect(merged.relayRejected).toBe(2);
  });

  /**
   * 刷新之后到达的结论是**后一代**驱动的掉队汇报，不得顶掉带过来的那一份。
   *
   * @remarks
   * 探针为 AC#4 回收调试窗口之后，重开的那扇窗会再跑一遍驱动；主窗口刷新与它跑完谁先谁后
   * 没有保证。晚到的那一份落在刷新后的观察者上，而它看到的世界已经被第一代改过——
   * `keptDirSeen` 因此恒为 `true`，AC#15 的跨重启比对失去判别力。
   */
  it('刷新后到达的结论不会顶掉刷新前带过来的那一份', () => {
    const merged = mergeDevToolsProbeRounds(
      snapshot({ native: { sessionSeen: true, keptDirSeen: false, filesEntryCount: 1 } }),
      snapshot({ native: { sessionSeen: true, keptDirSeen: true, filesEntryCount: 2 } })
    );

    expect(merged.native).toEqual({ sessionSeen: true, keptDirSeen: false, filesEntryCount: 1 });
  });

  it('刷新前一条结论都没有时就报没有，不拿掉队的那一份充数', () => {
    const merged = mergeDevToolsProbeRounds(
      snapshot(),
      snapshot({ native: { sessionSeen: true, keptDirSeen: true } })
    );

    // 「这一代没跑出结论」与「另一代跑出来了」是两件事；混起来的那份快照没人能反推回去。
    expect(merged.native).toBeUndefined();
  });
});
