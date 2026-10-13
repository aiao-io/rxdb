import {
  compileCheckConstraint,
  compileConditionalUniqueIndex,
  compileExclusionConstraint,
  conditionalUniqueIndexesOf,
  EntityMetadata,
  EntityPropertyMetadata,
  EntityRelationManyToOneMetadata,
  EnumProperty,
  exclusionRangeExpressionPG,
  getEntityColumnName,
  isConditionalUniqueIndex,
  PropertyType,
  RelationKind,
  UUIDProperty
} from '@aiao/rxdb';
import { isFunction, isString } from '@aiao/utils';
import { RxDBAdapterPGlite } from '../RxDBAdapterPGlite.js';
import {
  getSqlValue,
  getTableColumnIndexName,
  getTableNameByMetadata,
  quoteIdentifier,
  quoteLiteral,
  RxdbAdapterPGliteError,
  rxDBColumnTypeToPGliteType,
  rxDBColumnTypeToPGliteTypeIndexName,
  transformValueJsToPGlite
} from '../pglite.utils.js';

const getPropertyDefaultSql = (property: EntityPropertyMetadata): string | undefined => {
  const defaultValue = property.default;
  if (isFunction(defaultValue) || property.type === PropertyType.binary) return undefined;

  if (isString(defaultValue) && ['CURRENT_TIMESTAMP', 'now()'].includes(defaultValue)) return ' DEFAULT now()';

  const transformed = transformValueJsToPGlite(defaultValue, property);
  if (transformed === null) return ' DEFAULT NULL';
  if (property.type === PropertyType.json || property.type === PropertyType.keyValue) {
    if (!isString(transformed)) {
      throw new RxdbAdapterPGliteError(`Property "${property.name}" has an invalid JSON default value.`);
    }
    return ` DEFAULT ${getSqlValue(JSON.parse(transformed))}`;
  }
  if (property.type === PropertyType.stringArray || property.type === PropertyType.numberArray) {
    return ` DEFAULT ${getSqlValue(transformed)}`;
  }
  if (isString(transformed)) return ` DEFAULT ${quoteLiteral(transformed)}`;
  if (typeof transformed === 'boolean' || typeof transformed === 'number' || typeof transformed === 'bigint') {
    return ` DEFAULT ${String(transformed)}`;
  }
  throw new RxdbAdapterPGliteError(`Property "${property.name}" has an unsupported literal default value.`);
};

