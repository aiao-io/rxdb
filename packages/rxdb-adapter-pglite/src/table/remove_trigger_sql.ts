import type { EntityMetadata } from '@aiao/rxdb';
import { getEntityMetadata } from '@aiao/rxdb';
import { getTableNameByMetadata } from '../pglite.utils.js';
import type { RxDBAdapterPGlite } from '../RxDBAdapterPGlite.js';

/**
 * 生成删除单个实体触发器的 SQL
 *
 * 为指定实体生成删除触发器和触发器函数的 SQL 语句
 *
 * @param entityMetadata - 实体元数据
 * @returns 删除触发器的 SQL 语句(包含 DROP TRIGGER 和 DROP FUNCTION)
 *
 * @example
 * ```typescript
 * const metadata = getEntityMetadata(Todo);
 * const sql = remove_trigger_sql(metadata);
 * // 返回:
 * // DROP TRIGGER IF EXISTS "todos_change_trigger" ON "public"."todos"
 * // ---STATEMENT_SEPARATOR---
 * // DROP FUNCTION IF EXISTS "public"."todos_change_trigger_fn"() CASCADE
 * ```
 */
export function remove_trigger_sql(entityMetadata: EntityMetadata): string {
  const tableName = getTableNameByMetadata(entityMetadata);
  const { tableName: entityTableName, namespace } = entityMetadata;

  // 触发器名称(使用 tableName，因为触发器作用于表)
  const triggerName = `"${entityTableName}_change_trigger"`;

  // 触发器函数名(带 schema，使用 tableName)
  const functionFullName = `"${namespace}"."${entityTableName}_change_trigger_fn"`;

  // 1. 删除触发器
  const dropTrigger = `DROP TRIGGER IF EXISTS ${triggerName} ON ${tableName}`;

  // 2. 删除触发器函数(CASCADE 确保依赖的触发器也被删除)
  const dropFunction = `DROP FUNCTION IF EXISTS ${functionFullName}() CASCADE`;

  // 返回两个语句(用分隔符连接)
  return [dropTrigger, dropFunction].join('\n---STATEMENT_SEPARATOR---\n');
}

/**
 * 生成删除所有实体触发器的 SQL
 *
 * 遍历所有启用日志的实体(log !== false)，生成删除触发器的 SQL
 *
 * @param adapter - PGlite 适配器实例
 * @returns 删除所有触发器的 SQL 语句(每个实体的语句用 ---STATEMENT_SEPARATOR--- 分隔)
 *
 * @example
 * ```typescript
 * const sql = remove_all_triggers_sql(adapter);
 * const statements = sql.split('---STATEMENT_SEPARATOR---');
 * for (const statement of statements) {
 *   await adapter.query(statement);
 * }
 * ```
 */
export function remove_all_triggers_sql(adapter: RxDBAdapterPGlite): string {
  const sqlParts: string[] = [];

  adapter.rxdb.config.entities.forEach(EntityType => {
    const metadata = getEntityMetadata(EntityType);

    // 只删除启用了日志功能的实体的触发器
    if (metadata.log !== false) {
      sqlParts.push(remove_trigger_sql(metadata));
    }
  });

  // 每个 remove_trigger_sql 返回两条语句(DROP TRIGGER + DROP FUNCTION)
  // 用分隔符连接,确保所有语句都能正确分割
  return sqlParts.join('\n---STATEMENT_SEPARATOR---\n');
}

export default remove_all_triggers_sql;
