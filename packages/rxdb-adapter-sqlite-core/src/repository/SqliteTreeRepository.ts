import { EntityType, FindTreeOptions, ITreeRepository } from '@aiao/rxdb';
import {
  generate_entity_count_ancestors_sql,
  generate_entity_count_descendants_sql,
  generate_entity_find_ancestors_sql,
  generate_entity_find_descendants_sql
} from '../query/query_tree_sql.js';
import { SqliteRepository } from './SqliteRepository.js';

/**
 * 树形实体仓库
 *
 * `findDescendants` / `findAncestors` 一律 `addQueryCache(result, true)`（forcedUpdate）。
 *
 * 这不只是为了刷新 `hasChildren` 等计算属性——非 forced 路径已经会刷新计算属性。
 * forcedUpdate 同时把 `state.origin` 重置为数据库行，从而抵消 **P0-004**：
 * 迟到的本 tab CREATE/UPDATE 事件经 `QueryManager#serialize` → `createEntityRef`
 * → `EntityStatus.replace` 会把活实体与 origin 一起回写成旧值，
 * 之后的 `save()` 因 `patch === {}` 静默丢写。
 *
 * 代价：会覆盖调用方未保存的本地编辑。P0-004 修好之前**不要**改回非 forced，
 * 否则 `findAncestors` 订阅在父级二次变更时不再发射
 * （见 `shared-tree.suite.ts` 「findAncestors 订阅：父级变更应触发增量更新」）。
 * 与 `PGliteTreeRepository` 保持一致。
 */
export class SqliteTreeRepository<T extends EntityType> extends SqliteRepository<T> implements ITreeRepository<T> {
  async findDescendants(options: FindTreeOptions<T>): Promise<InstanceType<T>[]> {
    const { sql, params } = generate_entity_find_descendants_sql(this.adapter, this.metadata, options);
    const result = await this.adapter.query(sql, params);
    return this.addQueryCache(result, true);
  }

  async countDescendants(options: FindTreeOptions<T>): Promise<number> {
    const { sql, params } = generate_entity_count_descendants_sql(this.adapter, this.metadata, options);
    const result = await this.adapter.query(sql, params);
    return result.results[0].rows[0][0] as number;
  }

  async findAncestors(options: FindTreeOptions<T>): Promise<InstanceType<T>[]> {
    const { sql, params } = generate_entity_find_ancestors_sql(this.adapter, this.metadata, options);
    const result = await this.adapter.query(sql, params);
    return this.addQueryCache(result, true);
  }

  async countAncestors(options: FindTreeOptions<T>): Promise<number> {
    const { sql, params } = generate_entity_count_ancestors_sql(this.adapter, this.metadata, options);
    const result = await this.adapter.query(sql, params);
    return result.results[0].rows[0][0] as number;
  }
}
