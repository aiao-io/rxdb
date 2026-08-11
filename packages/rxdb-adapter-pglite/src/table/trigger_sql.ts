import {
  EntityMetadata,
  getEntityMetadata,
  PropertyType,
  RXDB_CHANGE_CODEC_VERSION,
  RXDB_CHANGE_ENTITY_ID_PREFIX,
  RXDB_CHANGE_SCHEMA_VERSION,
  RXDB_CHANGE_VALUE_ENVELOPE_KEY,
  RxDBChange
} from '@aiao/rxdb';
import { getTableNameByMetadata } from '../pglite.utils.js';

/**
 * 对用于 SQL 中的标识符进行基本校验，防止注入非法字符。
 * 仅允许以字母或下划线开头，后续为字母、数字或下划线。
 */
function sanitizeIdentifier(name: string): string {
  const IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
  if (!IDENTIFIER_RE.test(name)) {
    throw new Error(`Invalid identifier for SQL generation: "${name}"`);
  }
  return name;
}

/**
 * 对字符串进行转义以便安全地嵌入到单引号 SQL 字面量内。
 * 将单引号翻倍以防逃逸出字面量。
 */
function escapeSqlString(value: string): string {
  return value.replace(/'/g, "''");
}

/**
 * 对用于 SQL 标识符的名称进行转义
 *
 * 在 PostgreSQL 中,双引号内的标识符如果本身包含 `"`，需要写成 `""`。
 */
function escapeIdentifier(identifier: string): string {
  return identifier.replace(/"/g, '""');
}

/**
 * 触发器选项
 */
interface TriggerOptions {
  /** 分支 ID (默认 'main') */
  branchId?: string;
  /** 事务 ID (可选，用于事务内的变更追踪) */
  transactionId?: string;
  resolveEntityMetadata?: (entity: string, namespace: string) => EntityMetadata | undefined;
}

/**
 * 生成 PostgreSQL 触发器 SQL
 *
 * 为实体表生成 INSERT/UPDATE/DELETE 触发器,自动记录所有数据变更到 RxDBChange 表
 * PostgreSQL 触发器需要先创建触发器函数,然后创建触发器本身
 *
 * transactionId 优先读取事务局部 setting，事务提交或回滚后自动失效。
 * 生成期 transactionId 仅保留为兼容旧调用方的 fallback。
 *
 * @param entityMetadata - 实体元数据
 * @param options - 触发器选项
 * @returns 完整的触发器 SQL 语句
 *
 * @example
 * ```typescript
 * const sql = generate_trigger_sql(todoMetadata);
 * await adapter.exec(sql);
 *
 * // 为旧调用方保留生成期 transactionId fallback
 * const sqlWithTx = generate_trigger_sql(todoMetadata, { transactionId: 'tx-123' });
 * await adapter.exec(sqlWithTx);
 * ```
 */
export function generate_trigger_sql(entityMetadata: EntityMetadata, options: TriggerOptions = {}): string {
  const tableName = getTableNameByMetadata(entityMetadata);
  const rxDBChangeMetadata = getEntityMetadata(RxDBChange);
  const rxDBChangeTableName = getTableNameByMetadata(rxDBChangeMetadata);

  const {
    propertyMap,
    name,
    tableName: entityTableName,
    foreignKeyNames,
    foreignKeyColumnNames,
    namespace
  } = entityMetadata;
  const { branchId, transactionId } = options;

  const safeEntityTableName = escapeIdentifier(entityTableName);
  const safeNamespace = escapeIdentifier(namespace);

  // 触发器名称（使用 tableName，因为触发器作用于表）
  const triggerName = `"${safeEntityTableName}_change_trigger"`;

  // 获取所有需要追踪的字段(排除 id,因为 id 作为 entityId 单独记录)
  // 构建 JS 属性名到数据库列名的映射对
  const propPairs: Array<{ jsName: string; dbColumn: string; type?: PropertyType }> = [];
  for (const [jsName, property] of propertyMap) {
    if (jsName === 'id') continue;
    propPairs.push({
      jsName,
      dbColumn: property.columnName,
      type: property.encrypted === true ? undefined : (property.type as PropertyType | undefined)
    });
  }
  // 外键：foreignKeyNames 是 JS 属性名，foreignKeyColumnNames 是数据库列名
  const fkColumnNames = foreignKeyColumnNames || foreignKeyNames;
  for (let i = 0; i < foreignKeyNames.length; i++) {
    if (foreignKeyNames[i] === 'id') continue;
    const relation = entityMetadata.foreignKeyRelationMap?.get(foreignKeyNames[i]);
    const type =
      relation ?
        options
          .resolveEntityMetadata?.(relation.mappedEntity, relation.mappedNamespace ?? entityMetadata.namespace)
          ?.propertyMap.get('id')?.type
      : undefined;
    propPairs.push({
      jsName: foreignKeyNames[i],
      dbColumn: fkColumnNames[i],
      type: type as PropertyType | undefined
    });
  }

  const safePropPairs = propPairs.map(p => ({
    ...p,
    jsName: sanitizeIdentifier(p.jsName),
    dbColumn: sanitizeIdentifier(p.dbColumn)
  }));

  const idType =
    propertyMap.get('id')?.type === PropertyType.bigint ? 'bigint'
    : propertyMap.get('id')?.type === PropertyType.number || propertyMap.get('id')?.type === PropertyType.integer ?
      'number'
    : 'string';
  const entityIdEnvelopePrefix =
    RXDB_CHANGE_ENTITY_ID_PREFIX +
    `{"codecVersion":${RXDB_CHANGE_CODEC_VERSION},"schemaVersion":${RXDB_CHANGE_SCHEMA_VERSION},` +
    `"type":"${idType}","value":`;
  const getEntityIdExpr = (prefix: 'NEW' | 'OLD') =>
    `'${escapeSqlString(entityIdEnvelopePrefix)}' || to_jsonb(${prefix}.id::text)::text || '}'`;
  const getPatchValueExpr = (pair: (typeof safePropPairs)[number], prefix: 'NEW' | 'OLD'): string => {
    const reference = `${prefix}."${escapeIdentifier(pair.dbColumn)}"`;
    if (pair.type !== PropertyType.bigint && pair.type !== PropertyType.binary) return `to_jsonb(${reference})`;
    const type = pair.type === PropertyType.bigint ? 'bigint' : 'binary';
    const value = pair.type === PropertyType.bigint ? `${reference}::text` : `encode(${reference}, 'hex')`;
    return (
      `CASE WHEN ${reference} IS NULL THEN 'null'::jsonb ELSE jsonb_build_object(` +
      `'${escapeSqlString(RXDB_CHANGE_VALUE_ENVELOPE_KEY)}', jsonb_build_object(` +
      `'codecVersion', ${RXDB_CHANGE_CODEC_VERSION}, ` +
      `'schemaVersion', ${RXDB_CHANGE_SCHEMA_VERSION}, ` +
      `'type', '${type}', ` +
      `'value', ${value})) END`
    );
  };

  // RxDBChange 表的列名
  // 顺序设计：固定值(type, namespace, entity) -> 配置项(branchId, transactionId) -> 变化数据(entityId, inversePatch, patch)
  // 这样的顺序便于压缩 VALUES 里的值
  const columns = `type, namespace, entity, "branchId", "transactionId", "entityId", "inversePatch", patch`;

  // 事务 setting 优先；显式生成期值仅用于兼容旧调用方。
  const rawTransactionId = transactionId ?? null;
  const transactionIdFallback = rawTransactionId === null ? 'NULL' : `'${escapeSqlString(rawTransactionId)}'`;
  const transactionIdExpression = `(COALESCE(NULLIF(current_setting('rxdb.transaction_id', true), ''), ${transactionIdFallback}))::uuid`;

  // 分支 ID
  // 归一化为非空字符串；真正的转义在构造 VALUES 列表时进行。
  const rawBranchId = branchId ?? 'main';

  // 触发器函数名 - PostgreSQL 标准格式: schema.function_name
  // 使用 tableName 来命名函数
  const functionFullName = `"${safeNamespace}"."${safeEntityTableName}_change_trigger_fn"`;

  // entity 字段存储实体名称（不是表名），用于标识变更来源
  const values =
    `'${escapeSqlString(namespace)}',` +
    `'${escapeSqlString(name)}',` +
    `'${escapeSqlString(rawBranchId)}',` +
    transactionIdExpression;
  /**
   * 触发器函数
   * PostgreSQL 使用 PL/pgSQL 语言创建触发器函数
   */
  const triggerFunction = `
-- 创建或替换触发器函数
CREATE OR REPLACE FUNCTION ${functionFullName}()
RETURNS TRIGGER AS $$
DECLARE
  old_values JSONB;
  new_values JSONB;
BEGIN
  -- INSERT 操作
  IF (TG_OP = 'INSERT') THEN
    INSERT INTO ${rxDBChangeTableName} (${columns})
    VALUES (
      'INSERT',
      ${values},
      ${getEntityIdExpr('NEW')},
      NULL,
      jsonb_build_object(${safePropPairs.map(p => `'${escapeSqlString(p.jsName)}', ${getPatchValueExpr(p, 'NEW')}`).join(', ')})
    );
    RETURN NEW;

  -- UPDATE 操作
  ELSIF (TG_OP = 'UPDATE') THEN
    -- 只在字段真正变更时记录
    IF (${safePropPairs.map(p => `OLD."${escapeIdentifier(p.dbColumn)}" IS DISTINCT FROM NEW."${escapeIdentifier(p.dbColumn)}"`).join(' OR ')}) THEN
      -- 构建变更前的值 (inversePatch - 只包含变更的字段，保留 NULL 值)
      old_values := '{}'::jsonb;
      ${safePropPairs.map(p => `IF OLD."${escapeIdentifier(p.dbColumn)}" IS DISTINCT FROM NEW."${escapeIdentifier(p.dbColumn)}" THEN old_values := old_values || jsonb_build_object('${escapeSqlString(p.jsName)}', ${getPatchValueExpr(p, 'OLD')}); END IF;`).join('\n      ')}

      -- 构建变更后的值 (patch - 只包含变更的字段，保留 NULL 值)
      new_values := '{}'::jsonb;
      ${safePropPairs.map(p => `IF OLD."${escapeIdentifier(p.dbColumn)}" IS DISTINCT FROM NEW."${escapeIdentifier(p.dbColumn)}" THEN new_values := new_values || jsonb_build_object('${escapeSqlString(p.jsName)}', ${getPatchValueExpr(p, 'NEW')}); END IF;`).join('\n      ')}

      INSERT INTO ${rxDBChangeTableName} (${columns})
      VALUES (
        'UPDATE',
        ${values},
        ${getEntityIdExpr('NEW')},
        old_values,
        new_values
      );
    END IF;
    RETURN NEW;

  -- DELETE 操作
  ELSIF (TG_OP = 'DELETE') THEN
    INSERT INTO ${rxDBChangeTableName} (${columns})
    VALUES (
      'DELETE',
      ${values},
      ${getEntityIdExpr('OLD')},
      jsonb_build_object(${safePropPairs.map(p => `'${escapeSqlString(p.jsName)}', ${getPatchValueExpr(p, 'OLD')}`).join(', ')}),
      NULL
    );
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;`;

  /**
   * 创建触发器
   * PostgreSQL 需要为 INSERT/UPDATE/DELETE 分别创建触发器,或使用单个触发器监听所有操作
   */
  const dropTrigger = `
-- 删除已存在的触发器
DROP TRIGGER IF EXISTS ${triggerName} ON ${tableName}`;

  const createTrigger = `
-- 创建触发器 (监听 INSERT, UPDATE, DELETE)
CREATE TRIGGER ${triggerName}
  AFTER INSERT OR UPDATE OR DELETE ON ${tableName}
  FOR EACH ROW
  EXECUTE FUNCTION ${functionFullName}()`;

  // 返回三个独立的 SQL 语句（用换行符分隔，便于拆分）
  return [triggerFunction, dropTrigger, createTrigger].join('\n---STATEMENT_SEPARATOR---\n');
}

export default generate_trigger_sql;
