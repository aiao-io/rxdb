/**
 * @fileoverview 实体指纹计算工具
 * 用于 QueryManager 缓存去重判断
 */

import { EntityType } from '../entity/entity.interface.js';
import { getEntityStatus } from '../rxdb-utils.js';

/**
 * 指纹类型
 */
export type Fingerprint = string | number | boolean | null | undefined;

/**
 * 值类型指纹计算
 * 用于 count 等返回原始值的查询
 *
 * @param value - 要计算指纹的值
 * @returns 指纹数组
 */
export const getFingerprintPrimitive = <T extends Fingerprint>(value: T | T[]): Fingerprint[] =>
  Array.isArray(value) ? value : [value];

/**
 * 单个实体指纹计算
 *
 * @param entity - 要计算指纹的实体
 * @returns 指纹数组
 */
export const getFingerprintByEntity = <T extends EntityType>(
  entity: InstanceType<T> | null | undefined
): Fingerprint[] => {
  if (!entity) return [entity];
  const status = getEntityStatus(entity);
  return [status.fingerprint];
};

/**
 * 多个实体指纹计算
 *
 * @param entities - 要计算指纹的实体数组
 * @returns 指纹数组
 */
export const getFingerprintByEntities = <T extends EntityType>(entities: InstanceType<T>[]): Fingerprint[] =>
  entities.map(entity => {
    const status = getEntityStatus(entity);
    return status.fingerprint;
  });
