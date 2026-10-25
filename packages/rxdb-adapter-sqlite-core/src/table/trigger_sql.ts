import {
  EntityMetadata,
  getEntityMetadata,
  PropertyType,
  RXDB_CHANGE_CODEC_VERSION,
  RXDB_CHANGE_ENTITY_ID_PREFIX,
  RXDB_CHANGE_SCHEMA_VERSION,
  RXDB_CHANGE_VALUE_ENVELOPE_KEY,
  RxDBChange,
  WorktreeTableSet,
  type UUID
} from '@aiao/rxdb';
import type { RxDBAdapterSqliteBase } from '../RxDBAdapterSqliteBase.js';
import {
  get_primary_key_column,
  get_sql_value,
  quote_sql_identifier,
  RxDBAdapterSqliteError
} from '../sqlite-core.utils.js';
import { get_table_name_by_metadata } from '../table-name-resolver.js';

interface TriggerOptions {
  /**
   * 分支 ID —— **必填**。
   *
   * @remarks
   * 这个值被硬编码进触发器的 `INSERT ... VALUES` 里，决定这张表**后续每一次写入**被记到哪条
   * 分支名下。生成器替调用方填一个默认分支，等于在「这条历史算谁的」上替人做主，而做错了不报错：
   * 库停在 `feature`、触发器写着 `main`，写入照样成功，只有事后审计历史才看得出来。
   *
   * 所以每个调用点都要自己说明写的是哪条分支——包括那些确实就该写 `main` 的（新库建表、
   * 迁移中途重建），它们给出的是一个有理由的取值，不是一个没人填所以顶上来的取值。
   */
  branchId: string;
  /**
   * 触发器挂在哪一套业务表上——**必填**，理由同 {@link TriggerOptions.branchId}：
   * 挂错一套，那一套的写入照样成功，只是记成了别的检出位的分支（US-314）。
   */
  tableSet: WorktreeTableSet;
  /**
   * 事务 ID
   */
  transactionId?: string;
  resolveEntityMetadata?: (entity: string, namespace: string) => EntityMetadata | undefined;
}

/**
 * 生成表的触发器
 * @param metadata 实体元数据
 * @param options 触发器选项，见 {@link TriggerOptions}
 */
export const generate_table_trigger_sql = (entityMetadata: EntityMetadata, options: TriggerOptions) => {
  const tableName = get_table_name_by_metadata(entityMetadata, options.tableSet);
  const rxDBChangeMetadata = getEntityMetadata(RxDBChange);
  // 变更日志全库只有一份，不分套
  const rxDBChangeTableName = quote_sql_identifier(
    get_table_name_by_metadata(rxDBChangeMetadata, WorktreeTableSet.MAIN)
  );
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
  const columns = ` type, namespace, entity, branchId, tableSetSuffix, transactionId, entityId, inversePatch, patch`;
  const { transactionId, branchId } = options;
  // 类型上已经必填，这里挡的是绕过类型的 JS 调用方：本函数是包的公开导出。
  if (!branchId) {
    throw new RxDBAdapterSqliteError('generate_table_trigger_sql requires options.branchId.');
  }

  const transaction_id = get_sql_value(transactionId);
  const branch_id = get_sql_value(branchId);
  const namespace_sql = get_sql_value(namespace);
  const name_sql = get_sql_value(name);

  const suffix = get_sql_value(options.tableSet.ownerSuffixOf(entityMetadata));
  const ids = `${namespace_sql},${name_sql},${branch_id},${suffix},${transaction_id}`;

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

/**
 * 一套表里挂变更触发器的实体：记变更日志、且这套表里有它自己那张表。
 *
 * @param adapter - SQLite 适配器
 * @param tableSet - 哪一套表
 * @returns 主表集是全部记日志的实体；影子表集只有它登记的成员
 *
 * @remarks
 * 不收窄的话，非成员实体经解析器落回主表名：删 / 重建影子表集的触发器就会删掉、或按持有分支重烙主表集的触发器——
 * QueryCache 实体记日志又从不进影子表集，正中这一条（US-314 B1.3）。
 */
export const table_set_logged_metadata = (
  adapter: RxDBAdapterSqliteBase,
  tableSet: WorktreeTableSet
): EntityMetadata[] =>
  adapter.rxdb.config.entities
    .map(EntityType => getEntityMetadata(EntityType))
    .filter(metadata => metadata.log !== false && (tableSet.isMain || tableSet.has(metadata)));

/**
 * 只重建一套表的变更触发器：表集与分支都由调用方给，不碰分支表。
 *
 * @param adapter - SQLite 适配器
 * @param tableSet - 重建哪一套表的触发器
 * @param branchId - 触发器写进变更日志的分支
 * @param transactionId - 烙进触发器的事务 id；只有每个记日志事务首尾那两次重建才给
 * @returns 每个实体先 `DROP TRIGGER IF EXISTS` 再 `CREATE TRIGGER`；这套表里没有记日志的实体时为空串
 *
 * @remarks
 * 每个记日志事务首尾、切分支、`withTriggersDisabled` 之后、系统迁移、建表集都走这一个入口（US-314 B1.3）。
 * 「改激活态」与它拆开：只有真正的切分支才写 `rxdb_branch`（`version/switch_branch.ts`）。
 *
 * 不吞异常：任一实体的触发器生成失败都要让调用方那次写整体回滚，否则那张表会在没有触发器的状态下
 * 继续接受写入，静默丢掉历史、撤销重做与同步。
 */
export const generate_table_set_trigger_sql = (
  adapter: RxDBAdapterSqliteBase,
  tableSet: WorktreeTableSet,
  branchId: string,
  transactionId?: UUID
): string =>
  table_set_logged_metadata(adapter, tableSet)
    .map(metadata =>
      generate_table_trigger_sql(metadata, {
        branchId,
        tableSet,
        transactionId,
        resolveEntityMetadata: adapter.encryptionContext.resolveEntityMetadata
      })
    )
    .join('\n');