const _create_table_column_sql = (metadata: EntityMetadata) => {
  const tableName = getTableNameByMetadata(metadata);
  let runSQL = `CREATE TABLE ${tableName} (`;
  const column_unique_sql: string[] = [];
  const column_check_sql: string[] = [];
  const column_sql: string[] = [];
  metadata.propertyMap.forEach(property => {
    let columnSQL = '';
    columnSQL += `"${property.columnName}"`;
    const pgType = rxDBColumnTypeToPGliteType(property);
    if ((property as UUIDProperty).primary) {
      if (property.type === PropertyType.integer) {
        columnSQL += ' serial PRIMARY KEY';
      } else {
        columnSQL += ` ${pgType} PRIMARY KEY`;
      }
    } else {
      columnSQL += ` ${pgType}`;
    }

    if (Reflect.get(property, 'default') !== undefined) columnSQL += getPropertyDefaultSql(property) ?? '';

    // 处理 NOT NULL 约束
    if (!property.nullable) {
      columnSQL += ' NOT NULL';
    }

    if (property.unique && !(property as UUIDProperty).primary) {
      column_unique_sql.push(
        `CREATE UNIQUE INDEX ${quoteIdentifier(getTableColumnIndexName(metadata, property))} on ${tableName} (${quoteIdentifier(property.columnName)} ${rxDBColumnTypeToPGliteTypeIndexName(property)});`
      );
    }

    // enum CHECK 约束
    if (property.type === PropertyType.enum) {
      const enumProp = property as unknown as EnumProperty;
      if (enumProp.enum && enumProp.enum.length > 0) {
        const enumValues = enumProp.enum.map(v => `'${String(v).replace(/'/g, "''")}'`).join(', ');
        column_check_sql.push(`CHECK ("${property.columnName}" IN (${enumValues}))`);
      }
    }

    column_sql.push(columnSQL);
  });

  // 声明式 CHECK（US-030 阶段 A）：读 checkMap（继承合并后的全集，含属性级语法糖），
  // 与 indexMap 同口径——`metadata.checks` 是「仅本类定义」语义，照它建表会静默丢掉
  // 全部继承的 CHECK。
  for (const check of metadata.checkMap.values()) {
    const { name, expression } = compileCheckConstraint(metadata, check);
    column_check_sql.push(`CONSTRAINT ${quoteIdentifier(name)} CHECK (${expression})`);
  }
  // 区间排他（US-030 阶段 C）：EXCLUDE USING gist，相等列的 `=` 靠 btree_gist（适配器 connect 时启用）。
  // 区间维的表达式（含倒置区间映射成 'empty'）由核心给出，与 SQLite 触发器同一语义。
  for (const exclusion of metadata.exclusionMap.values()) {
    const { name, equal, ranges } = compileExclusionConstraint(metadata, exclusion);
    const elements = [
      ...equal.map(column => `${quoteIdentifier(column.column)} WITH =`),
      ...ranges.map(range => `${exclusionRangeExpressionPG(range)} WITH &&`)
    ];
    column_check_sql.push(`CONSTRAINT ${quoteIdentifier(name)} EXCLUDE USING gist (${elements.join(', ')})`);
  }
  const need_column_sql = [...column_sql, ...column_check_sql];
  if (need_column_sql.length) {
    runSQL += need_column_sql.map(sql => `\n${sql}`).join(',');
    runSQL += '\n);';
  } else {
    throw new RxdbAdapterPGliteError('columns is empty!');
  }

  // 添加 columns 里的唯一约束
  if (column_unique_sql.length) {
    runSQL += '\n' + column_unique_sql.join('\n');
  }

  return runSQL;
};

/**
 * 归一化索引列：`lower(COALESCE(CAST(列 AS TEXT), ''))`。
 *
 * @remarks
 * 与 sqlite-core 侧同名函数同一口径 —— `COALESCE` 让含 NULL 的行重新可比
 * （SQL 规定每个 NULL 互不相等，普通 UNIQUE 对这些行一行都拦不住），
 * `lower()` 与树形 UI 的 `toLowerCase()` 同级重名判定对齐。
 *
 * 归一化后表达式的结果类型恒为 `text`，所以**不再**附加 bigint / binary 的 opclass：
 * 那些 opclass 属于原列类型，套在 text 表达式上是类型错误。
 */
const normalizeIndexColumn = (columnSql: string): string => `lower(COALESCE(CAST(${columnSql} AS TEXT), ''))`;

const getIndexColumnSql = (metadata: EntityMetadata, propertyName: string, normalized?: boolean): string => {
  const property = metadata.propertyMap.get(propertyName);
  if (!property) {
    const foreignKeyIndex = metadata.foreignKeyNames?.indexOf(propertyName) ?? -1;
    const columnName = foreignKeyIndex >= 0 ? metadata.foreignKeyColumnNames?.[foreignKeyIndex] : propertyName;
    const column = quoteIdentifier(columnName ?? propertyName);
    return normalized ? normalizeIndexColumn(column) : column;
  }
  const column = quoteIdentifier(property.columnName);
  if (normalized) return normalizeIndexColumn(column);
  if (property.type !== PropertyType.bigint && property.type !== PropertyType.binary) return column;
  return `${column} ${rxDBColumnTypeToPGliteTypeIndexName(property)}`;
};

/**
 * 实体声明的普通索引（含组合索引），`idx_` 前缀。
 *
 * @remarks
 * 带 `where` 的条件唯一索引不在这里：它是存储约束，只随建表创建（{@link create_table_conditional_unique_indexes_sql}），
 * 已有表上只走漂移检查——`reconcileEntityIndexes` 用本函数补建，补建不能替用户迁移悄悄加约束（US-030）。
 */
