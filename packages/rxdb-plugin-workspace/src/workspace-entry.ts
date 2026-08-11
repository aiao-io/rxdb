/**
 * @fileoverview IndexedDB 与 BroadcastChannel 共用的草稿记录解码器。
 *
 * @remarks
 * RWS-005：两个入口的数据都是**不可信输入** —— IndexedDB 里可能有旧版本、外部工具或
 * 中断写入留下的记录；BroadcastChannel 的 payload 则可能来自灰度期的新旧版本 tab
 * 或任意同源脚本。早先 restore 直接把 `IDBValidKey` 强转成 `WorkspaceCacheId`
 * 再 `(key as string).split(':')`，一个数字 key 就抛原生 `TypeError`，
 * `install()` 随之失败、`ready` **永久 rejected**，此后每一次 `flush()` 都先在
 * `await this.ready` 上失败 —— **一条坏记录让整个插件报废**。
 *
 * 另一侧的漏洞是身份不自洽：cacheId 的 id 与 `data.id` 不一致时，
 * 会按 `data.id` 建实体缓存、却按 cacheId 的另一个 id 管理 workspace，
 * 同一条草稿被两个身份分别持有。
 *
 * 因此两个入口统一走本模块：**先验证、再触碰实体缓存**。
 *
 * @module rxdb-plugin-workspace/workspace-entry
 */

import type { UUID } from '@aiao/rxdb';

/** `namespace:entity:id` 三段式草稿主键。 */
export type WorkspaceCacheId = `${string}:${string}:${UUID}`;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 解码出的合法草稿身份与数据。 */
export interface WorkspaceEntryIdentity {
  readonly cacheId: WorkspaceCacheId;
  readonly namespace: string;
  readonly entity: string;
  readonly id: UUID;
  readonly data: Record<string, unknown>;
}

/** 无法解码的记录；`key` 原样保留，便于调用方定位并清理。 */
export interface WorkspaceCorruptedEntry {
  readonly key: unknown;
  readonly reason: string;
}

export type WorkspaceEntryDecodeResult =
  { readonly ok: true; readonly entry: WorkspaceEntryIdentity } | { readonly ok: false; readonly reason: string };

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * 校验 `namespace:entity:id` 三段式主键。
 *
 * @returns 合法则返回三段，否则返回失败原因
 */
export const parseWorkspaceCacheId = (
  key: unknown
): { ok: true; namespace: string; entity: string; id: UUID } | { ok: false; reason: string } => {
  if (typeof key !== 'string') return { ok: false, reason: `cache id 不是字符串（${typeof key}）` };

  const segments = key.split(':');
  if (segments.length !== 3) return { ok: false, reason: `cache id 必须是 namespace:entity:id 三段式` };

  const [namespace, entity, id] = segments;
  if (!namespace || !entity) return { ok: false, reason: 'cache id 的 namespace / entity 段不得为空' };
  if (!UUID_PATTERN.test(id)) return { ok: false, reason: `cache id 的 id 段不是合法 UUID：${id}` };

  return { ok: true, namespace, entity, id: id as UUID };
};

/**
 * 解码一条持久化 / 跨 tab 草稿记录。
 *
 * @param key - 记录主键（`IDBValidKey` 或跨 tab 消息里的 `cacheId`）
 * @param data - 记录内容
 * @returns 校验通过的身份与数据，或带原因的失败结果
 *
 * @remarks
 * `data.id` 缺失或与 cacheId 不一致一律判为损坏 —— 生产链路上 NEW 事件的 patch
 * 就是实体本身（必带 `id`），所以合法草稿不会缺这个字段；
 * 放行反而会让 `createEntityRef` 拿到与 workspace 主键不同的身份。
 */
export const decodeWorkspaceEntry = (key: unknown, data: unknown): WorkspaceEntryDecodeResult => {
  const parsed = parseWorkspaceCacheId(key);
  if (!parsed.ok) return { ok: false, reason: parsed.reason };

  if (!isPlainRecord(data))
    return { ok: false, reason: `草稿数据不是普通对象（${Object.prototype.toString.call(data)}）` };
  if (data['id'] !== parsed.id) {
    return { ok: false, reason: `草稿 data.id（${String(data['id'])}）与 cache id 的 ${parsed.id} 不一致` };
  }

  return {
    ok: true,
    entry: {
      cacheId: key as WorkspaceCacheId,
      namespace: parsed.namespace,
      entity: parsed.entity,
      id: parsed.id,
      data
    }
  };
};
