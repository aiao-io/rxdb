import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  alice,
  bob,
  credentialFor,
  delay,
  LinkedTransport,
  linkedTransports,
  openSessionPair,
  sessionOptions,
  verifyCredential
} from '../fixtures.js';
import { P2PRequestError } from '../../session/errors.js';
import { decodeP2PFrame, encodeP2PFrame, P2P_SESSION_VERSION, type P2PFrame } from '../../session/frame.js';
import type { P2PPeerIdentity } from '../../session/identity.js';
import { openP2PSession, type P2PProtocol } from '../../session/session.js';

const empty = new Uint8Array(0);

/** 原样回显参数与负载的协议。 */
const echo = (overrides: Partial<P2PProtocol> = {}): P2PProtocol => ({
  name: 'echo',
  version: 1,
  handle: ({ params, payload }) => ({ result: params, payload }),
  ...overrides
});

/** 一直不应答的协议。 */
const hang = (): P2PProtocol => echo({ handle: () => new Promise<never>(() => undefined) });

const helloFrom = (identity: P2PPeerIdentity, protocols: Record<string, number> = { echo: 1 }): Uint8Array =>
  encodeP2PFrame({
    kind: 'hello',
    session: P2P_SESSION_VERSION,
    instanceId: identity.instanceId,
    credential: credentialFor(identity, 'c1'),
    protocols
  });

const request = (id: number, protocol = 'echo', method = 'echo'): Uint8Array =>
  encodeP2PFrame({ kind: 'request', id, protocol, method, params: null, payload: empty });

/** 从原始通道读帧，跳过 hello / ping 等，直到读到指定类型。 */
const nextFrameOfKind = async (transport: LinkedTransport, kind: P2PFrame['kind']): Promise<P2PFrame> => {
  for (;;) {
    const frame = decodeP2PFrame(await transport.receive());
    if (frame?.kind === kind) return frame;
  }
};

/** 一端是会话、另一端是手工收发帧的原始通道，用来构造违反协议的对端。 */
const sessionWithRawPeer = (protocols: readonly P2PProtocol[] = [echo()]) => {
  const [transport, raw] = linkedTransports();
  const session = openP2PSession(sessionOptions(transport, alice, { protocols }));
  return { session, transport, raw };
};

afterEach(() => {
  vi.useRealTimers();
});

