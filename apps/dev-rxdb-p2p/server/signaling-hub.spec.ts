// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ServerMessage, SignalingPeer } from '../shared/signaling-protocol';
import {
  CLOSE_EVICTED,
  CLOSE_REPLACED,
  CLOSE_SERVER_ERROR,
  CLOSE_UNAUTHORIZED,
  SignalingHub,
  type HelloMessage,
  type HubSocket
} from './signaling-hub';

const TICKET_KEY: JsonWebKey = { kty: 'OKP', crv: 'Ed25519', x: 'public' };

const peerOf = (name: string): SignalingPeer => ({
  key: `instance-${name}`,
  principal: `user-${name}`,
  userName: `${name}@example.com`,
  deviceId: `device-${name}`,
  deviceName: `${name}'s laptop`
});

class FakeSocket implements HubSocket {
  #peer: SignalingPeer | null = null;
  readonly sent: ServerMessage[] = [];
  closed: { readonly code: number; readonly reason: string } | null = null;

  send(text: string): void {
    this.sent.push(JSON.parse(text) as ServerMessage);
  }

  close(code: number, reason: string): void {
    this.closed = { code, reason };
  }

  open(): boolean {
    return this.closed === null;
  }

  peer(): SignalingPeer | null {
    return this.#peer;
  }

  attach(peer: SignalingPeer): void {
    this.#peer = peer;
  }

  detach(): void {
    this.#peer = null;
  }

  last(): ServerMessage | undefined {
    return this.sent.at(-1);
  }
}

const hello = (name: string, accessToken = `token-${name}`): string =>
  JSON.stringify({
    type: 'hello',
    accessToken,
    deviceId: `device-${name}`,
    instanceId: `instance-${name}`
  } satisfies HelloMessage);

