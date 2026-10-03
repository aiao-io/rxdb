/**
 * @fileoverview 手动排序单测共用的内存仓库与断言（US-028）
 *
 * 内存仓库的 `find` 照核心同源的 `isEntityMatchWhere` / `calculateOrderBy` 过滤排序，
 * 读尾键、读邻居、复核相邻因此都真实走过一遍；「两端 SQL 同序」与并发由 rxdb-test 契约套件验证。
 * 行与实体共享实例；与真实适配器一样，写成功后把写入的字段前移进实体状态的 `origin`——
 * 排序计算只认 `origin`（落库值），直接改实例而不经仓库写入等同于未保存的编辑。
 */

import { expect, vi } from 'vitest';
import type { EntityBase } from '../../../entity/entity-base.js';
import { calculateOrderBy, isEntityMatchWhere } from '../../../query/query-matching.utils.js';
import type { FindOptions } from '../../../repository/query-options.interface.js';
import { getEntityStatus } from '../../../rxdb-utils.js';
import { SortOrderError, type SortOrderErrorReason } from '../../../sortable/sortable-error.js';

export type Sortable = EntityBase & { title: string; sortOrder?: string | null };

/** 写成功：写入的字段并进 `origin`，脏标记按剩余差异重算 */
const persist = (entity: object, written: object): void => {
  const status = getEntityStatus(entity);
  status.origin = { ...status.origin, ...structuredClone(written) };
  status.invalidateCache();
  status.modified = Object.keys(status.patch).length > 0;
};

/** 绕开门面直接改「库」里的行（模拟同步拉取或旧数据落库的脏值），不留未保存编辑 */
export const writeStored = <R extends Sortable>(row: R, values: Partial<R>): void => {
  Object.assign(row, values);
  persist(row, values);
};

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
      persist(entity, { ...getEntityStatus(entity).target });
      return entity;
    }),
    update: vi.fn(async (entity: R, patch: Partial<R>) => {
      Object.assign(entity, patch);
      persist(entity, patch);
      return entity;
    }),
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
