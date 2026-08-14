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
import {
  get_primary_key_column,
  get_sql_value,
  get_table_name_by_metadata,
  quote_sql_identifier
} from '../sqlite-core.utils.js';

interface TriggerOptions {
  /**
   * 分支 ID
   */
  branchId?: string;
  /**
   * 事务 ID
   */
  transactionId?: string;
  resolveEntityMetadata?: (entity: string, namespace: string) => EntityMetadata | undefined;
}

/**
 * 生成表的触发器
 * @param metadata 实体元数据
 */
export const generate_table_trigger_sql = (entityMetadata: EntityMetadata, options: TriggerOptions = {}) => {
  const tableName = get_table_name_by_metadata(entityMetadata);
  const rxDBChangeMetadata = getEntityMetadata(RxDBChange);
  const rxDBChangeTableName = quote_sql_identifier(get_table_name_by_metadata(rxDBChangeMetadata));
  const { propertyMap, name, foreignKeyNames, foreignKeyColumnNames, namespace } = entityMetadata;

  const isJsonStoredType = (type?: PropertyType): boolean =>
    type === PropertyType.stringArray ||
    type === PropertyType.numberArray ||
    type === PropertyType.json ||
    type === PropertyType.keyValue;

  // 构建 JS 属性名到数据库列名的映射对，并预解析每个字段的类型标记，避免触发器生成时反复查 propertyMap
  interface PropPair {
    jsName: string;
    jsNameSql: string;
    /** 已转义的数据库列名，可直接拼入 NEW./OLD. 引用（保留字、特殊字符列名安全） */
    dbColumn: string;
    isBoolean: boolean;
    isJson: boolean;
    type?: PropertyType;
  }
  const propPairs: PropPair[] = [];
  for (const [jsName, property] of propertyMap) {
    if (jsName === 'id') continue;
    propPairs.push({
      jsName,
      jsNameSql: get_sql_value(jsName) as string,
      dbColumn: quote_sql_identifier(property.columnName),
      // 加密列在库里是 TEXT 信封，任何按声明类型做的转换都是拿密文当明文算：
      // boolean 的 `CASE WHEN col = 1` 对信封串恒假，patch 里会写成 0（明文 false），
      // 密文与真值一起丢失。加密列一律不做转换，原样透传（SQLC-011）
      isBoolean: property.encrypted !== true && property.type === PropertyType.boolean,
      isJson:
        property.encrypted !== true &&
        (isJsonStoredType(property.type as PropertyType | undefined) ||
          property.type === PropertyType.bigint ||
          property.type === PropertyType.binary),
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
      jsNameSql: get_sql_value(foreignKeyNames[i]) as string,
      dbColumn: quote_sql_identifier(fkColumnNames[i]),
      isBoolean: false,
      isJson: type === PropertyType.bigint || type === PropertyType.binary,
      type: type as PropertyType | undefined
    });
  }
  const columns = ` type, namespace, entity, branchId, transactionId, entityId, inversePatch, patch`;
  const { transactionId, branchId } = options;

  const transaction_id = get_sql_value(transactionId);
  const branch_id = get_sql_value(branchId || 'main');
  const namespace_sql = get_sql_value(namespace);
  const name_sql = get_sql_value(name);

  const ids = `${namespace_sql},${name_sql},${branch_id},${transaction_id}`;

  const idType =
    propertyMap.get('id')?.type === PropertyType.bigint ? 'bigint'
    : propertyMap.get('id')?.type === PropertyType.number || propertyMap.get('id')?.type === PropertyType.integer ?
      'number'
    : 'string';
  // 主键物理列名可被 columnName 改写，触发器里的 NEW./OLD. 引用必须跟着走（SQLC-014）
  const primaryKeyColumn = quote_sql_identifier(get_primary_key_column(entityMetadata));
  const getEntityIdExpr = (prefix: 'NEW' | 'OLD') =>
    `${get_sql_value(RXDB_CHANGE_ENTITY_ID_PREFIX)} || json_object(` +
    `${get_sql_value('codecVersion')}, ${RXDB_CHANGE_CODEC_VERSION}, ` +
    `${get_sql_value('schemaVersion')}, ${RXDB_CHANGE_SCHEMA_VERSION}, ` +
    `${get_sql_value('type')}, ${get_sql_value(idType)}, ` +
    `${get_sql_value('value')}, CAST(${prefix}.${primaryKeyColumn} AS TEXT))`;

  const getSpecialValueExpr = (pair: PropPair, prefix: 'NEW' | 'OLD'): string | undefined => {
    if (pair.type !== PropertyType.bigint && pair.type !== PropertyType.binary) return undefined;
    const reference = `${prefix}.${pair.dbColumn}`;
    const type = pair.type === PropertyType.bigint ? 'bigint' : 'binary';
    const value = pair.type === PropertyType.bigint ? `CAST(${reference} AS TEXT)` : `lower(hex(${reference}))`;
    return (
      `CASE WHEN ${reference} IS NULL THEN NULL ELSE json_object(` +
      `${get_sql_value(RXDB_CHANGE_VALUE_ENVELOPE_KEY)}, json_object(` +
      `${get_sql_value('codecVersion')}, ${RXDB_CHANGE_CODEC_VERSION}, ` +
      `${get_sql_value('schemaVersion')}, ${RXDB_CHANGE_SCHEMA_VERSION}, ` +
      `${get_sql_value('type')}, ${get_sql_value(type)}, ` +
      `${get_sql_value('value')}, ${value})) END`
    );
  };

  /**
   * 为字段生成 JSON 值表达式（用于 INSERT/DELETE trigger 的 json_object）
   */
  const getJsonValueExpr = (pair: PropPair, prefix: 'NEW' | 'OLD'): string => {
    const specialValue = getSpecialValueExpr(pair, prefix);
    if (specialValue) return specialValue;
    if (pair.isBoolean) {
      // 必须先判 NULL：`NULL = 1` 求值为 NULL（不是 true），会落到 ELSE 变成 0 ——
      // nullable boolean 的 NULL 就此在历史 patch 里被永久改写成 false，
      // undo/redo 复原出来的是 false 而不是 null（SQLC-018）
      return `CASE WHEN ${prefix}.${pair.dbColumn} IS NULL THEN NULL WHEN ${prefix}.${pair.dbColumn} = 1 THEN 1 ELSE 0 END`;
    }
    if (pair.isJson) {
      return `CASE WHEN ${prefix}.${pair.dbColumn} IS NOT NULL THEN json(${prefix}.${pair.dbColumn}) ELSE NULL END`;
    }
    return `${prefix}.${pair.dbColumn}`;
  };

  /**
   * 为字段生成原始值表达式（用于 UPDATE trigger 的 UNION 子查询）
   */
  const getRawValueExpr = (pair: PropPair, prefix: 'NEW' | 'OLD'): string => {
    const specialValue = getSpecialValueExpr(pair, prefix);
    if (specialValue) return specialValue;
    if (pair.isBoolean) {
      // 必须先判 NULL：`NULL = 1` 求值为 NULL（不是 true），会落到 ELSE 变成 0 ——
      // nullable boolean 的 NULL 就此在历史 patch 里被永久改写成 false，
      // undo/redo 复原出来的是 false 而不是 null（SQLC-018）
      return `CASE WHEN ${prefix}.${pair.dbColumn} IS NULL THEN NULL WHEN ${prefix}.${pair.dbColumn} = 1 THEN 1 ELSE 0 END`;
    }
    return `${prefix}.${pair.dbColumn}`;
  };

  /**
   * 插入触发器
   */
  const insert_trigger = `
  DROP TRIGGER IF EXISTS ${quote_sql_identifier(`${tableName}_insert`)};
  CREATE TRIGGER ${quote_sql_identifier(`${tableName}_insert`)} AFTER INSERT ON ${quote_sql_identifier(tableName)}
  BEGIN
    INSERT INTO ${rxDBChangeTableName} (${columns}) VALUES (
    'INSERT',${ids}, ${getEntityIdExpr('NEW')}, NULL,
      json_object(${propPairs.map(p => `${p.jsNameSql}, ${getJsonValueExpr(p, 'NEW')}`).join(',\n')})
    );
  END;`;

  const buildUpdateUnion = (prefix: 'NEW' | 'OLD') =>
    propPairs
      .map(p => {
        const isJson = p.isJson ? 1 : 0;
        return `SELECT ${p.jsNameSql} AS key, ${getRawValueExpr(p, prefix)} AS value, ${isJson} AS is_json WHERE OLD.${p.dbColumn} IS NOT NEW.${p.dbColumn}`;
      })
      .join('\n UNION ');

  const update_trigger = `
  DROP TRIGGER IF EXISTS ${quote_sql_identifier(`${tableName}_update`)};
  CREATE TRIGGER ${quote_sql_identifier(`${tableName}_update`)} AFTER UPDATE ON ${quote_sql_identifier(tableName)}
    WHEN ( ${propPairs.map(p => `OLD.${p.dbColumn} IS NOT NEW.${p.dbColumn}`).join(' OR\n')} )
  BEGIN
    INSERT INTO ${rxDBChangeTableName} (${columns}) VALUES (
     'UPDATE',${ids}, ${getEntityIdExpr('NEW')},
      (
        SELECT json_group_object(key, CASE WHEN is_json AND value IS NOT NULL THEN json(value) ELSE value END) FROM (
          ${buildUpdateUnion('OLD')}
        )
      ),
      (
        SELECT json_group_object(key, CASE WHEN is_json AND value IS NOT NULL THEN json(value) ELSE value END) FROM (
          ${buildUpdateUnion('NEW')}
        )
      )
    );
  END;`;

  /**
   * 删除触发器
   */
  const delete_trigger = `
  DROP TRIGGER IF EXISTS ${quote_sql_identifier(`${tableName}_delete`)};
  CREATE TRIGGER ${quote_sql_identifier(`${tableName}_delete`)} AFTER DELETE ON ${quote_sql_identifier(tableName)}
  BEGIN
    INSERT INTO ${rxDBChangeTableName} (${columns}) VALUES (
      'DELETE',${ids}, ${getEntityIdExpr('OLD')},
      json_object(${propPairs.map(p => `${p.jsNameSql}, ${getJsonValueExpr(p, 'OLD')}`).join(',\n')}), NULL
    );
  END;`;

  return insert_trigger + '\n' + update_trigger + '\n' + delete_trigger;
};
