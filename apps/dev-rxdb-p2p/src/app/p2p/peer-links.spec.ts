import {
  P2PSessionClosedError,
  type P2PByteTransport,
  type P2PPeerIdentity,
  type P2PPeerSession,
  type P2PSessionOptions,
  type P2PSessionState
} from '@aiao/rxdb-plugin-p2p';
import { Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SignalingPeer, SignalKind } from '../../../shared/signaling-protocol';
import { PeerLinks } from './peer-links';
import {
  SignalingOfflineError,
  type ConnectionOffer,
  type IncomingSignal,
  type SignalingClient
} from './signaling-client';

const mocked = vi.hoisted(() => ({ open: vi.fn(), transport: vi.fn(), verifyKey: vi.fn(), authenticate: vi.fn() }));
vi.mock('@aiao/rxdb-plugin-p2p', async importOriginal => ({
  ...(await importOriginal<typeof import('@aiao/rxdb-plugin-p2p')>()),
  openP2PSession: mocked.open,
  createWebRTCTransport: mocked.transport
}));
vi.mock('../../../shared/connection-ticket', () => ({ importTicketVerifyKey: mocked.verifyKey }));
vi.mock('./peer-auth', () => ({ authenticatePeerTicket: mocked.authenticate }));

const peer: SignalingPeer = {
  key: 'peer-instance',
  principal: 'peer-user',
  deviceId: 'peer-device',
  deviceName: '另一台电脑',
  userName: 'peer@example.com'
};
const local: P2PPeerIdentity = {
  principal: { principal: 'local-user', deviceId: 'local-device' },
  instanceId: 'local-instance'
};
const identityOf = (remote: SignalingPeer): P2PPeerIdentity => ({
  principal: { principal: remote.principal, deviceId: remote.deviceId },
  instanceId: remote.key
});

class TestPeerConnection extends EventTarget {
  localDescription: RTCSessionDescriptionInit | null = null;
  remoteDescription: RTCSessionDescriptionInit | null = null;
  readonly createDataChannel = vi.fn(() => ({ label: 'p2p' }) as RTCDataChannel);
  readonly createOffer = vi.fn(async () => ({ type: 'offer', sdp: 'local-offer' }) as const);
  readonly createAnswer = vi.fn(async () => ({ type: 'answer', sdp: 'local-answer' }) as const);
  readonly setLocalDescription = vi.fn(async (description: RTCSessionDescriptionInit) => {
    this.localDescription = description;
  });
  readonly setRemoteDescription = vi.fn(async (description: RTCSessionDescriptionInit) => {
    this.remoteDescription = description;
  });
  readonly addIceCandidate = vi.fn<(candidate: RTCIceCandidateInit) => Promise<void>>(async () => undefined);
  readonly close = vi.fn();
}

const controlledSession = (options: P2PSessionOptions, remote: SignalingPeer) => {
  const ready = Promise.withResolvers<P2PPeerIdentity>();
  const closed = Promise.withResolvers<P2PSessionClosedError>();
  let state: P2PSessionState = 'connecting';
  let identity: P2PPeerIdentity | undefined;
  const session: P2PPeerSession = {
    role: options.role,
    connectionId: options.connectionId,
    local: options.local,
    ready: ready.promise,
    closed: closed.promise,
    get state() {
      return state;
    },
    get peer() {
      return identity;
    },
    supports: vi.fn((name: string) => state === 'ready' && name === 'p2p.files'),
    request: vi.fn(async () => ({ result: null, payload: new Uint8Array() })),
    close: vi.fn(async (reason?: 'closed' | 'duplicate') => {
      state = 'closed';
      const error = new P2PSessionClosedError(reason ?? 'closed', '测试结束');
      ready.reject(error);
      closed.resolve(error);
    })
  };
  return {
    session,
    options,
    resolveReady: () => {
      state = 'ready';
      identity = identityOf(remote);
      ready.resolve(identity);
    },
    rejectReady: (error: Error) => {
      ready.reject(error);
    },
    end: (code: 'peer_lost' | 'unauthorized') => {
      state = 'closed';
      closed.resolve(new P2PSessionClosedError(code, '对端结束'));
    }
  };
};