export const create_table_indexes_sql = (metadata: EntityMetadata, ifNotExists = false): string => {
  let indexSql = '';
  const tableName = getTableNameByMetadata(metadata);

  // 添加实体定义的索引（包括组合索引）
  if (metadata.indexMap && metadata.indexMap.size > 0) {
    metadata.indexMap.forEach(index => {
      if (isConditionalUniqueIndex(index)) return;
      const indexName = `idx_${metadata.tableName}_${index.name}`;
      const columns =
        index.properties?.map(prop => getIndexColumnSql(metadata, prop, index.normalized)).join(', ') ||
        getIndexColumnSql(metadata, index.name, index.normalized);
      const uniqueKeyword = index.unique ? 'UNIQUE ' : '';
      const existenceKeyword = ifNotExists ? 'IF NOT EXISTS ' : '';
      indexSql += `\nCREATE ${uniqueKeyword}INDEX ${existenceKeyword}${quoteIdentifier(indexName)} ON ${tableName}(${columns});`;
    });
  }
  return indexSql;
};

/**
 * 条件唯一索引（US-030 阶段 B）：确定性名 `uq_` + 部分索引 `WHERE`，只随建表创建。
 *
 * @remarks
 * 列表达式与 `idx_` 同一口径（{@link getIndexColumnSql}：外键列、`normalized`、bigint / binary 的
 * 运算符类）；`where` 是核心编译的只拼字面量的谓词，与 SQLite 侧同一条。
 */
export const create_table_conditional_unique_indexes_sql = (metadata: EntityMetadata): string => {
  const tableName = getTableNameByMetadata(metadata);
  let indexSql = '';
  for (const index of conditionalUniqueIndexesOf(metadata)) {
    const { name, where } = compileConditionalUniqueIndex(metadata, index);
    const columns = (index.properties?.length ? index.properties : [index.name])
      .map(prop => getIndexColumnSql(metadata, prop, index.normalized))
      .join(', ');
    indexSql += `\nCREATE UNIQUE INDEX ${quoteIdentifier(name)} ON ${tableName}(${columns}) WHERE ${where};`;
  }
  return indexSql;
};

