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
  it('收到 HANDSHAKE_ACK 就立刻结束，并交出 session id 与去重后的类型', async () => {
    const { surface, emit, unlisten } = surfaceOf();
    const probing = watchDevToolsHandshake(surface).settle(60_000);
    // 等监听真的挂上去：`listen` 是异步的，抢在它之前投帧会全部落空。
    await Promise.resolve();

    emit({ type: 'PROTOCOL_HELLO', payload: null });
    emit({ type: 'PROTOCOL_HELLO', payload: null });
    emit({ type: 'HANDSHAKE_ACK', payload: { sessionId: 'session-a' } });

    // 预算给了 60s，用例却能立刻拿到结果——这本身就是「握上手就结束」的判据。
    await expect(probing).resolves.toEqual({
      panelFrameTypes: ['PROTOCOL_HELLO', 'HANDSHAKE_ACK'],
      sessionId: 'session-a',
      handshakeCompleted: true
    });
    expect(unlisten).toHaveBeenCalledOnce();
  });

  it('预算内没握上手就如实报 false，并且照样退订', async () => {
    const { surface, emit, unlisten } = surfaceOf();
    const probing = watchDevToolsHandshake(surface).settle(5);
    await Promise.resolve();
    emit({ type: 'PROTOCOL_HELLO', payload: null });

    // 关键在于它**解决**而不是抛：没握上手是一条要如实上报的事实，
    // 抛出去会被上层落成 `status: 'failed'`，与「探针本身坏了」混成一个结论。
    await expect(probing).resolves.toEqual({
      panelFrameTypes: ['PROTOCOL_HELLO'],
      sessionId: null,
      handshakeCompleted: false
    });
    expect(unlisten).toHaveBeenCalledOnce();
  });

  it('解不动的帧与缺 sessionId 的 ACK 都不算握手', async () => {
    const { surface, emit } = surfaceOf();
    const probing = watchDevToolsHandshake(surface).settle(5);
    await Promise.resolve();

    emit('not json at all');
    emit({ payload: { sessionId: 'x' } }); // 没有 type
    emit({ type: 'HANDSHAKE_ACK', payload: {} }); // 有 type 没 sessionId

    // 探针不替协议层做判定：形状不对就跳过，绝不"猜一个"session id 出来。
    await expect(probing).resolves.toEqual({
      panelFrameTypes: ['HANDSHAKE_ACK'],
      sessionId: null,
      handshakeCompleted: false
    });
  });
});