describe('P2P 会话：hello 与认证', () => {
  it('双方交换 hello 后就绪：得到认证过的对端身份，只有两端同版本的协议算支持', async () => {
    const [left, right] = openSessionPair({
      left: { protocols: [echo(), echo({ name: 'files' }), echo({ name: 'versioned', version: 1 })] },
      right: { protocols: [echo(), echo({ name: 'other' }), echo({ name: 'versioned', version: 2 })] }
    });
    expect(left.state).toBe('connecting');
    await expect(left.ready).resolves.toEqual(bob);
    await expect(right.ready).resolves.toEqual(alice);
    expect(left.peer).toEqual(bob);
    expect(left.state).toBe('ready');
    expect(['echo', 'files', 'other', 'versioned'].map(name => left.supports(name))).toEqual([
      true,
      false,
      false,
      false
    ]);
    await left.close();
    await right.close();
  });

  it('凭据未通过认证：在 hello 阶段拒绝，对端只得到通用原因，不调用任何处理函数', async () => {
    const handle = vi.fn(() => ({}));
    const [left, right] = openSessionPair({
      left: { protocols: [echo({ handle })] },
      right: { protocols: [echo({ handle })], authenticate: () => null }
    });
    await expect(right.ready).rejects.toMatchObject({ code: 'unauthorized' });
    await expect(right.closed).resolves.toMatchObject({ code: 'unauthorized' });
    await expect(left.closed).resolves.toMatchObject({ code: 'peer_closed', peerReason: 'unauthorized' });
    await expect(left.request('echo', { method: 'echo' })).rejects.toMatchObject({ code: 'peer_closed' });
    expect(handle).not.toHaveBeenCalled();
  });

  it('认证钩子抛错同样按未通过处理', async () => {
    const [left, right] = openSessionPair({
      right: {
        authenticate: () => {
          throw new Error('auth host unreachable');
        }
      }
    });
    await expect(right.closed).resolves.toMatchObject({ code: 'unauthorized' });
    await expect(left.closed).resolves.toMatchObject({ peerReason: 'unauthorized' });
  });

  it('凭据绑定连接：别的连接的凭据重放到这里被拒', async () => {
    const authenticate = vi.fn(verifyCredential);
    const [left, right] = openSessionPair({
      left: { connectionId: 'c2', credential: credentialFor(alice, 'c1') },
      right: { connectionId: 'c2', authenticate }
    });
    await expect(right.closed).resolves.toMatchObject({ code: 'unauthorized' });
    await expect(left.closed).resolves.toMatchObject({ code: 'peer_closed', peerReason: 'unauthorized' });
    expect(authenticate).toHaveBeenCalledWith(credentialFor(alice, 'c1'), { connectionId: 'c2' });
  });

  it('会话协议版本不一致即判不兼容，并关闭底层传输', async () => {
    const { session, transport, raw } = sessionWithRawPeer();
    await raw.send(
      encodeP2PFrame({
        kind: 'hello',
        session: 99,
        instanceId: 'x',
        credential: credentialFor(bob, 'c1'),
        protocols: {}
      })
    );
    await expect(session.closed).resolves.toMatchObject({ code: 'incompatible' });
    await session.close();
    expect(transport.closed).toBe(true);
  });

  it('第一帧不是 hello、或就绪后再发 hello，都判违反协议', async () => {
    const first = sessionWithRawPeer();
    await first.raw.send(encodeP2PFrame({ kind: 'ping' }));
    await expect(first.session.closed).resolves.toMatchObject({ code: 'protocol_violation' });

    const second = sessionWithRawPeer();
    await second.raw.send(helloFrom(bob));
    await second.session.ready;
    await second.raw.send(helloFrom(bob));
    await expect(second.session.closed).resolves.toMatchObject({ code: 'protocol_violation' });
  });

  it('对端迟迟不发 hello：超时判失联', async () => {
    vi.useFakeTimers();
    const [transport] = linkedTransports();
    const session = openP2PSession(sessionOptions(transport, alice, { helloTimeoutMs: 1000 }));
    await vi.advanceTimersByTimeAsync(999);
    expect(session.state).toBe('connecting');
    await vi.advanceTimersByTimeAsync(1);
    await expect(session.closed).resolves.toMatchObject({ code: 'peer_lost' });
    await expect(session.ready).rejects.toMatchObject({ code: 'peer_lost' });
  });

  it('对端验证凭据期间照常发心跳：本端不会把还在握手的对端判成失联', async () => {
    vi.useFakeTimers();
    const heartbeat = { heartbeatIntervalMs: 100, heartbeatTimeoutMs: 300 };
    let approve!: () => void;
    const approved = new Promise<void>(resolve => (approve = resolve));
    const [left, right] = openSessionPair({
      left: { ...heartbeat, protocols: [echo()] },
      right: {
        ...heartbeat,
        protocols: [echo()],
        authenticate: async (credential, context) => {
          await approved;
          return verifyCredential(credential, context);
        }
      }
    });
    await left.ready;
    await vi.advanceTimersByTimeAsync(2_000);
    expect([left.state, right.state]).toEqual(['ready', 'connecting']);
    approve();
    await expect(right.ready).resolves.toEqual(alice);
    await expect(left.request('echo', { method: 'echo', params: 1 })).resolves.toMatchObject({ result: 1 });
    const closing = Promise.all([left.close(), right.close()]);
    await vi.advanceTimersByTimeAsync(1_000);
    await closing;
  });

  it('认证钩子迟迟不兑现：握手时限一到即以 unauthorized 结束并告知对端，不留悬挂的会话', async () => {
    vi.useFakeTimers();
    const heartbeat = { heartbeatIntervalMs: 100, heartbeatTimeoutMs: 300 };
    const [left, right] = openSessionPair({
      left: heartbeat,
      right: { ...heartbeat, helloTimeoutMs: 1_000, authenticate: () => new Promise<never>(() => undefined) }
    });
    await left.ready;
    await vi.advanceTimersByTimeAsync(999);
    expect([left.state, right.state]).toEqual(['ready', 'connecting']);
    await vi.advanceTimersByTimeAsync(1);
    expect(right.state).toBe('closed');
    await expect(right.closed).resolves.toMatchObject({
      code: 'unauthorized',
      message: 'peer credential was not verified in time'
    });
    await expect(right.ready).rejects.toMatchObject({ code: 'unauthorized' });
    await expect(left.closed).resolves.toMatchObject({ code: 'peer_closed', peerReason: 'unauthorized' });
  });

  it('就绪前关闭：ready 以关闭原因拒绝', async () => {
    const [transport] = linkedTransports();
    const session = openP2PSession(sessionOptions(transport, alice));
    await session.close();
    await expect(session.ready).rejects.toMatchObject({ code: 'closed' });
    expect(session.state).toBe('closed');
  });
});

