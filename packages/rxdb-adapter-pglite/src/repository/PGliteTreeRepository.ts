import { EntityType } from '@aiao/rxdb';
import type { FindTreeOptions, ITreeRepository } from '@aiao/rxdb-plugin-tree';
import { RxdbAdapterPGliteError } from '../pglite.utils.js';
import {
  generate_entity_count_ancestors_sql,
  generate_entity_count_descendants_sql,
  generate_entity_find_ancestors_sql,
  generate_entity_find_descendants_sql
} from '../query/query_tree_sql.js';
import { PGliteRepository } from './PGliteRepository.js';

const parseCountResult = (value: unknown): number => {
  const integerString = typeof value === 'string' && /^-?\d+$/.test(value);
  if (typeof value !== 'number' && typeof value !== 'bigint' && !integerString) {
    throw new RxdbAdapterPGliteError('PGlite count query returned an invalid result', 'invalid_count_result');
  }

  const count = Number(value);
  if (!Number.isSafeInteger(count)) {
    throw new RxdbAdapterPGliteError('PGlite count query exceeded the safe integer range', 'invalid_count_result');
  }
  // 树计数契约是非负（节点不存在/已删除 ≡ 空集 ≡ 0，RV-079）；SQL 侧已用 GREATEST 钳在 0，
  // 这里再做一次防线：任何负数都说明 SQL 契约被破坏，不能当成"合法的 -1"悄悄放过去。
  if (count < 0) {
    throw new RxdbAdapterPGliteError('PGlite count query returned a negative result', 'invalid_count_result');
  }
  return count;
};

/**
 * PGlite 树形实体仓库
 * 支持树形结构实体的递归查询
 */
export class PGliteTreeRepository<T extends EntityType> extends PGliteRepository<T> implements ITreeRepository<T> {
  async findDescendants(options: FindTreeOptions<T>): Promise<InstanceType<T>[]> {
    const { sql, params } = generate_entity_find_descendants_sql(this.adapter, this.metadata, options);
    const result = await this.adapter.query(sql, params);
    return this.addQueryCache(result, true);
  }

  async countDescendants(options: FindTreeOptions<T>): Promise<number> {
    const { sql, params } = generate_entity_count_descendants_sql(this.adapter, this.metadata, options);
    const result = await this.adapter.query(sql, params);
    return parseCountResult(result.rows[0]?.['count']);
  }

  async findAncestors(options: FindTreeOptions<T>): Promise<InstanceType<T>[]> {
    const { sql, params } = generate_entity_find_ancestors_sql(this.adapter, this.metadata, options);
    const result = await this.adapter.query(sql, params);
    return this.addQueryCache(result, true);
  }

  async countAncestors(options: FindTreeOptions<T>): Promise<number> {
    const { sql, params } = generate_entity_count_ancestors_sql(this.adapter, this.metadata, options);
    const result = await this.adapter.query(sql, params);
    return parseCountResult(result.rows[0]?.['count']);
  }
}
