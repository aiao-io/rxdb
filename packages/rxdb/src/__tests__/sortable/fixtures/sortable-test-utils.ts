/**
 * @fileoverview 手动排序单测共用的内存仓库与断言（US-028）
 *
 * 内存仓库的 `find` 照核心同源的 `isEntityMatchWhere` / `calculateOrderBy` 过滤排序，
 * 读尾键、读邻居、复核相邻因此都真实走过一遍；「两端 SQL 同序」与并发由 rxdb-test 契约套件验证。
 * 行与实体共享实例：改了实体就等于改了「库」，事务内的锚点读取须排除正在移动的行自己。
 */

import { expect, vi } from 'vitest';
import type { EntityBase } from '../../../entity/entity-base.js';
import { calculateOrderBy, isEntityMatchWhere } from '../../../query/query-matching.utils.js';
import type { FindOptions } from '../../../repository/query-options.interface.js';
import { SortOrderError, type SortOrderErrorReason } from '../../../sortable/sortable-error.js';

export type Sortable = EntityBase & { title: string; sortOrder?: string | null };

/** 按核心同源的判定原语过滤 / 排序 / 分页的内存仓库 */
export const memoryRepository = <R extends Sortable>(rows: R[]) => {
  const find = vi.fn(async (options: FindOptions) => {
    const matched = rows.filter(row => isEntityMatchWhere(row, options.where));
    const ordered = options.orderBy?.length ? calculateOrderBy(matched, options.orderBy) : matched;
    const offset = options.offset ?? 0;
    return ordered.slice(offset, options.limit === undefined ? undefined : offset + options.limit);
  });
  return {
    rows,
    find,
    count: vi.fn(async () => rows.length),
    create: vi.fn(async (entity: R) => {
      rows.push(entity);
      return entity;
    }),
    update: vi.fn(async (entity: R, patch: Partial<R>) => Object.assign(entity, patch)),
    remove: vi.fn(async (entity: R) => entity)
  };
};

export type MemoryRepository<R extends Sortable = Sortable> = ReturnType<typeof memoryRepository<R>>;

export const rejectionOf = (write: Promise<unknown>): Promise<unknown> =>
  write.then(
    () => {
      throw new Error('写入应被拒绝，却成功了');
    },
    (error: unknown) => error
  );

export const expectSortOrderError = async (write: Promise<unknown>, reason: SortOrderErrorReason): Promise<void> => {
  const error = await rejectionOf(write);
  expect(error).toBeInstanceOf(SortOrderError);
  expect((error as SortOrderError).reason).toBe(reason);
};

/** 码点序比较，与排序键的契约同口径 */
export const byCodePoint = (a: string, b: string): number =>
  a < b ? -1
  : a > b ? 1
  : 0;