describe('SignalingHub', () => {
  let sockets: FakeSocket[];
  let authHostDown: boolean;
  let connectionCount: number;
  let hub: SignalingHub;

  const join = async (name: string): Promise<FakeSocket> => {
    const socket = new FakeSocket();
    sockets.push(socket);
    await hub.receive(socket, hello(name));
    return socket;
  };

  beforeEach(() => {
    sockets = [];
    authHostDown = false;
    connectionCount = 0;
    hub = new SignalingHub({
      sockets: () => sockets,
      authenticate: async message => {
        if (authHostDown) throw new Error('Supabase Auth responded 503');
        const name = message.accessToken.replace('token-', '');
        return message.accessToken.startsWith('token-') ? { ...peerOf(name), key: message.instanceId } : null;
      },
      issueTickets: async (connectionId, initiator, responder) => [
        `${connectionId}:${initiator.key}`,
        `${connectionId}:${responder.key}`
      ],
      ticketKey: TICKET_KEY,
      newConnectionId: () => `connection-${++connectionCount}`
    });
  });

  it('welcomes an authenticated device with everyone already online', async () => {
    const alice = await join('alice');
    const bob = await join('bob');

    expect(bob.last()).toEqual({
      type: 'welcome',
      self: peerOf('bob'),
      peers: [peerOf('alice')],
      ticketKey: TICKET_KEY
    });
    expect(alice.last()).toEqual({ type: 'presence', peers: [peerOf('bob')] });
  });

  it('closes a connection whose first message is not hello', async () => {
    const socket = new FakeSocket();
    sockets.push(socket);

    await hub.receive(socket, JSON.stringify({ type: 'connect', to: 'instance-bob' }));

    expect(socket.last()).toMatchObject({ type: 'error', code: 'unauthorized' });
    expect(socket.closed?.code).toBe(CLOSE_UNAUTHORIZED);
  });

  it('rejects an invalid token without registering the device', async () => {
    const watcher = await join('alice');
    const socket = new FakeSocket();
    sockets.push(socket);

    await hub.receive(socket, hello('mallory', 'forged'));

    expect(socket.last()).toMatchObject({ type: 'error', code: 'unauthorized' });
    expect(socket.closed?.code).toBe(CLOSE_UNAUTHORIZED);
    expect(socket.peer()).toBeNull();
    expect(watcher.sent.filter(message => message.type === 'presence')).toEqual([]);
  });

  it('reports an unreachable auth host as a server error', async () => {
    authHostDown = true;
    const socket = new FakeSocket();
    sockets.push(socket);

    await hub.receive(socket, hello('alice'));

    expect(socket.last()).toMatchObject({ type: 'error', code: 'server_error' });
    expect(socket.closed?.code).toBe(CLOSE_SERVER_ERROR);
  });

  it.each([
    ['a second hello', hello('alice')],
    ['malformed json', '{']
  ])('answers %s after authentication with bad_request and keeps the connection', async (_label, raw) => {
    const alice = await join('alice');

    await hub.receive(alice, raw);

    expect(alice.last()).toMatchObject({ type: 'error', code: 'bad_request' });
    expect(alice.closed).toBeNull();
  });

  it('issues a ticket to each end of a new connection', async () => {
    const alice = await join('alice');
    const bob = await join('bob');

    await hub.receive(alice, JSON.stringify({ type: 'connect', to: 'instance-bob' }));

    expect(alice.last()).toEqual({
      type: 'connection',
      connectionId: 'connection-1',
      role: 'initiator',
      peer: peerOf('bob'),
      ticket: 'connection-1:instance-alice'
    });
    expect(bob.last()).toEqual({
      type: 'connection',
      connectionId: 'connection-1',
      role: 'responder',
      peer: peerOf('alice'),
      ticket: 'connection-1:instance-bob'
    });
  });

  it.each(['instance-carol', 'instance-alice'])('refuses to connect to %s', async target => {
    const alice = await join('alice');

    await hub.receive(alice, JSON.stringify({ type: 'connect', to: target }));

    expect(alice.last()).toMatchObject({ type: 'error', code: 'peer_unavailable' });
  });

  it('relays signals to the addressed device only', async () => {
    const alice = await join('alice');
    const bob = await join('bob');
    const carol = await join('carol');
    const before = carol.sent.length;

    await hub.receive(
      alice,
      JSON.stringify({
        type: 'signal',
        to: 'instance-bob',
        connectionId: 'connection-1',
        kind: 'offer',
        payload: 'sdp'
      })
    );

    expect(bob.last()).toEqual({
      type: 'signal',
      from: 'instance-alice',
      connectionId: 'connection-1',
      kind: 'offer',
      payload: 'sdp'
    });
    expect(carol.sent).toHaveLength(before);
  });

  it('tells the remaining devices when one leaves', async () => {
    const alice = await join('alice');
    const bob = await join('bob');

    sockets = sockets.filter(socket => socket !== bob);
    hub.left(bob);

    expect(alice.last()).toEqual({ type: 'presence', peers: [] });
  });

  it('does not announce a connection that never authenticated', async () => {
    const alice = await join('alice');
    const stranger = new FakeSocket();
    sockets.push(stranger);
    await hub.receive(stranger, hello('mallory', 'forged'));
    const before = alice.sent.length;

    hub.left(stranger);

    expect(alice.sent).toHaveLength(before);
  });

  it('leaves closing connections out of presence even while the runtime still lists them', async () => {
    const alice = await join('alice');
    const bob = await join('bob');

    bob.close(1000, 'bye');
    vi.spyOn(bob, 'detach').mockImplementation(() => undefined);
    hub.left(bob);

    expect(alice.last()).toEqual({ type: 'presence', peers: [] });
  });

  it('replaces an older connection of the same instance', async () => {
    const watcher = await join('alice');
    const stale = await join('bob');
    const fresh = await join('bob');

    expect(stale.closed?.code).toBe(CLOSE_REPLACED);
    expect(stale.peer()).toBeNull();
    expect(watcher.last()).toEqual({ type: 'presence', peers: [peerOf('bob')] });
    expect(fresh.last()).toMatchObject({ type: 'welcome', peers: [peerOf('alice')] });
  });

  describe('administration', () => {
    it('lists the authenticated devices that are still open', async () => {
      await join('alice');
      const closing = await join('bob');
      await join('carol');
      const stranger = new FakeSocket();
      sockets.push(stranger);
      closing.close(1000, 'bye');

      expect(hub.roster()).toEqual([peerOf('alice'), peerOf('carol')]);
    });

    it('evicts the matching devices and tells the rest who is left', async () => {
      const watcher = await join('alice');
      const target = await join('bob');

      const evicted = hub.evict(peer => peer.principal === 'user-bob', 'removed by an administrator');

      expect(evicted).toBe(1);
      expect(target.closed).toEqual({ code: CLOSE_EVICTED, reason: 'removed by an administrator' });
      expect(target.peer()).toBeNull();
      expect(watcher.last()).toEqual({ type: 'presence', peers: [] });
      expect(hub.roster()).toEqual([peerOf('alice')]);
    });

    it('evicts by device without touching the others', async () => {
      const alice = await join('alice');
      const bob = await join('bob');

      expect(hub.evict(peer => peer.deviceId === 'device-alice', 'removed by an administrator')).toBe(1);

      expect(alice.closed?.code).toBe(CLOSE_EVICTED);
      expect(bob.closed).toBeNull();
      expect(bob.last()).toEqual({ type: 'presence', peers: [] });
    });

    it('stays quiet when nothing matches', async () => {
      const alice = await join('alice');
      const before = alice.sent.length;

      expect(hub.evict(peer => peer.deviceId === 'device-nobody', 'removed by an administrator')).toBe(0);

      expect(alice.sent).toHaveLength(before);
      expect(alice.closed).toBeNull();
    });
  });
});
