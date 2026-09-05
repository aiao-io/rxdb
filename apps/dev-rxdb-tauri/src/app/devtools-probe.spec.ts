import { describe, expect, it, vi } from 'vitest';
import { watchDevToolsHandshake, type DevToolsEventSurface } from './devtools-probe';

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

  it('阶段打点不结束等待，但仍然进快照', async () => {
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
    // 但打点本身要留得住：驱动真卡住时，最后那个 stage 是唯一的线索。
    expect(watcher.settle().native).toMatchObject({ sessionSeen: true });
  });

  it('只收到阶段打点时，快照里留的是那条打点', async () => {
    const { surface, emitNative } = surfaceOf();
    const watcher = watchDevToolsHandshake(surface);
    const pending = watcher.waitForNative(30);

    await Promise.resolve();
    emitNative({ sessionSeen: false, failure: 'stage:booted' });

    // 等待照常耗满预算并返回最新那条（它就是打点）——「卡在 booted」因此是可读的结论，
    // 而不是一个什么都没有的 undefined。
    await expect(pending).resolves.toMatchObject({ failure: 'stage:booted' });
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