const _create_table_relations_sql = (adapter: RxDBAdapterPGlite, metadata: EntityMetadata) => {
  let relationSql = '';
  const tableName = getTableNameByMetadata(metadata);

  Array.from(metadata.relationMap.values()).forEach(relation => {
    switch (relation.kind) {
      case RelationKind.ONE_TO_ONE:
      case RelationKind.MANY_TO_ONE:
        {
          const columnName = relation.columnName;

          if (!relation.mappedEntity) {
            throw new RxdbAdapterPGliteError(`Relation '${relation.name}' is missing mapped entity metadata`);
          }
          const mappedMetadata = adapter.rxdb.schemaManager.getEntityMetadata(
            relation.mappedEntity,
            relation.mappedNamespace ?? metadata.namespace
          );
          if (!mappedMetadata) {
            throw new RxdbAdapterPGliteError(`Mapped entity metadata '${relation.mappedEntity}' not found`);
          }
          const primaryProperty = Array.from(mappedMetadata.propertyMap.values()).find(
            property => (property as UUIDProperty).primary
          );
          if (!primaryProperty) {
            throw new RxdbAdapterPGliteError(`Mapped entity '${relation.mappedEntity}' has no primary property`);
          }
          const fkColumnType = rxDBColumnTypeToPGliteType(primaryProperty);

          relationSql += `\nALTER TABLE ${tableName} ADD COLUMN "${columnName}" ${fkColumnType}`;

          if (!relation.nullable) {
            relationSql += ' NOT NULL';
          }

          // 一对多关系支持默认值,主要用于 RxDBChange 表
          if (relation.kind === RelationKind.MANY_TO_ONE && Reflect.get(relation, 'default') !== undefined) {
            const relation_any = relation as EntityRelationManyToOneMetadata;
            if (!isFunction(relation_any.default)) {
              const defaultValue = transformValueJsToPGlite(relation_any.default, primaryProperty);
              const defaultSql =
                typeof defaultValue === 'bigint' ? String(defaultValue) : quoteLiteral(String(defaultValue));
              relationSql += ` DEFAULT ${defaultSql}`;
            }
          }

          relationSql += ';';

          // 延迟外键约束的添加,避免表创建顺序问题
          // 外键约束将在所有表创建完成后统一添加
          const mappedTableName = getTableNameByMetadata(mappedMetadata);
          const fkName = `${tableName}_${columnName}_fk`.replace(/"/g, '');

          relationSql += `\nALTER TABLE ${tableName} ADD CONSTRAINT "${fkName}" FOREIGN KEY ("${columnName}") REFERENCES ${mappedTableName}("${primaryProperty.columnName}")`;

          if (relation.onDelete) {
            relationSql += ` ON DELETE ${relation.onDelete}`;
          } else if (relation.kind === RelationKind.MANY_TO_ONE) {
            if (relation.nullable) {
              relationSql += ' ON DELETE SET NULL';
            } else {
              relationSql += ' ON DELETE CASCADE';
            }
          }

          relationSql += ' DEFERRABLE INITIALLY DEFERRED';
          relationSql += ';';

          // 一对一关系需要唯一索引
          if (relation.unique || relation.kind === RelationKind.ONE_TO_ONE) {
            const opclass =
              primaryProperty.type === PropertyType.bigint ?
                ` ${rxDBColumnTypeToPGliteTypeIndexName(primaryProperty)}`
              : '';
            relationSql += `\nCREATE UNIQUE INDEX "${getTableColumnIndexName(metadata, relation)}" ON ${tableName}("${columnName}"${opclass});`;
          }
        }
        break;
      default:
        break;
    }
  });

  return relationSql;
};

const _create_table_foreign_keys_sql = (adapter: RxDBAdapterPGlite, metadata: EntityMetadata): string => {
  let sql = '';
  const tableName = getTableNameByMetadata(metadata);

  for (const foreignKey of metadata.foreignKeys ?? []) {
    const mappedMetadata = adapter.rxdb.schemaManager.getEntityMetadata(
      foreignKey.mappedEntity,
      foreignKey.mappedNamespace
    );
    if (!mappedMetadata) {
      throw new RxdbAdapterPGliteError(
        `实体 ${metadata.name} 的外键 ${foreignKey.name} 找不到引用实体 ${foreignKey.mappedEntity}`
      );
    }
    const columns = foreignKey.properties.map(property => {
      const column = getEntityColumnName(metadata, property);
      if (!column)
        throw new RxdbAdapterPGliteError(`实体 ${metadata.name} 的外键 ${foreignKey.name} 找不到字段 ${property}`);
      return quoteIdentifier(column);
    });
    const mappedColumns = foreignKey.mappedProperties.map(property => {
      const column = getEntityColumnName(mappedMetadata, property);
      if (!column) {
        throw new RxdbAdapterPGliteError(
          `实体 ${metadata.name} 的外键 ${foreignKey.name} 找不到引用字段 ${foreignKey.mappedEntity}.${property}`
        );
      }
      return quoteIdentifier(column);
    });
    const constraintName = `${metadata.tableName}_${foreignKey.name}_fk`;
    sql += `\nALTER TABLE ${tableName} ADD CONSTRAINT ${quoteIdentifier(constraintName)} FOREIGN KEY (${columns.join(', ')}) REFERENCES ${getTableNameByMetadata(mappedMetadata)}(${mappedColumns.join(', ')})`;
    if (foreignKey.onDelete) sql += ` ON DELETE ${foreignKey.onDelete}`;
    if (foreignKey.onUpdate) sql += ` ON UPDATE ${foreignKey.onUpdate}`;
    sql += ' DEFERRABLE INITIALLY DEFERRED;';
  }

  return sql;
};

export default (adapter: RxDBAdapterPGlite, metadata: EntityMetadata) => {
  let create_table_sql = '';
  create_table_sql += _create_table_column_sql(metadata);
  create_table_sql += _create_table_relations_sql(adapter, metadata);
  create_table_sql += _create_table_foreign_keys_sql(adapter, metadata);
  create_table_sql += create_table_indexes_sql(metadata);
  create_table_sql += create_table_conditional_unique_indexes_sql(metadata);
  return create_table_sql;
};
