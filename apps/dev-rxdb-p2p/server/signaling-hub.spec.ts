// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ServerMessage, SignalingPeer } from '../shared/signaling-protocol';
import {
  CLOSE_BUSY,
  CLOSE_EVICTED,
  CLOSE_REPLACED,
  CLOSE_SERVER_ERROR,
  CLOSE_UNAUTHORIZED,
  SignalingHub,
  type HelloMessage,
  type HubSocket
} from './signaling-hub';

const TICKET_KEY: JsonWebKey = { kty: 'OKP', crv: 'Ed25519', x: 'public' };
const ROOM_LIMIT = 4;
const USER_LIMIT = 2;

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

/** 用 `name` 自己的凭据，自报别的实例键（或别的设备）。 */
const helloClaiming = (name: string, claim: { readonly instanceId: string; readonly deviceId?: string }): string =>
  JSON.stringify({
    type: 'hello',
    accessToken: `token-${name}`,
    deviceId: claim.deviceId ?? `device-${name}`,
    instanceId: claim.instanceId
  } satisfies HelloMessage);

describe('SignalingHub', () => {
  let sockets: FakeSocket[];
  let authHostDown: boolean;
  let authGate: Promise<void>;
  let authCalls: number;
  let connectionCount: number;
  let hub: SignalingHub;

  const join = async (name: string): Promise<FakeSocket> => {
    const socket = new FakeSocket();
    sockets.push(socket);
    await hub.receive(socket, hello(name));
    return socket;
  };

  /** 让认证宿主先不应答，返回放行函数。 */
  const holdAuthentication = (): (() => void) => {
    let release!: () => void;
    authGate = new Promise(resolve => (release = resolve));
    return release;
  };

  beforeEach(() => {
    sockets = [];
    authHostDown = false;
    authGate = Promise.resolve();
    authCalls = 0;
    connectionCount = 0;
    hub = new SignalingHub({
      sockets: () => sockets,
      authenticate: async message => {
        authCalls += 1;
        await authGate;
        if (authHostDown) throw new Error('Supabase Auth responded 503');
        const name = message.accessToken.replace('token-', '');
        const peer = { ...peerOf(name), key: message.instanceId, deviceId: message.deviceId };
        return message.accessToken.startsWith('token-') ? peer : null;
      },
      issueTickets: async (connectionId, initiator, responder) => [
        `${connectionId}:${initiator.key}`,
        `${connectionId}:${responder.key}`
      ],
      ticketKey: TICKET_KEY,
      newConnectionId: () => `connection-${++connectionCount}`,
      maxMembers: ROOM_LIMIT,
      maxMembersPerUser: USER_LIMIT
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

  describe('an instance id claimed by another device', () => {
    const claim = async (name: string, instanceId: string, deviceId?: string): Promise<FakeSocket> => {
      const socket = new FakeSocket();
      sockets.push(socket);
      await hub.receive(socket, helloClaiming(name, { instanceId, deviceId }));
      return socket;
    };

    it.each([
      ['another user', 'mallory', undefined],
      ['another device of the same user', 'alice', 'device-alice-phone']
    ])('is refused for %s while the holder stays online and nobody is told', async (_label, name, deviceId) => {
      const alice = await join('alice');
      const bob = await join('bob');
      const before = bob.sent.length;

      const impostor = await claim(name, 'instance-alice', deviceId);

      expect(impostor.last()).toMatchObject({ type: 'error', code: 'unauthorized' });
      expect(impostor.closed?.code).toBe(CLOSE_UNAUTHORIZED);
      expect(impostor.peer()).toBeNull();
      expect(alice.closed).toBeNull();
      expect(hub.roster()).toEqual([peerOf('alice'), peerOf('bob')]);
      expect(bob.sent).toHaveLength(before);
    });

    it('keeps routing connections to the holder after a takeover read from presence', async () => {
      const alice = await join('alice');
      const mallory = await join('mallory');
      const welcome = mallory.sent.find(message => message.type === 'welcome');
      const victim = welcome?.type === 'welcome' ? welcome.peers[0]?.key : undefined;
      if (!victim) throw new Error('mallory 没在 welcome 里看到 alice');

      await claim('mallory', victim);
      const bob = await join('bob');
      await hub.receive(bob, JSON.stringify({ type: 'connect', to: victim }));

      expect(bob.last()).toMatchObject({ type: 'connection', role: 'initiator', peer: peerOf('alice') });
      expect(alice.last()).toMatchObject({ type: 'connection', role: 'responder', peer: peerOf('bob') });
      expect(mallory.sent.filter(message => message.type === 'connection')).toEqual([]);
    });
  });

  describe('authentication of one connection', () => {
    it('asks the auth host once however many hellos pile up while it answers', async () => {
      const release = holdAuthentication();
      const socket = new FakeSocket();
      sockets.push(socket);

      const pending = [hub.receive(socket, hello('alice')), hub.receive(socket, hello('alice'))];
      release();
      await Promise.all(pending);

      expect(authCalls).toBe(1);
      expect(socket.sent.filter(message => message.type === 'welcome')).toHaveLength(1);
    });

    it('does not register a connection that closed while it was being authenticated', async () => {
      const watcher = await join('bob');
      const before = watcher.sent.length;
      const release = holdAuthentication();
      const socket = new FakeSocket();
      sockets.push(socket);

      const pending = hub.receive(socket, hello('alice'));
      socket.close(1006, 'gone');
      release();
      await pending;

      expect(socket.peer()).toBeNull();
      expect(socket.sent).toEqual([]);
      expect(watcher.sent).toHaveLength(before);
    });
  });

  describe('capacity', () => {
    const joinAs = async (name: string, instanceId: string): Promise<FakeSocket> => {
      const socket = new FakeSocket();
      sockets.push(socket);
      await hub.receive(socket, helloClaiming(name, { instanceId }));
      return socket;
    };

    const expectBusy = (socket: FakeSocket): void => {
      expect(socket.last()).toMatchObject({ type: 'error', code: 'server_error' });
      expect(socket.closed?.code).toBe(CLOSE_BUSY);
      expect(socket.peer()).toBeNull();
    };

    it('lets one user bring instances online up to the limit and asks the next to retry later', async () => {
      const instances = [];
      for (let index = 1; index <= USER_LIMIT; index += 1) instances.push(await joinAs('alice', `alice-${index}`));
      const watcher = await join('bob');
      const before = watcher.sent.length;

      const extra = await joinAs('alice', 'alice-extra');

      expect(instances.map(socket => socket.closed)).toEqual(instances.map(() => null));
      expectBusy(extra);
      expect(watcher.sent).toHaveLength(before);
    });

    it('fills the room up to the limit and asks the next device to retry later', async () => {
      const members = [];
      for (let index = 1; index <= ROOM_LIMIT; index += 1) members.push(await join(`member-${index}`));

      const extra = await join('latecomer');

      expect(members.every(member => member.last()?.type !== 'error' && member.closed === null)).toBe(true);
      expectBusy(extra);
      expect(hub.roster()).toHaveLength(ROOM_LIMIT);
    });

    it('still lets a device at either limit reconnect in place of its old connection', async () => {
      for (let index = 1; index < ROOM_LIMIT; index += 1) await join(`member-${index}`);
      const stale = await joinAs('alice', 'alice-1');

      const fresh = await joinAs('alice', 'alice-1');

      expect(stale.closed?.code).toBe(CLOSE_REPLACED);
      expect(fresh.last()).toMatchObject({ type: 'welcome' });
      expect(hub.roster()).toHaveLength(ROOM_LIMIT);
    });
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
