// @vitest-environment node
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { importTicketVerifyKey, verifyConnectionTicket } from '../shared/connection-ticket';
import type { ServerMessage, SignalingPeer } from '../shared/signaling-protocol';
import { ROOM_ADMIN_EVICT, ROOM_ADMIN_ONLINE } from './admin-room';
import type { Env } from './env';
import { findOwnDevice, verifyAccessToken } from './identity';
import {
  createWebSocketPair,
  upgradeResponse,
  type DurableObjectStateLike,
  type HibernatableWebSocket
} from './runtime';
import { CLOSE_EVICTED, CLOSE_UNAUTHORIZED } from './signaling-hub';
import { SignalingRoom } from './signaling-room';

vi.mock('./identity', () => ({ verifyAccessToken: vi.fn(), findOwnDevice: vi.fn() }));
vi.mock('./runtime', async importOriginal => ({
  ...(await importOriginal<typeof import('./runtime')>()),
  createWebSocketPair: vi.fn(),
  upgradeResponse: vi.fn()
}));

class RoomSocket {
  #attachment: unknown = null;
  readonly socket = this as unknown as HibernatableWebSocket;
  readonly sent: ServerMessage[] = [];
  readonly closed: { readonly code?: number; readonly reason?: string }[] = [];
  readyState: number = WebSocket.OPEN;

  readonly send: HibernatableWebSocket['send'] = data => {
    if (typeof data !== 'string') throw new Error('信令响应必须使用文本消息');
    this.sent.push(JSON.parse(data) as ServerMessage);
  };

  close(code?: number, reason?: string): void {
    this.closed.push({ code, reason });
    this.readyState = WebSocket.CLOSED;
  }

  serializeAttachment(value: unknown): void {
    this.#attachment = structuredClone(value);
  }

