/**
 * @fileoverview ID 生成工具
 */

import { v7 as uuid } from 'uuid';

/**
 * 生成唯一 ID
 * 用于 QueryBuilder 规则和规则组的标识
 *
 * @returns 唯一 ID 字符串（uuid v7）
 */
export function generateId(): string {
  return uuid();
}
