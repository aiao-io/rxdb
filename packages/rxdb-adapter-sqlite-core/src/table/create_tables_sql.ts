import { EntityMetadata, EntityType, getEntityMetadata } from '@aiao/rxdb';
import { generate_entity_inserts_sql } from '../entity/inserts_sql.js';
import type { RxDBAdapterSqliteBase } from '../RxDBAdapterSqliteBase.js';
import { get_sql_with_params } from '../sqlite-core.utils.js';
import { create_table_sql } from './create_table_sql.js';
import { generate_table_trigger_sql } from './trigger_sql.js';

/**
 * 生成多张创建表的 SQL
 * @param adapter 适配器实例
 * @param EntityTypes 实体类型数组
 * @param branchId 新表触发器要写入变更历史的分支 id——**必填**。本函数只负责拼 SQL 字符串，
 * 没有事务执行器可用于查询，也不该在这里自己猜：新库首次建表时 `rxdb_branch` 表往往还没有
 * 行（甚至还没建出来），「当前活动分支」这个概念此刻根本读不出来。调用方
 * （{@link RxDBAdapterSqliteBase.createTables}）手里有事务执行器，必须先读出真实值——哪怕
 * 结论就是 main——再传进来，而不是让本函数替它悄悄决定写哪条分支。
 * @param entities 可选，初始数据实体数组
 */
export const create_tables_sql = async <T extends EntityType>(
  adapter: RxDBAdapterSqliteBase,
  EntityTypes: T[],
  branchId: string,
  entities?: InstanceType<T>[]
): Promise<string> => {
  let sql = '';
  for (let i = 0; i < EntityTypes.length; i++) {
    const EntityType = EntityTypes[i];
    const metadata = getEntityMetadata(EntityType);
    sql += '\n' + create_table_sql(adapter, metadata);
    if (metadata.log !== false) {
      const trigger_sql = generate_table_trigger_sql(metadata, {
        branchId,
        resolveEntityMetadata: adapter.encryptionContext.resolveEntityMetadata
      });
      sql += '\n' + trigger_sql;
    }
  }
  if (entities) {
    const need_init_map = new Map<EntityMetadata, Set<EntityType>>();
    entities.forEach(entity => {
      const metadata = getEntityMetadata(entity);
      if (need_init_map.has(metadata) === false) need_init_map.set(metadata, new Set());
      need_init_map.get(metadata)!.add(entity);
    });
    for (const metadata of need_init_map.keys()) {
      const insert_result = await generate_entity_inserts_sql(
        metadata,
        Array.from(need_init_map.get(metadata)!),
        adapter.rxdb.context,
        adapter.encryptionContext
      );
      sql += '\n' + get_sql_with_params(insert_result.sql, insert_result.params);
    }
  }
  return sql;
};
