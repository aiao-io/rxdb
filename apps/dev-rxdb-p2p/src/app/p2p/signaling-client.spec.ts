import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ServerMessage, SignalingPeer } from '../../../shared/signaling-protocol';
import { SignalingClient, SignalingOfflineError, type SignalingCredentials } from './signaling-client';

const PEER: SignalingPeer = {
  key: 'instance-b',
  principal: 'user-b',
  userName: 'b@example.com',
  deviceId: 'device-b',
  deviceName: 'Laptop'
};
const SELF: SignalingPeer = { ...PEER, key: 'instance-a', principal: 'user-a', deviceId: 'device-a' };
const KEY: JsonWebKey = { kty: 'OKP', crv: 'Ed25519', x: 'public' };

class FakeSocket {
  readonly sent: unknown[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  closedWith: number | null = null;

  constructor(readonly url: string) {}

  send(text: string): void {
    this.sent.push(JSON.parse(text));
  }

  close(code = 1000): void {
    this.closedWith = code;
    this.onclose?.({ code });
  }

  receive(message: ServerMessage): void {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
}

describe('SignalingClient', () => {
  let sockets: FakeSocket[];
  let tokens: number;
  let client: SignalingClient;

  const latest = (): FakeSocket => sockets.at(-1) as FakeSocket;
  const credentials = async (): Promise<SignalingCredentials> => ({
    accessToken: `token-${++tokens}`,
    deviceId: 'device-a',
    instanceId: 'instance-a'
  });

  const online = async (): Promise<FakeSocket> => {
    client.start();
    await vi.advanceTimersByTimeAsync(0);
    latest().onopen?.();
    latest().receive({ type: 'welcome', self: SELF, peers: [PEER], ticketKey: KEY });
    return latest();
  };

  beforeEach(() => {
    vi.useFakeTimers();
    sockets = [];
    tokens = 0;
    client = new SignalingClient({
      url: 'ws://worker.test/api/signal',
      credentials,
      createSocket: url => {
        const socket = new FakeSocket(url);
        sockets.push(socket);
        return socket as unknown as WebSocket;
      },
      reconnectDelayMs: 1000
    });
  });

  afterEach(() => {
    client.stop();
    vi.useRealTimers();
  });

  it('says hello with a fresh access token and goes online on welcome', async () => {
    const socket = await online();

    expect(socket.sent).toEqual([
      { type: 'hello', accessToken: 'token-1', deviceId: 'device-a', instanceId: 'instance-a' }
    ]);
    expect(client.state$.value).toBe('online');
    expect(client.self$.value).toEqual(SELF);
    expect(client.peers$.value).toEqual([PEER]);
    expect(client.ticketKey).toEqual(KEY);
  });

  it('tracks presence and passes connection offers and signals on', async () => {
    const socket = await online();
    const connections: unknown[] = [];
    const signals: unknown[] = [];
    client.connections$.subscribe(message => connections.push(message));
    client.signals$.subscribe(message => signals.push(message));

    socket.receive({ type: 'presence', peers: [] });
    socket.receive({ type: 'connection', connectionId: 'c-1', role: 'responder', peer: PEER, ticket: 't' });
    socket.receive({ type: 'signal', from: PEER.key, connectionId: 'c-1', kind: 'offer', payload: 'sdp' });

    expect(client.peers$.value).toEqual([]);
    expect(connections).toEqual([
      { type: 'connection', connectionId: 'c-1', role: 'responder', peer: PEER, ticket: 't' }
    ]);
    expect(signals).toEqual([{ type: 'signal', from: PEER.key, connectionId: 'c-1', kind: 'offer', payload: 'sdp' }]);
  });

  it('sends connection requests and signals while online', async () => {
    const socket = await online();

    client.requestConnection(PEER.key);
    client.sendSignal(PEER.key, 'c-1', 'ice', '{}');

    expect(socket.sent.slice(1)).toEqual([
      { type: 'connect', to: PEER.key },
      { type: 'signal', to: PEER.key, connectionId: 'c-1', kind: 'ice', payload: '{}' }
    ]);
  });

  it('refuses to start a new connection while signaling is unreachable', () => {
    expect(() => client.requestConnection(PEER.key)).toThrow(SignalingOfflineError);
  });

  it('stops for good when the server rejects the credentials', async () => {
    const socket = await online();

    socket.close(4401);
    await vi.advanceTimersByTimeAsync(5000);

    expect(client.state$.value).toBe('rejected');
    expect(sockets).toHaveLength(1);
  });

  it('stops for good when an administrator removes the device', async () => {
    const socket = await online();

    socket.close(4403);
    await vi.advanceTimersByTimeAsync(5000);

    expect(client.state$.value).toBe('rejected');
    expect(client.peers$.value).toEqual([]);
    expect(sockets).toHaveLength(1);
  });

  it('forgets presence and reconnects with a new token after losing the connection', async () => {
    const socket = await online();

    socket.close(1006);
    expect(client.state$.value).toBe('offline');
    expect(client.peers$.value).toEqual([]);

    await vi.advanceTimersByTimeAsync(1000);
    latest().onopen?.();

    expect(sockets).toHaveLength(2);
    expect(latest().sent).toEqual([
      { type: 'hello', accessToken: 'token-2', deviceId: 'device-a', instanceId: 'instance-a' }
    ]);
  });

  it('does not reconnect after stop', async () => {
    const socket = await online();

    client.stop();
    await vi.advanceTimersByTimeAsync(5000);

    expect(socket.closedWith).toBe(1000);
    expect(sockets).toHaveLength(1);
    expect(client.state$.value).toBe('offline');
  });
});
