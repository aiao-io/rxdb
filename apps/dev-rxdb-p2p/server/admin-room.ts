/**
 * 信令房间的管理入口（US-713）：Worker 的管理路由经内部路径向房间要在线列表、踢设备下线。
 *
 * @remarks
 * 这些路径只由 Worker 在验过管理员之后构造。公开的 `/api/signal` 把原请求交给房间，路径恒为 `/api/signal`，
 * 外部请求到不了 `/admin/*`。
 */
import type { SignalingPeer } from '../shared/signaling-protocol';
import type { DurableObjectNamespaceLike } from './runtime';

/** 房间里管理路径的前缀。 */
export const ROOM_ADMIN_PREFIX = '/admin/';
/** 在线设备列表（GET）。 */
export const ROOM_ADMIN_ONLINE = '/admin/online';
/** 踢设备下线（POST）。 */
export const ROOM_ADMIN_EVICT = '/admin/evict';

/** 踢下线的对象：一个账号的全部在线设备，或某一台设备。 */
export type RoomEvictTarget = { readonly userId: string } | { readonly deviceId: string };

/** Worker 眼里的信令房间。 */
export interface AdminRoom {
  /** 当前在线的设备。 */
  roster(): Promise<readonly SignalingPeer[]>;
  /** 断开匹配的在线设备，返回被断开的连接数。 */
  evict(target: RoomEvictTarget): Promise<number>;
}

const isText = (value: unknown): value is string => typeof value === 'string' && value.length > 0;

/** 校验踢下线的请求体：恰好一个非空的 `userId` 或 `deviceId`。 */
export const parseEvictTarget = (value: unknown): RoomEvictTarget | null => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const { userId, deviceId } = value as Record<string, unknown>;
  if (isText(userId) && deviceId === undefined) return { userId };
  if (isText(deviceId) && userId === undefined) return { deviceId };
  return null;
};

/** 一台在线设备是否在踢下线的范围内。 */
export const matchesEvictTarget = (peer: SignalingPeer, target: RoomEvictTarget): boolean =>
  'userId' in target ? peer.principal === target.userId : peer.deviceId === target.deviceId;

/**
 * 经 Durable Object 绑定调用唯一的信令房间。
 *
 * @throws Error 房间返回非 2xx（调用时抛出）
 */
export const createAdminRoom = (namespace: DurableObjectNamespaceLike, roomName: string): AdminRoom => {
  const call = async <T>(path: string, init?: RequestInit): Promise<T> => {
    const room = namespace.get(namespace.idFromName(roomName));
    const response = await room.fetch(new Request(`https://signaling-room.internal${path}`, init));
    if (!response.ok) throw new Error(`signaling room responded ${response.status}`);
    return (await response.json()) as T;
  };
  return {
    roster: async () => (await call<{ peers: readonly SignalingPeer[] }>(ROOM_ADMIN_ONLINE)).peers,
    evict: async target =>
      (await call<{ evicted: number }>(ROOM_ADMIN_EVICT, { method: 'POST', body: JSON.stringify(target) })).evicted
  };
};