describe('PeerLinks connection lifecycle', () => {
  let links: PeerLinks;
  let ticketKey: JsonWebKey | null;
  let connections: TestPeerConnection[];
  let sessions: ReturnType<typeof controlledSession>[];
  let offers: Subject<ConnectionOffer>;
  let signals: Subject<IncomingSignal>;
  let requestConnection: ReturnType<typeof vi.fn>;
  let sendSignal: ReturnType<typeof vi.fn>;
  let report: ReturnType<typeof vi.spyOn>;
  let warn: ReturnType<typeof vi.spyOn>;

  const offer = (role: 'initiator' | 'responder' = 'initiator', connectionId = 'connection-1', remote = peer): void => {
    offers.next({ type: 'connection', role, connectionId, peer: remote, ticket: `ticket-${connectionId}` });
  };
  const receive = (kind: SignalKind, payload: unknown, connectionId = 'connection-1', from = peer.key): void => {
    signals.next({ type: 'signal', from, connectionId, kind, payload: JSON.stringify(payload) });
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetAllMocks();
    report = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    ticketKey = { kty: 'OKP', crv: 'Ed25519', x: 'key-1' };
    offers = new Subject();
    signals = new Subject();
    connections = [];
    sessions = [];
    requestConnection = vi.fn();
    sendSignal = vi.fn();
    mocked.verifyKey.mockResolvedValue({ type: 'public' } as CryptoKey);
    mocked.authenticate.mockResolvedValue(identityOf(peer).principal);
    mocked.transport.mockImplementation((): P2PByteTransport => ({
      send: vi.fn(async () => undefined),
      receive: vi.fn(() => new Promise<Uint8Array>(() => undefined)),
      close: vi.fn()
    }));
    mocked.open.mockImplementation((options: P2PSessionOptions) => {
      const control = controlledSession(options, peer);
      sessions.push(control);
      return control.session;
    });
    const signaling = {
      connections$: offers,
      signals$: signals,
      requestConnection,
      sendSignal,
      get ticketKey() {
        return ticketKey;
      }
    } as unknown as SignalingClient;
    links = new PeerLinks({
      signaling,
      local,
      protocols: () => [
        { name: 'p2p.files', version: 1, handle: () => ({}) },
        { name: 'unsupported', version: 1, handle: () => ({}) }
      ],
      heartbeatIntervalMs: 2000,
      heartbeatTimeoutMs: 6000,
      connectTimeoutMs: 1000,
      createPeerConnection: () => {
        const connection = new TestPeerConnection();
        connections.push(connection);
        return connection as unknown as RTCPeerConnection;
      }
    });
    links.start();
  });

  afterEach(async () => {
    await links.stop();
    vi.useRealTimers();
    report.mockRestore();
    warn.mockRestore();
  });

  it('opens an ordered initiator channel, forwards SDP and ICE, and publishes a reusable ready session', async () => {
    const connected = links.connect(peer.key);
    expect(requestConnection).toHaveBeenCalledWith(peer.key);
    offer();
    const connection = connections[0]!;
    const control = sessions[0]!;
    expect(connection.createDataChannel).toHaveBeenCalledWith('p2p', { ordered: true });
    expect(control.options).toMatchObject({
      connectionId: 'connection-1',
      role: 'initiator',
      local,
      credential: 'ticket-connection-1',
      heartbeatIntervalMs: 2000,
      heartbeatTimeoutMs: 6000
    });
    control.resolveReady();
    await expect(connected).resolves.toBe(control.session);
    expect(sendSignal).toHaveBeenCalledWith(
      peer.key,
      'connection-1',
      'offer',
      JSON.stringify({ type: 'offer', sdp: 'local-offer' })
    );
    const candidate = { candidate: 'candidate-1' };
    connection.dispatchEvent(Object.assign(new Event('icecandidate'), { candidate: { toJSON: () => candidate } }));
    connection.dispatchEvent(Object.assign(new Event('icecandidate'), { candidate: null }));
    expect(sendSignal).toHaveBeenLastCalledWith(peer.key, 'connection-1', 'ice', JSON.stringify(candidate));
    expect(sendSignal).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(200);
    expect(links.links$.value).toMatchObject([{ state: 'ready', protocols: ['p2p.files'], closeCode: null }]);
    await expect(links.connect(peer.key)).resolves.toBe(control.session);
    expect(requestConnection).toHaveBeenCalledTimes(1);
    expect(links.sessionWith('another-instance')).toBeUndefined();
  });

  it('waits for a responder channel and applies queued ICE only after the remote offer', async () => {
    offer('responder');
    await vi.advanceTimersByTimeAsync(200);
    expect(sessions).toHaveLength(0);
    expect(links.links$.value).toMatchObject([{ state: 'connecting', protocols: [] }]);
    const connection = connections[0]!;
    const candidate = { candidate: 'early-ice' };
    receive('ice', candidate);
    await vi.advanceTimersByTimeAsync(0);
    expect(connection.addIceCandidate).not.toHaveBeenCalled();
    connection.dispatchEvent(Object.assign(new Event('datachannel'), { channel: { label: 'p2p' } as RTCDataChannel }));
    sessions[0]!.resolveReady();
    receive('offer', { type: 'offer', sdp: 'remote-offer' });
    await vi.advanceTimersByTimeAsync(0);
    expect(connection.setRemoteDescription).toHaveBeenCalledWith({ type: 'offer', sdp: 'remote-offer' });
    expect(connection.addIceCandidate).toHaveBeenCalledWith(candidate);
    expect(connection.createAnswer).toHaveBeenCalledTimes(1);
    expect(sendSignal).toHaveBeenCalledWith(
      peer.key,
      'connection-1',
      'answer',
      JSON.stringify({ type: 'answer', sdp: 'local-answer' })
    );
    receive('ice', { candidate: 'late-ice' });
    await vi.advanceTimersByTimeAsync(0);
    expect(connection.addIceCandidate).toHaveBeenLastCalledWith({ candidate: 'late-ice' });
  });

  it('abandons a responder connection whose channel never opens and keeps one that opened in time', async () => {
    offer('responder', 'stalled');
    offer('responder', 'opened');
    connections[1]!.dispatchEvent(Object.assign(new Event('datachannel'), { channel: { label: 'p2p' } as RTCDataChannel }));
    await vi.advanceTimersByTimeAsync(200);
    expect(links.links$.value.map(link => link.connectionId)).toEqual(['opened', 'stalled']);
    await vi.advanceTimersByTimeAsync(1000);
    expect(connections[0]!.close).toHaveBeenCalled();
    expect(connections[1]!.close).not.toHaveBeenCalled();
    expect(links.links$.value.map(link => link.connectionId)).toEqual(['opened']);
    expect(report).toHaveBeenCalled();
    receive('offer', { type: 'offer', sdp: 'too-late' }, 'stalled');
    await vi.advanceTimersByTimeAsync(0);
    expect(connections[0]!.setRemoteDescription).not.toHaveBeenCalled();
  });

  it('rejects forged or unknown signaling messages and accepts an answer without creating another answer', async () => {
    offer();
    sessions[0]!.resolveReady();
    receive('offer', { type: 'offer', sdp: 'forged' }, 'connection-1', 'attacker');
    receive('offer', { type: 'offer', sdp: 'unknown' }, 'missing');
    receive('answer', { type: 'answer', sdp: 'remote-answer' });
    await vi.advanceTimersByTimeAsync(0);
    expect(connections[0]!.setRemoteDescription).toHaveBeenCalledExactlyOnceWith({
      type: 'answer',
      sdp: 'remote-answer'
    });
    expect(connections[0]!.createAnswer).not.toHaveBeenCalled();
  });

  it('times out if signaling never assigns a connection', async () => {
    const connected = links.connect(peer.key);
    const rejected = expect(connected).rejects.toThrow('signaling did not set up a connection');
    await vi.advanceTimersByTimeAsync(1000);
    await rejected;
    expect(connections).toHaveLength(0);
  });

  it('shares one dial between concurrent connects to the same device', async () => {
    const first = links.connect(peer.key);
    const second = links.connect(peer.key);
    expect(requestConnection).toHaveBeenCalledExactlyOnceWith(peer.key);
    offer();
    sessions[0]!.resolveReady();
    await expect(first).resolves.toBe(sessions[0]!.session);
    await expect(second).resolves.toBe(sessions[0]!.session);
    await vi.advanceTimersByTimeAsync(1000);
    expect(connections).toHaveLength(1);
  });

  it('fails every caller of a dial that signaling never answers, then dials afresh', async () => {
    const first = links.connect(peer.key);
    const second = links.connect(peer.key);
    const rejected = Promise.all([
      expect(first).rejects.toThrow('signaling did not set up a connection'),
      expect(second).rejects.toThrow('signaling did not set up a connection')
    ]);
    await vi.advanceTimersByTimeAsync(1000);
    await rejected;
    const retried = links.connect(peer.key);
    expect(requestConnection).toHaveBeenCalledTimes(2);
    offer();
    sessions[0]!.resolveReady();
    await expect(retried).resolves.toBe(sessions[0]!.session);
  });

  it('surfaces handshake failure through connect without an unhandled registry rejection', async () => {
    const connected = links.connect(peer.key);
    const rejected = expect(connected).rejects.toThrow('对端凭据无效');
    offer();
    sessions[0]!.rejectReady(new Error('对端凭据无效'));
    await rejected;
    expect(links.sessionWith(peer.key)).toBeUndefined();
  });

  it('disconnects a session, records heartbeat loss, and allows reconnecting after closure', async () => {
    offer();
    sessions[0]!.resolveReady();
    await vi.advanceTimersByTimeAsync(0);
    links.disconnect('missing');
    links.disconnect('connection-1');
    expect(sessions[0]!.session.close).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(200);
    expect(links.links$.value).toMatchObject([{ state: 'closed', closeCode: 'closed' }]);
    expect(links.sessionWith(peer.key)).toBeUndefined();
    const reconnected = links.connect(peer.key);
    offer('initiator', 'connection-2');
    sessions[1]!.resolveReady();
    await expect(reconnected).resolves.toBe(sessions[1]!.session);
    sessions[1]!.end('peer_lost');
    await vi.advanceTimersByTimeAsync(200);
    expect(connections[1]!.close).toHaveBeenCalled();
    expect(links.links$.value[0]).toMatchObject({
      connectionId: 'connection-2',
      closeCode: 'peer_lost',
      state: 'closed'
    });
  });

  it('keeps the first same-direction duplicate and closes the redundant connection', async () => {
    offer();
    sessions[0]!.resolveReady();
    await vi.advanceTimersByTimeAsync(0);
    offer('initiator', 'duplicate-connection');
    sessions[1]!.resolveReady();
    await vi.advanceTimersByTimeAsync(200);
    expect(links.registry.sessions).toEqual([sessions[0]!.session]);
    expect(sessions[1]!.session.close).toHaveBeenCalledWith('duplicate');
    expect(links.links$.value[0]).toMatchObject({ state: 'closed', closeCode: 'duplicate' });
  });

  it.each(['answer creation', 'offer send', 'remote description'])(
    'closes a connection that is still handshaking after %s fails',
    async failure => {
      if (failure === 'answer creation') {
        offer('responder');
        connections[0]!.createAnswer.mockRejectedValueOnce(new Error('RTC failed'));
        receive('offer', { type: 'offer', sdp: 'remote' });
      } else if (failure === 'offer send') {
        sendSignal.mockImplementationOnce(() => {
          throw new SignalingOfflineError();
        });
        offer();
      } else {
        offer();
        connections[0]!.setRemoteDescription.mockRejectedValueOnce(new Error('无效 SDP'));
        receive('answer', { type: 'answer', sdp: 'invalid' });
      }
      await vi.advanceTimersByTimeAsync(200);
      expect(connections[0]!.close).toHaveBeenCalled();
      expect(sessions.every(control => vi.mocked(control.session.close).mock.calls.length > 0)).toBe(true);
      expect(report).toHaveBeenCalled();
    }
  );

  it.each(['candidate send', 'remote candidate'])(
    'keeps a ready session when a late %s fails while signaling reconnects',
    async failure => {
      offer();
      sessions[0]!.resolveReady();
      await vi.advanceTimersByTimeAsync(0);
      const connection = connections[0]!;
      if (failure === 'candidate send') {
        sendSignal.mockImplementationOnce(() => {
          throw new SignalingOfflineError();
        });
        connection.dispatchEvent(
          Object.assign(new Event('icecandidate'), { candidate: { toJSON: () => ({ candidate: 'late-ice' }) } })
        );
      } else {
        receive('answer', { type: 'answer', sdp: 'remote-answer' });
        connection.addIceCandidate.mockRejectedValueOnce(new Error('无法解析候选'));
        receive('ice', { candidate: 'late-ice' });
      }
      await vi.advanceTimersByTimeAsync(200);
      expect(connection.close).not.toHaveBeenCalled();
      expect(sessions[0]!.session.close).not.toHaveBeenCalled();
      expect(links.links$.value).toMatchObject([{ state: 'ready', closeCode: null }]);
      expect(warn).toHaveBeenCalled();
    }
  );

  it('authenticates against the current published key, reuses it, and imports a replacement after rotation', async () => {
    offer();
    sessions[0]!.resolveReady();
    const authenticate = sessions[0]!.options.authenticate;
    const context = { connectionId: 'connection-1' };
    await expect(authenticate('remote-ticket', context)).resolves.toEqual(identityOf(peer).principal);
    await authenticate('remote-ticket', context);
    expect(mocked.verifyKey).toHaveBeenCalledTimes(1);
    expect(mocked.authenticate).toHaveBeenCalledWith(
      'remote-ticket',
      context,
      peer,
      expect.objectContaining({ type: 'public' }),
      expect.any(Number)
    );
    ticketKey = { kty: 'OKP', crv: 'Ed25519', x: 'key-2' };
    await authenticate('remote-ticket', context);
    expect(mocked.verifyKey).toHaveBeenCalledTimes(2);
    ticketKey = null;
    await expect(authenticate('remote-ticket', context)).rejects.toThrow('signaling has not published a ticket key');
  });

  it('stops receiving signaling and closes all registered sessions and RTC connections', async () => {
    offer();
    sessions[0]!.resolveReady();
    await vi.advanceTimersByTimeAsync(0);
    await links.stop();
    offer('initiator', 'ignored');
    receive('offer', { type: 'offer', sdp: 'ignored' });
    await vi.advanceTimersByTimeAsync(200);
    expect(connections).toHaveLength(1);
    expect(connections[0]!.close).toHaveBeenCalled();
    expect(sessions[0]!.session.close).toHaveBeenCalled();
  });
});
