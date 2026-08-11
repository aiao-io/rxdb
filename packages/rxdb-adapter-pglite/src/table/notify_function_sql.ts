/**
 * T009-T010: PostgreSQL NOTIFY 触发器函数生成
 *
 * 为表创建触发器，在 INSERT/UPDATE/DELETE 时通过 NOTIFY 发送变更事件
 */

/**
 * 生成 NOTIFY 触发器函数 SQL
 *
 * 创建一个通用的 trigger function，可以在多个表上复用
 * 触发器会：
 * 1. 收集当前事务中的所有变更
 * 2. 批量发送 NOTIFY 消息（包含 operation 和 id 数组）
 * 3. 使用 JSON 格式传递 payload
 *
 * @returns SQL 语句，创建 notify_change() 函数
 */
export function generateNotifyFunctionSQL(): string {
  return `
-- 创建触发器函数（如果不存在）
CREATE OR REPLACE FUNCTION notify_change()
RETURNS TRIGGER AS $$
DECLARE
  payload JSON;
  notification_channel TEXT;
  row_id TEXT;
BEGIN
  -- 确定通知频道名称：表名_notify
  notification_channel := TG_TABLE_NAME || '_notify';

  -- 获取受影响行的 ID
  IF TG_OP = 'DELETE' THEN
    row_id := OLD.id;
  ELSE
    row_id := NEW.id;
  END IF;

  -- 构建 JSON payload
  payload := json_build_object(
    'operation', TG_OP,
    'table', TG_TABLE_NAME,
    'ids', json_build_array(row_id)
  );

  -- 发送 NOTIFY
  PERFORM pg_notify(notification_channel, payload::text);

  -- 触发器必须返回行
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;
`.trim();
}

/**
 * 为指定表创建 NOTIFY 触发器
 *
 * 触发器会在 INSERT, UPDATE, DELETE 后触发
 * AFTER 触发器确保变更已提交
 *
 * @param tableName - 表名（例如 "public$RxDBChange"）
 * @returns SQL 语句，创建触发器（包含表存在性检查）
 */
export function generateNotifyTriggerSQL(tableName: string): string {
  const schemaName =
    tableName === 'rxdb_change' || tableName === 'rxdb_branch' || tableName === 'rxdb_migration' ? 'rxdb' : 'public';
  const triggerName = `${tableName}_notify_trigger`;
  const qualifiedTableName = `"${schemaName}"."${tableName}"`;

  return `
-- 只在表存在时创建触发器
DO $$
BEGIN
  IF EXISTS (
    SELECT FROM pg_tables
    WHERE schemaname = '${schemaName}'
    AND tablename = '${tableName}'
  ) THEN
    -- 删除旧触发器（如果存在）
    DROP TRIGGER IF EXISTS "${triggerName}" ON ${qualifiedTableName};

    -- 创建触发器
    CREATE TRIGGER "${triggerName}"
      AFTER INSERT OR UPDATE OR DELETE
      ON ${qualifiedTableName}
      FOR EACH ROW
      EXECUTE FUNCTION notify_change();
  END IF;
END $$;
`.trim();
}

/**
 * 移除表的 NOTIFY 触发器
 *
 * @param tableName - 表名
 * @returns SQL 语句，删除触发器
 */
export function removeNotifyTriggerSQL(tableName: string): string {
  const schemaName =
    tableName === 'rxdb_change' || tableName === 'rxdb_branch' || tableName === 'rxdb_migration' ? 'rxdb' : 'public';
  const triggerName = `${tableName}_notify_trigger`;
  return `DROP TRIGGER IF EXISTS "${triggerName}" ON "${schemaName}"."${tableName}";`;
}

/**
 * 生成完整的 NOTIFY 基础设施 SQL
 *
 * 包括：
 * 1. 创建 notify_change() 函数
 * 2. 为监控表创建触发器
 *
 * @param watchTables - 需要监控的表名数组（不含 schema 前缀，如 'rxdb_change'）
 * @returns 完整的 SQL 语句
 */
export function generateNotifyInfrastructureSQL(
  watchTables: string[] = ['rxdb_change', 'rxdb_branch', 'rxdb_migration']
): string {
  const statements: string[] = [];

  // 1. 创建函数
  statements.push(generateNotifyFunctionSQL());

  // 2. 为每个表创建触发器
  for (const tableName of watchTables) {
    statements.push(generateNotifyTriggerSQL(tableName));
  }

  return statements.join('\n\n');
}
