import { assertOptionalNonNegativeSafeInteger } from '@aiao/rxdb';

/**
 * 校验树查询深度，未提供时保留不限深度的语义。
 *
 * @param level - 查询深度
 * @returns 非负安全整数；未提供时返回 `undefined`
 * @throws 当深度不是非负安全整数时抛出 `RxDBError`
 */
export const assertTreeLevel = (level: number | undefined): number | undefined =>
  assertOptionalNonNegativeSafeInteger(
    level,
    `tree query 'level' must be a non-negative integer, received: ${String(level)}`
  );