  deserializeAttachment(): unknown {
    return structuredClone(this.#attachment);
  }
}

const environment = (privateKey: string): Env => ({
  SUPABASE_URL: 'https://supabase.test/',
  SUPABASE_ANON_KEY: 'public-key',
  TICKET_PRIVATE_JWK: privateKey,
  SIGNALING: {
    idFromName: name => name,
    get: () => ({ fetch: async () => new Response(null, { status: 404 }) })
  },
  FILES: {
    head: async () => null,
    get: async () => null,
    put: async () => undefined,
    list: async () => ({ objects: [], truncated: false }),
    delete: async () => undefined
  }
});

const state = (): { readonly context: DurableObjectStateLike; readonly sockets: HibernatableWebSocket[] } => {
  const sockets: HibernatableWebSocket[] = [];
  return {
    sockets,
    context: {
      acceptWebSocket: vi.fn(socket => sockets.push(socket as HibernatableWebSocket)),
      getWebSockets: vi.fn(() => [...sockets])
    }
  };
};

const peer = (name: string): SignalingPeer => ({
  key: `instance-${name}`,
  principal: `user-${name}`,
  userName: `${name}@example.com`,
  deviceId: `device-${name}`,
  deviceName: `${name}'s computer`
});

const hello = (name: string): string =>
  JSON.stringify({
    type: 'hello',
    accessToken: name,
    deviceId: `device-${name}`,
    instanceId: `instance-${name}`
  });

const upgrade = (): Request =>
  new Request('https://worker.test/api/signal', {
    headers: { upgrade: 'WebSocket' }
  });

describe('SignalingRoom', () => {
  let privateKey: string;

  beforeAll(async () => {
    const pair = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])) as CryptoKeyPair;
    privateKey = JSON.stringify(await crypto.subtle.exportKey('jwk', pair.privateKey));
  });

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(verifyAccessToken).mockImplementation(async (_config, token) => ({
      id: `user-${token}`,
      email: `${token}@example.com`
    }));
    vi.mocked(findOwnDevice).mockImplementation(async (_config, token, deviceId) => ({
      id: deviceId,
      name: `${token}'s computer`
    }));
  });

  it('rejects a normal HTTP request without creating a WebSocket', async () => {
    const { context } = state();
    const room = new SignalingRoom(context, environment(''));

    const response = await room.fetch(new Request('https://worker.test/api/signal'));

    expect(response.status).toBe(426);
    await expect(response.text()).resolves.toContain('expected a websocket upgrade');
    expect(createWebSocketPair).not.toHaveBeenCalled();
    expect(context.acceptWebSocket).not.toHaveBeenCalled();
  });

  it('fails before upgrading when the ticket-signing private key is invalid', async () => {
    const { context } = state();
    const room = new SignalingRoom(context, environment('{}'));

    await expect(room.fetch(upgrade())).rejects.toThrow('TICKET_PRIVATE_JWK');

    expect(createWebSocketPair).not.toHaveBeenCalled();
    expect(context.acceptWebSocket).not.toHaveBeenCalled();
    expect(upgradeResponse).not.toHaveBeenCalled();
  });

  it('gives the server socket to the hibernation API and the client socket to the upgrade response', async () => {
    const { context, sockets } = state();
    const client = new RoomSocket();
    const server = new RoomSocket();
    const response = new Response('upgraded');
    vi.mocked(createWebSocketPair).mockReturnValue([client.socket, server.socket]);
    vi.mocked(upgradeResponse).mockReturnValue(response);
    const room = new SignalingRoom(context, environment(privateKey));

    await expect(room.fetch(upgrade())).resolves.toBe(response);

    expect(context.acceptWebSocket).toHaveBeenCalledExactlyOnceWith(server.socket);
    expect(sockets).toEqual([server.socket]);
    expect(upgradeResponse).toHaveBeenCalledExactlyOnceWith(client.socket);
    expect(server.deserializeAttachment()).toBeNull();
    expect(verifyAccessToken).not.toHaveBeenCalled();
  });

  it('persists the authenticated identity in the socket attachment and publishes a public verification key', async () => {
    const { context, sockets } = state();
    const alice = new RoomSocket();
    sockets.push(alice.socket);
    const room = new SignalingRoom(context, environment(privateKey));

    await room.webSocketMessage(alice.socket, hello('alice'));

    expect(alice.deserializeAttachment()).toEqual(peer('alice'));
    const welcome = alice.sent.find(message => message.type === 'welcome');
    expect(welcome).toMatchObject({ self: peer('alice'), peers: [] });
    expect(welcome?.ticketKey).not.toHaveProperty('d');
    expect(findOwnDevice).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://supabase.test', anonKey: 'public-key' }),
      'alice',
      'device-alice'
    );
    expect(alice.closed).toEqual([]);
  });

  it.each(['invalid-token', 'unowned-device'] as const)(
    'refuses %s without persisting an identity',
    async rejection => {
      const { context, sockets } = state();
      const stranger = new RoomSocket();
      sockets.push(stranger.socket);
      if (rejection === 'invalid-token') vi.mocked(verifyAccessToken).mockResolvedValueOnce(null);
      else vi.mocked(findOwnDevice).mockResolvedValueOnce(null);
      const room = new SignalingRoom(context, environment(privateKey));

      await room.webSocketMessage(stranger.socket, hello('stranger'));

      expect(stranger.deserializeAttachment()).toBeNull();
      expect(stranger.sent.at(-1)).toMatchObject({ type: 'error', code: 'unauthorized' });
      expect(stranger.closed).toEqual([{ code: CLOSE_UNAUTHORIZED, reason: 'unauthorized' }]);
      if (rejection === 'invalid-token') expect(findOwnDevice).not.toHaveBeenCalled();
    }
  );

  it('restores presence after hibernation and issues verifiable tickets for restored sockets', async () => {
    const { context, sockets } = state();
    const alice = new RoomSocket();
    sockets.push(alice.socket);
    await new SignalingRoom(context, environment(privateKey)).webSocketMessage(alice.socket, hello('alice'));
    const closed = new RoomSocket();
    closed.serializeAttachment(peer('closed'));
    closed.readyState = WebSocket.CLOSED;
    sockets.push(closed.socket);
    const bob = new RoomSocket();
    sockets.push(bob.socket);
    const awakenedRoom = new SignalingRoom(context, environment(privateKey));

    await awakenedRoom.webSocketMessage(bob.socket, hello('bob'));

    const welcome = bob.sent.find(message => message.type === 'welcome');
    expect(welcome?.peers).toEqual([peer('alice')]);
    expect(alice.sent.at(-1)).toEqual({ type: 'presence', peers: [peer('bob')] });
    await awakenedRoom.webSocketMessage(bob.socket, JSON.stringify({ type: 'connect', to: 'instance-alice' }));
    const initiator = bob.sent.find(message => message.type === 'connection');
    const responder = alice.sent.find(message => message.type === 'connection');
    if (!welcome || !initiator || !responder) throw new Error('恢复后的设备没有完成建连');
    const verifyKey = await importTicketVerifyKey(welcome.ticketKey);
    const expected = { connectionId: initiator.connectionId, now: Date.now() };
    await expect(verifyConnectionTicket(initiator.ticket, verifyKey, expected)).resolves.toMatchObject({
      sub: 'user-bob',
      dev: 'device-bob',
      ins: 'instance-bob'
    });
    await expect(verifyConnectionTicket(responder.ticket, verifyKey, expected)).resolves.toMatchObject({
      sub: 'user-alice',
      dev: 'device-alice',
      ins: 'instance-alice'
    });
  });

  it('rejects binary messages before authentication and preserves authenticated connections on malformed messages', async () => {
    const { context, sockets } = state();
    const stranger = new RoomSocket();
    const alice = new RoomSocket();
    sockets.push(stranger.socket, alice.socket);
    const room = new SignalingRoom(context, environment(privateKey));

    await room.webSocketMessage(stranger.socket, new ArrayBuffer(4));
    await room.webSocketMessage(alice.socket, hello('alice'));
    await room.webSocketMessage(alice.socket, new ArrayBuffer(4));

    expect(stranger.closed).toEqual([{ code: CLOSE_UNAUTHORIZED, reason: 'unauthorized' }]);
    expect(stranger.sent.at(-1)).toMatchObject({ type: 'error', code: 'unauthorized' });
    expect(alice.sent.at(-1)).toMatchObject({ type: 'error', code: 'bad_request' });
    expect(alice.deserializeAttachment()).toEqual(peer('alice'));
    expect(alice.closed).toEqual([]);
  });

  it.each(['webSocketClose', 'webSocketError'] as const)(
    '%s clears the attachment and tells remaining devices',
    async callback => {
      const { context, sockets } = state();
      const alice = new RoomSocket();
      const bob = new RoomSocket();
      sockets.push(alice.socket, bob.socket);
      const room = new SignalingRoom(context, environment(privateKey));
      await room.webSocketMessage(alice.socket, hello('alice'));
      await room.webSocketMessage(bob.socket, hello('bob'));
      bob.readyState = WebSocket.CLOSED;

      await room[callback](bob.socket);

      expect(bob.deserializeAttachment()).toBeNull();
      expect(alice.sent.at(-1)).toEqual({ type: 'presence', peers: [] });
      expect(bob.closed).toEqual([]);
    }
  );

  describe('administration endpoints', () => {
    const internal = (path: string, init?: RequestInit): Request => new Request(`https://room.internal${path}`, init);
    const evict = (body: unknown): Request =>
      internal(ROOM_ADMIN_EVICT, { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) });

    const online = async (...names: string[]) => {
      const { context, sockets } = state();
      const room = new SignalingRoom(context, environment(privateKey));
      const joined = new Map<string, RoomSocket>();
      for (const name of names) {
        const socket = new RoomSocket();
        sockets.push(socket.socket);
        await room.webSocketMessage(socket.socket, hello(name));
        joined.set(name, socket);
      }
      return { room, joined };
    };

    it('lists the authenticated devices without opening a websocket', async () => {
      const { room } = await online('alice', 'bob');

      const response = await room.fetch(internal(ROOM_ADMIN_ONLINE));

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ peers: [peer('alice'), peer('bob')] });
      expect(createWebSocketPair).not.toHaveBeenCalled();
    });

    it('evicts every device of a user and tells the others who is left', async () => {
      const { room, joined } = await online('alice', 'bob');

      const response = await room.fetch(evict({ userId: 'user-bob' }));

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ evicted: 1 });
      expect(joined.get('bob')?.closed).toEqual([{ code: CLOSE_EVICTED, reason: 'removed by an administrator' }]);
      expect(joined.get('bob')?.deserializeAttachment()).toBeNull();
      expect(joined.get('alice')?.sent.at(-1)).toEqual({ type: 'presence', peers: [] });
    });

    it('evicts one device by id and reports zero when it is not online', async () => {
      const { room, joined } = await online('alice', 'bob');

      await expect(room.fetch(evict({ deviceId: 'device-alice' })).then(response => response.json())).resolves.toEqual({
        evicted: 1
      });
      await expect(room.fetch(evict({ deviceId: 'device-alice' })).then(response => response.json())).resolves.toEqual({
        evicted: 0
      });
      expect(joined.get('bob')?.closed).toEqual([]);
    });

    it.each([
      ['an empty object', {}],
      ['both a user and a device', { userId: 'user-bob', deviceId: 'device-bob' }],
      ['an empty id', { userId: '' }],
      ['a non-string id', { deviceId: 7 }],
      ['malformed json', '{'],
      ['a json scalar', '7']
    ])('rejects %s as a bad evict request', async (_label, body) => {
      const { room, joined } = await online('alice');

      const response = await room.fetch(evict(body));

      expect(response.status).toBe(400);
      expect(joined.get('alice')?.closed).toEqual([]);
    });

    it('answers a wrong method with 405 and an unknown administration path with 404', async () => {
      const { room } = await online('alice');

      expect((await room.fetch(internal(ROOM_ADMIN_EVICT))).status).toBe(405);
      expect((await room.fetch(internal(ROOM_ADMIN_ONLINE, { method: 'POST' }))).status).toBe(405);
      expect((await room.fetch(internal('/admin/unknown'))).status).toBe(404);
    });
  });
});
