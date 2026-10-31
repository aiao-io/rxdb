/** 无 VTable 依赖的查询表格状态。 */
import type { OrderBy } from '@aiao/rxdb';
import {
  EntityListController,
  type EntityListControllerOptions,
  type EntityListSnapshot
} from '../entity-list/headless.js';
import type { EntityInstance } from '../entity-list/types.js';

/** 查询表格复用列表状态的无渲染快照。 */
export interface QueryTableSnapshot<T extends EntityInstance = EntityInstance> extends EntityListSnapshot<T> {
  readonly query: unknown;
}
/** 查询表格的初始列表状态及数据源动作。 */
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
/** 创建不装配 VTable 的查询表格控制器。 */
export function createQueryTableController<T extends EntityInstance = EntityInstance>(
  options: QueryTableControllerOptions<T> = {}
): QueryTableController<T> {
  return new QueryTableController(options);
}
/** 查询表格控制器工厂的 headless 别名。 */
export const createQueryTableHeadless = createQueryTableController;
