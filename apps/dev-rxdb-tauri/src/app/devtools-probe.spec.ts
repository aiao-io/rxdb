import { describe, expect, it, vi } from 'vitest';
import { watchDevToolsHandshake, type DevToolsEventSurface } from './devtools-probe';

/** 造一个可以手动投帧的事件面，并记录退订调用。 */
const surfaceOf = (): {
  surface: DevToolsEventSurface;
  emit: (frame: unknown) => void;
  unlisten: ReturnType<typeof vi.fn>;
} => {
  let handler: ((payload: { payload: string }) => void) | null = null;
  const unlisten = vi.fn();
  return {
    surface: {
      listen: (_event, next) => {
        handler = next;
        return Promise.resolve(unlisten);
      }
    },
    emit: frame => handler?.({ payload: typeof frame === 'string' ? frame : JSON.stringify(frame) }),
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
      handshakeCompleted: true
    });
    await Promise.resolve();
    expect(unlisten).toHaveBeenCalledOnce();
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
      handshakeCompleted: false
    });
    await Promise.resolve();
    expect(unlisten).toHaveBeenCalledOnce();
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
      handshakeCompleted: false
    });
  });
});