describe('P2P 会话：请求复用', () => {
  it('同一会话上双向并发请求，应答按请求号对应', async () => {
    const [left, right] = openSessionPair({ left: { protocols: [echo()] }, right: { protocols: [echo()] } });
    const fromLeft = Array.from({ length: 5 }, (_, index) =>
      left.request('echo', { method: 'echo', params: index, payload: Uint8Array.of(index) })
    );
    const fromRight = Array.from({ length: 5 }, (_, index) =>
      right.request('echo', { method: 'echo', params: `r${index}` })
    );
    await expect(Promise.all(fromLeft)).resolves.toEqual(
      Array.from({ length: 5 }, (_, index) => ({ result: index, payload: Uint8Array.of(index) }))
    );
    await expect(Promise.all(fromRight)).resolves.toEqual(
      Array.from({ length: 5 }, (_, index) => ({ result: `r${index}`, payload: empty }))
    );
    await left.close();
    await right.close();
  });

  it('请求对端不支持的协议：本端直接得到 unsupported，会话照常可用', async () => {
    const [left, right] = openSessionPair({
      left: { protocols: [echo(), echo({ name: 'files' })] },
      right: { protocols: [echo()] }
    });
    await expect(left.request('files', { method: 'read' })).rejects.toMatchObject({
      name: 'P2PRequestError',
      code: 'unsupported'
    });
    await expect(left.request('echo', { method: 'echo', params: 1 })).resolves.toMatchObject({ result: 1 });
    await left.close();
    await right.close();
  });

  it('对端发来未协商协议的请求：应答 unsupported，会话不断', async () => {
    const { session, raw } = sessionWithRawPeer();
    await raw.send(helloFrom(bob));
    await session.ready;
    await raw.send(request(0, 'nope'));
    await expect(nextFrameOfKind(raw, 'error')).resolves.toMatchObject({ id: 0, code: 'unsupported' });
    expect(session.state).toBe('ready');
    await session.close();
  });

  it('处理函数抛 P2PRequestError 时按其 code 应答，其它错误按 internal 应答', async () => {
    const failing = echo({
      handle: ({ method }) => {
        throw method === 'deny' ? new P2PRequestError('unauthorized', 'not for you') : new Error('boom');
      }
    });
    const [left, right] = openSessionPair({ left: { protocols: [failing] }, right: { protocols: [failing] } });
    await expect(left.request('echo', { method: 'deny' })).rejects.toMatchObject({
      code: 'unauthorized',
      message: 'not for you'
    });
    await expect(left.request('echo', { method: 'other' })).rejects.toMatchObject({
      code: 'internal',
      message: 'boom'
    });
    await left.close();
    await right.close();
  });

  it('未知帧类型被忽略：较新版本的对端不会让会话断开', async () => {
    const { session, raw } = sessionWithRawPeer();
    await raw.send(helloFrom(bob));
    await session.ready;
    const unknown = new TextEncoder().encode(JSON.stringify({ kind: 'stream-data', id: 1, payloadLength: 0 }));
    const header = new Uint8Array(4);
    new DataView(header.buffer).setUint32(0, unknown.byteLength);
    await raw.send(Uint8Array.from([...header, ...unknown]));
    await raw.send(request(0));
    await expect(nextFrameOfKind(raw, 'response')).resolves.toMatchObject({ id: 0, result: null });
    expect(session.state).toBe('ready');
    await session.close();
  });

  it('取消请求：对端处理函数收到中止信号，取消后的应答不再发出', async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => (release = resolve));
    const signals: AbortSignal[] = [];
    const slow = echo({
      handle: async ({ signal }) => {
        signals.push(signal);
        await gate;
        return { result: 'late' };
      }
    });
    const [lt, rt] = linkedTransports();
    const [left, right] = openSessionPair({
      transports: [lt, rt],
      left: { protocols: [slow] },
      right: { protocols: [slow] }
    });
    const controller = new AbortController();
    const pending = left.request('echo', { method: 'slow' }, controller.signal);
    await vi.waitFor(() => expect(signals).toHaveLength(1));
    controller.abort(new Error('request timed out'));
    await expect(pending).rejects.toThrow('request timed out');
    await vi.waitFor(() => expect(signals[0].aborted).toBe(true));
    release();
    await delay(5);
    expect(rt.sentFrames.map(frame => decodeP2PFrame(frame)?.kind)).not.toContain('response');
    await expect(left.request('echo', { method: 'slow' })).resolves.toMatchObject({ result: 'late' });
    await left.close();
    await right.close();
  });

  it('入站请求按协议限并发，超出的排队等候而不是拒绝', async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => (release = resolve));
    let calls = 0;
    const gated = echo({
      maxConcurrentRequests: 1,
      handle: async () => {
        calls += 1;
        await gate;
        return { result: calls };
      }
    });
    const [left, right] = openSessionPair({ left: { protocols: [gated] }, right: { protocols: [gated] } });
    const replies = [left.request('echo', { method: 'a' }), left.request('echo', { method: 'b' })];
    await delay(5);
    expect(calls).toBe(1);
    release();
    await expect(Promise.all(replies)).resolves.toHaveLength(2);
    expect(calls).toBe(2);
    await left.close();
    await right.close();
  });

  it('慢接收端占住入站名额：应答发不出去时不再调用处理函数', async () => {
    let calls = 0;
    const counting = echo({
      handle: () => {
        calls += 1;
        return { payload: Uint8Array.of(1) };
      }
    });
    const [lt, rt] = linkedTransports();
    const [left, right] = openSessionPair({
      transports: [lt, rt],
      left: { protocols: [counting] },
      right: { protocols: [counting] }
    });
    await Promise.all([left.ready, right.ready]);
    rt.sendGate = new Promise<void>(() => undefined);
    const replies = Array.from({ length: 20 }, () => left.request('echo', { method: 'read' }).catch(() => undefined));
    await delay(5);
    expect(calls).toBe(8);
    await left.close();
    await Promise.all(replies);
  });

  it('对端未完成请求超过协议上限即结束会话并关闭底层传输', async () => {
    const { session, transport, raw } = sessionWithRawPeer([hang()]);
    await raw.send(helloFrom(bob));
    await session.ready;
    for (let id = 0; id < 40; id += 1) await raw.send(request(id));
    await expect(session.closed).resolves.toMatchObject({ code: 'protocol_violation' });
    await session.close();
    expect(transport.closed).toBe(true);
  });

  it('对端洪泛未协商协议的请求、又不读应答：错误应答占满未完成请求名额即判违反协议', async () => {
    const { session, transport, raw } = sessionWithRawPeer();
    await raw.send(helloFrom(bob));
    await session.ready;
    let open!: () => void;
    transport.sendGate = new Promise<void>(resolve => (open = resolve));
    for (let id = 0; id < 40; id += 1) await raw.send(request(id, 'nope'));
    await delay(5);
    expect(session.state).toBe('closed');
    await expect(session.closed).resolves.toMatchObject({ code: 'protocol_violation' });
    transport.sendGate = undefined;
    open();
    await session.close();
  });

  it('未协商协议的请求同样计入未完成请求上限：逐批等到应答的对端不受影响', async () => {
    const { session, raw } = sessionWithRawPeer();
    await raw.send(helloFrom(bob));
    await session.ready;
    for (let batch = 0; batch < 3; batch += 1) {
      for (let index = 0; index < 32; index += 1) await raw.send(request(batch * 32 + index, 'nope'));
      for (let index = 0; index < 32; index += 1) await nextFrameOfKind(raw, 'error');
    }
    expect(session.state).toBe('ready');
    await session.close();
  });

  it('同一请求号还在处理时再次出现即判违反协议', async () => {
    const { session, raw } = sessionWithRawPeer([hang()]);
    await raw.send(helloFrom(bob));
    await session.ready;
    await raw.send(request(3));
    await raw.send(request(3));
    await expect(session.closed).resolves.toMatchObject({ code: 'protocol_violation' });
  });

  it('畸形帧结束会话：关闭底层传输，经 closed 报告原因，挂起的请求被拒', async () => {
    const { session, transport, raw } = sessionWithRawPeer();
    await raw.send(helloFrom(bob));
    await session.ready;
    const pending = session.request('echo', { method: 'echo' });
    await raw.send(new TextEncoder().encode('garbage'));
    await expect(session.closed).resolves.toMatchObject({ code: 'protocol_violation' });
    await expect(pending).rejects.toMatchObject({ code: 'protocol_violation' });
    await session.close();
    expect(transport.closed).toBe(true);
  });

  it('本端并发超过协议上限的请求排队等名额，不会触发对端的未完成请求上限', async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => (release = resolve));
    const gated = echo({
      handle: async () => {
        await gate;
        return {};
      }
    });
    const [left, right] = openSessionPair({ left: { protocols: [gated] }, right: { protocols: [gated] } });
    const replies = Array.from({ length: 40 }, () => left.request('echo', { method: 'wait' }));
    await delay(5);
    release();
    await expect(Promise.all(replies)).resolves.toHaveLength(40);
    expect(right.state).toBe('ready');
    await left.close();
    await right.close();
  });

  it('发送失败结束会话：挂起与之后的请求都以 transport_failed 拒绝', async () => {
    const [lt, rt] = linkedTransports();
    const [left, right] = openSessionPair({
      transports: [lt, rt],
      left: { protocols: [hang()] },
      right: { protocols: [hang()] }
    });
    await Promise.all([left.ready, right.ready]);
    lt.failSend = true;
    await expect(left.request('echo', { method: 'echo' })).rejects.toMatchObject({ code: 'transport_failed' });
    await expect(left.closed).resolves.toMatchObject({ code: 'transport_failed' });
    await expect(left.request('echo', { method: 'echo' })).rejects.toMatchObject({ code: 'transport_failed' });
    await right.close();
  });

  it('控制帧优先：批量应答排队时，后到的小应答先发出', async () => {
    const bulk = echo({ handle: ({ params }) => ({ result: params, payload: Uint8Array.of(1, 2, 3) }) });
    const small = echo({ name: 'small', handle: ({ params }) => ({ result: params }) });
    const [lt, rt] = linkedTransports();
    const [left, right] = openSessionPair({
      transports: [lt, rt],
      left: { protocols: [bulk, small] },
      right: { protocols: [bulk, small] }
    });
    await Promise.all([left.ready, right.ready]);
    let open!: () => void;
    rt.sendGate = new Promise<void>(resolve => (open = resolve));
    const before = rt.sentFrames.length;
    const replies = ['b0', 'b1', 'b2'].map(params => left.request('echo', { method: 'read', params }));
    await delay(5);
    replies.push(left.request('small', { method: 'stat', params: 's' }));
    await delay(5);
    rt.sendGate = undefined;
    open();
    await Promise.all(replies);
    const order = rt.sentFrames
      .slice(before)
      .map(frame => decodeP2PFrame(frame))
      .filter(frame => frame?.kind === 'response')
      .map(frame => (frame?.kind === 'response' ? frame.result : undefined));
    expect(order).toEqual(['b0', 's', 'b1', 'b2']);
    await left.close();
    await right.close();
  });
});

