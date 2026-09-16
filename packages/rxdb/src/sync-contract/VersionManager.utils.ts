import { getRxDBEntityIdentityKey, parseRxDBEntityIdentityKey } from '../system/change-codec.js';
import { IRxDBChange } from '../system/system.interface.js';

/**
 * 构造业务实体的唯一键（用于 deletes/updates/inserts Map）
 * @param change - RxDBChange 实例
 * @returns 格式: "namespace:entity:entityId"
 */
export const getRxDBChangeKey = <T extends IRxDBChange>(change: T) =>
  `${change.namespace}:${change.entity}:${getRxDBEntityIdentityKey(change.entityId)}`;

/**
 * 解析实体键
 * @param entityKey - 实体键字符串
 * @returns [namespace, entity, entityId]
 */
export const parseRxDBChangeKey = (entityKey: string) => {
  const first = entityKey.indexOf(':');
  const second = entityKey.indexOf(':', first + 1);
  if (first < 1 || second < first + 2) throw new TypeError(`Invalid RxDB change key: ${entityKey}`);
  const namespace = entityKey.slice(0, first);
  const entity = entityKey.slice(first + 1, second);
  const identity = entityKey.slice(second + 1);
  if (!identity) throw new TypeError(`Invalid RxDB change key: ${entityKey}`);
  return [namespace, entity, parseRxDBEntityIdentityKey(identity)] as const;
};
