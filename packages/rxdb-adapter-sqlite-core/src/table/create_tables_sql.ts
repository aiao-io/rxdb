import { EntityMetadata, EntityType, getEntityMetadata, MAIN_BRANCH_ID } from '@aiao/rxdb';
import { generate_entity_inserts_sql } from '../entity/inserts_sql.js';
import type { RxDBAdapterSqliteBase } from '../RxDBAdapterSqliteBase.js';
import { get_sql_with_params } from '../sqlite-core.utils.js';
import { create_table_sql } from './create_table_sql.js';
import { generate_table_trigger_sql } from './trigger_sql.js';

/**
 * 生成多张创建表的 SQL
 * @param adapter 适配器实例
 * @param EntityTypes 实体类型数组
 * @param entities 可选，初始数据实体数组
 */
export const create_tables_sql = async <T extends EntityType>(
  adapter: RxDBAdapterSqliteBase,
  EntityTypes: T[],
  entities?: InstanceType<T>[]
): Promise<string> => {
  let sql = '';
  for (let i = 0; i < EntityTypes.length; i++) {
    const EntityType = EntityTypes[i];
    const metadata = getEntityMetadata(EntityType);
    sql += '\n' + create_table_sql(adapter, metadata);
    if (metadata.log !== false) {
      // 建表期固定写根分支，不去读当前活动分支：新库走到这里时 `rxdb_branch` 表**正在**本次调用里
      // 被建出来，没有行可读。既有库补建缺失实体表（`RxDB.#ensureEntityTables`）时读得到，但读回来的
      // 分支对这张**空表**没有意义——第一次写入前，默认事务会先按真实当前分支把全部触发器重建一遍
      // （`#run_transaction` → {@link switch_transaction_id}），这张表的触发器那时才真正生效。
      // 漏网的只有绕开事务日志的裸写窗口（不经 `transaction()` 的裸写），与迁移侧
      // {@link RxDBAdapterSqliteBase.migrateSystemSchema} 重挂触发器那一步是同一个缺口：那一步已改为读真实活动
      // 分支（`readActiveBranchIdForMigration`），这里读不到——差别就在「`rxdb_branch` 此刻有没有行」。
      const trigger_sql = generate_table_trigger_sql(metadata, {
        branchId: MAIN_BRANCH_ID,
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
