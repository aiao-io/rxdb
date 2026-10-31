/** 无 VTable 依赖的查询表格状态。 */
import type { OrderBy } from '@aiao/rxdb';
import {
  EntityListController,
  type EntityListControllerOptions,
  type EntityListSnapshot
} from '../entity-list/headless.js';
import type { EntityInstance } from '../entity-list/types.js';

export interface QueryTableSnapshot<T extends EntityInstance = EntityInstance> extends EntityListSnapshot<T> {
  readonly query: unknown;
}
export interface QueryTableControllerOptions<
  T extends EntityInstance = EntityInstance
> extends EntityListControllerOptions<T> {
  readonly query?: unknown;
}

/** QueryTable 的查询、分页、排序、选择状态；渲染可由消费方完全接管。 */
export class QueryTableController<T extends EntityInstance = EntityInstance> extends EntityListController<T> {
  override get snapshot(): QueryTableSnapshot<T> {
    return super.snapshot as QueryTableSnapshot<T>;
  }
  override setQuery(query: unknown): void {
    super.setQuery(query);
  }
  override setSorts(sorts: readonly OrderBy[]): void {
    super.setSorts(sorts);
  }
}
export function createQueryTableController<T extends EntityInstance = EntityInstance>(
  options: QueryTableControllerOptions<T> = {}
): QueryTableController<T> {
  return new QueryTableController(options);
}
export const createQueryTableHeadless = createQueryTableController;