describe('P2P 会话：心跳与关闭', () => {
  it('对端失联：就绪起连续错过心跳超时折合的周期数即以 peer_lost 结束，挂起的请求被拒', async () => {
    vi.useFakeTimers();
    const [lt, rt] = linkedTransports();
    const heartbeat = { heartbeatIntervalMs: 100, heartbeatTimeoutMs: 300 };
    const [left] = openSessionPair({
      transports: [lt, rt],
      left: { ...heartbeat, protocols: [hang()] },
      right: { ...heartbeat, protocols: [hang()] }
    });
    await left.ready;
    rt.sendGate = new Promise<void>(() => undefined);
    const pending = left.request('echo', { method: 'echo' }).catch((error: unknown) => error);
    // 300 ms 折合 3 个周期；就绪前收到的 hello 不算进第一个周期，第 3 拍即判定
    await vi.advanceTimersByTimeAsync(299);
    expect(left.state).toBe('ready');
    await vi.advanceTimersByTimeAsync(1);
    expect(left.state).toBe('closed');
    await expect(left.closed).resolves.toMatchObject({ code: 'peer_lost' });
    await expect(pending).resolves.toMatchObject({ code: 'peer_lost' });
  });

  it('失联判定不早于心跳超时：最后一帧落在周期中间时，在超时之后的下一拍判定', async () => {
    vi.useFakeTimers();
    const [transport, raw] = linkedTransports();
    const session = openP2PSession(
      sessionOptions(transport, alice, { protocols: [echo()], heartbeatIntervalMs: 100, heartbeatTimeoutMs: 300 })
    );
    await raw.send(helloFrom(bob));
    await session.ready;
    await vi.advanceTimersByTimeAsync(150);
    await raw.send(encodeP2PFrame({ kind: 'pong' }));
    // 最后一帧在 150 ms：400 ms 那拍只沉默了 250 ms，500 ms 那拍沉默 350 ms 才判定
    await vi.advanceTimersByTimeAsync(349);
    expect(session.state).toBe('ready');
    await vi.advanceTimersByTimeAsync(1);
    expect(session.state).toBe('closed');
    await expect(session.closed).resolves.toMatchObject({ code: 'peer_lost' });
  });

  it('两端就绪有先后：先就绪的一端第一拍可能落空，下一拍收到帧即清零，不误判失联', async () => {
    vi.useFakeTimers();
    const heartbeat = { heartbeatIntervalMs: 100, heartbeatTimeoutMs: 101 };
    const [left, right] = openSessionPair({
      left: heartbeat,
      right: {
        ...heartbeat,
        authenticate: async (credential, context) => {
          await delay(50);
          return verifyCredential(credential, context);
        }
      }
    });
    await vi.advanceTimersByTimeAsync(5_000);
    expect([left.state, right.state]).toEqual(['ready', 'ready']);
    const closing = Promise.all([left.close(), right.close()]);
    await vi.advanceTimersByTimeAsync(1_000);
    await closing;
  });

  it('对端 ping 洪泛：发送受阻时 pong 至多排一帧，排在后面的批量应答不被饿死', async () => {
    const bulk = echo({ handle: () => ({ payload: Uint8Array.of(1, 2, 3) }) });
    const { session, transport, raw } = sessionWithRawPeer([bulk]);
    await raw.send(helloFrom(bob));
    await session.ready;
    let open!: () => void;
    transport.sendGate = new Promise<void>(resolve => (open = resolve));
    const ping = encodeP2PFrame({ kind: 'ping' });
    // 第一个 pong 卡在发送口，批量应答排进队列，之后的 ping 全在它后面到达
    await raw.send(ping);
    await delay(1);
    await raw.send(request(0));
    for (let index = 0; index < 1_000; index += 1) await raw.send(ping);
    await delay(5);
    transport.sendGate = undefined;
    open();
    await expect(nextFrameOfKind(raw, 'response')).resolves.toMatchObject({ id: 0 });
    const pongCount = () => transport.sentFrames.filter(frame => decodeP2PFrame(frame)?.kind === 'pong').length;
    expect(pongCount()).toBe(1);
    await delay(5);
    expect(pongCount()).toBe(1);
    expect(session.state).toBe('ready');
    await session.close();
  });

  it('发送长时间受阻：本端心跳照常走，ping 与 pong 各至多排一帧，会话不因此结束', async () => {
    vi.useFakeTimers();
    const [transport, raw] = linkedTransports();
    const session = openP2PSession(
      sessionOptions(transport, alice, { protocols: [echo()], heartbeatIntervalMs: 100, heartbeatTimeoutMs: 300 })
    );
    await raw.send(helloFrom(bob));
    await session.ready;
    let open!: () => void;
    transport.sendGate = new Promise<void>(resolve => (open = resolve));
    const sentBefore = transport.sentFrames.length;
    for (let beat = 0; beat < 50; beat += 1) {
      await raw.send(encodeP2PFrame({ kind: 'ping' }));
      await vi.advanceTimersByTimeAsync(100);
    }
    expect(session.state).toBe('ready');
    transport.sendGate = undefined;
    open();
    await vi.advanceTimersByTimeAsync(0);
    const kinds = transport.sentFrames.slice(sentBefore).map(frame => decodeP2PFrame(frame)?.kind);
    expect(kinds.toSorted()).toEqual(['ping', 'pong']);
    expect(session.state).toBe('ready');
    const closing = session.close();
    await vi.advanceTimersByTimeAsync(1_000);
    await closing;
  });

  it('心跳正常时空闲的会话一直保持就绪', async () => {
    vi.useFakeTimers();
    const heartbeat = { heartbeatIntervalMs: 100, heartbeatTimeoutMs: 300 };
    const [left, right] = openSessionPair({ left: heartbeat, right: heartbeat });
    await Promise.all([left.ready, right.ready]);
    await vi.advanceTimersByTimeAsync(5_000);
    expect([left.state, right.state]).toEqual(['ready', 'ready']);
    const closing = Promise.all([left.close(), right.close()]);
    await vi.advanceTimersByTimeAsync(1_000);
    await closing;
  });

  it('close 通知对端：对端以 peer_closed 结束，双方挂起的请求都被拒', async () => {
    const [lt, rt] = linkedTransports();
    const [left, right] = openSessionPair({
      transports: [lt, rt],
      left: { protocols: [hang()] },
      right: { protocols: [hang()] }
    });
    await Promise.all([left.ready, right.ready]);
    const fromRight = right.request('echo', { method: 'echo' });
    const fromLeft = left.request('echo', { method: 'echo' });
    await left.close();
    await expect(left.closed).resolves.toMatchObject({ code: 'closed' });
    await expect(right.closed).resolves.toMatchObject({ code: 'peer_closed', peerReason: 'closed' });
    await expect(fromLeft).rejects.toMatchObject({ code: 'closed' });
    await expect(fromRight).rejects.toMatchObject({ code: 'peer_closed' });
    await right.close();
    expect([lt.closed, rt.closed]).toEqual([true, true]);
  });

  it('选项越界即抛 RangeError，不启动会话', () => {
    const open = (overrides: Parameters<typeof sessionOptions>[2]) =>
      openP2PSession(sessionOptions(new LinkedTransport(), alice, overrides));
    for (const maxConcurrentRequests of [0, 33, 1.5]) {
      expect(() => open({ protocols: [echo({ maxConcurrentRequests })] })).toThrow(RangeError);
    }
    expect(() => open({ protocols: [echo(), echo()] })).toThrow(RangeError);
    expect(() => open({ protocols: [echo({ version: 0 })] })).toThrow(RangeError);
    expect(() => open({ protocols: [echo({ name: '' })] })).toThrow(RangeError);
    expect(() => open({ helloTimeoutMs: 0 })).toThrow(RangeError);
    expect(() => open({ heartbeatIntervalMs: 100, heartbeatTimeoutMs: 100 })).toThrow(RangeError);
    expect(() => open({ credential: 'x'.repeat(10_000) })).toThrow(RangeError);
    for (const instanceId of ['', 'x'.repeat(200)]) {
      expect(() => open({ local: { ...alice, instanceId } })).toThrow(RangeError);
    }
  });
});
