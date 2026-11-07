// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import type { SignalingPeer } from '../shared/signaling-protocol';
import {
  createAdminRoom,
  matchesEvictTarget,
  parseEvictTarget,
  ROOM_ADMIN_EVICT,
  ROOM_ADMIN_ONLINE
} from './admin-room';
import type { DurableObjectNamespaceLike } from './runtime';

const peer = (name: string): SignalingPeer => ({
  key: `instance-${name}`,
  principal: `user-${name}`,
  userName: `${name}@example.com`,
  deviceId: `device-${name}`,
  deviceName: `${name}'s computer`
});

const namespaceWith = (handler: (request: Request) => Response) => {
  const fetch = vi.fn(async (request: Request) => handler(request));
  const namespace: DurableObjectNamespaceLike = {
    idFromName: vi.fn(name => `id:${name}`),
    get: vi.fn(() => ({ fetch }))
  };
  return { namespace, fetch };
};

describe('createAdminRoom', () => {
  it('reads the roster from the one room object', async () => {
    const { namespace, fetch } = namespaceWith(() => Response.json({ peers: [peer('alice')] }));

    await expect(createAdminRoom(namespace, 'lobby').roster()).resolves.toEqual([peer('alice')]);

    expect(namespace.idFromName).toHaveBeenCalledWith('lobby');
    expect(namespace.get).toHaveBeenCalledWith('id:lobby');
    const request = fetch.mock.calls[0]![0];
    expect(new URL(request.url).pathname).toBe(ROOM_ADMIN_ONLINE);
    expect(request.method).toBe('GET');
  });

  it('posts the eviction target and returns how many connections were closed', async () => {
    const { namespace, fetch } = namespaceWith(() => Response.json({ evicted: 2 }));

    await expect(createAdminRoom(namespace, 'lobby').evict({ userId: 'user-bob' })).resolves.toBe(2);

    const request = fetch.mock.calls[0]![0];
    expect(new URL(request.url).pathname).toBe(ROOM_ADMIN_EVICT);
    expect(request.method).toBe('POST');
    await expect(request.json()).resolves.toEqual({ userId: 'user-bob' });
  });

  it('reports a failing room instead of pretending nothing happened', async () => {
    const { namespace } = namespaceWith(() => new Response('boom', { status: 500 }));
    const room = createAdminRoom(namespace, 'lobby');

    await expect(room.roster()).rejects.toThrow('signaling room responded 500');
    await expect(room.evict({ deviceId: 'device-bob' })).rejects.toThrow('signaling room responded 500');
  });
});

describe('parseEvictTarget', () => {
  it.each([
    [{ userId: 'user-bob' }, { userId: 'user-bob' }],
    [{ deviceId: 'device-bob' }, { deviceId: 'device-bob' }]
  ])('accepts exactly one non-empty id (%j)', (value, expected) => {
    expect(parseEvictTarget(value)).toEqual(expected);
  });

  it.each([
    {},
    { userId: 'user-bob', deviceId: 'device-bob' },
    { userId: '' },
    { deviceId: 7 },
    [],
    null,
    'user-bob',
    7
  ])('rejects %j', value => {
    expect(parseEvictTarget(value)).toBeNull();
  });
});

describe('matchesEvictTarget', () => {
  it('matches by user across all of the user devices, or by exactly one device', () => {
    expect(matchesEvictTarget(peer('bob'), { userId: 'user-bob' })).toBe(true);
    expect(matchesEvictTarget(peer('bob'), { userId: 'user-alice' })).toBe(false);
    expect(matchesEvictTarget(peer('bob'), { deviceId: 'device-bob' })).toBe(true);
    expect(matchesEvictTarget(peer('bob'), { deviceId: 'device-alice' })).toBe(false);
  });
});
