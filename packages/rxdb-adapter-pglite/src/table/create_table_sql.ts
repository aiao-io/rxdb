import {
  buildConditionalUniqueName,
  buildExclusionConstraintName,
  compileCheckConstraint,
  compileCheckRuleGroup,
  EntityExclusionMetadata,
  EntityMetadata,
  EntityPropertyMetadata,
  EntityRelationManyToOneMetadata,
  EnumProperty,
  getEntityColumnName,
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

/** 区间维的 PG 范围构造：时间列 tstzrange、整数列 int8range（int4 隐式升 int8）。 */
const pgRangeSql = (metadata: EntityMetadata, from: string, to: string, bounds: string): string => {
  const fromColumn = getEntityColumnName(metadata, from);
  const toColumn = getEntityColumnName(metadata, to);
  const fromProperty = metadata.propertyMap.get(from);
  if (!fromColumn || !toColumn || !fromProperty) {
    throw new RxdbAdapterPGliteError(`排他区间维引用了不存在的列 ${from}/${to}`);
  }
  const rangeType = fromProperty.type === PropertyType.date ? 'tstzrange' : 'int8range';
  return `${rangeType}(${quoteIdentifier(fromColumn)}, ${quoteIdentifier(toColumn)}, '${bounds}')`;
};

/** 单条排他声明的 EXCLUDE 约束：全部相等列 `=`、全部区间维 `&&`。 */
const buildPgExclusionConstraintSql = (metadata: EntityMetadata, exclusion: EntityExclusionMetadata): string => {
  const equalColumns = exclusion.equal.map(field => {
    const columnName = getEntityColumnName(metadata, field);
    if (!columnName) throw new RxdbAdapterPGliteError(`排他相等列引用了不存在的列 ${field}`);
    return `${quoteIdentifier(columnName)} WITH =`;
  });
  const ranges = exclusion.ranges.map(range => `${pgRangeSql(metadata, range.from, range.to, range.bounds)} WITH &&`);
  const name = buildExclusionConstraintName(metadata, exclusion);
  return `ALTER TABLE ${getTableNameByMetadata(metadata)} ADD CONSTRAINT ${quoteIdentifier(name)} EXCLUDE USING gist (${[...equalColumns, ...ranges].join(', ')})`;
};

/**
 * 实体全部排他声明的 ALTER TABLE 语句。
 *
 * @remarks
 * PG 的关系外键列在 `ALTER TABLE ADD COLUMN` 阶段才建（见 `_create_table_relations_sql`），
 * 排他约束引用 `lineId` 这类列时不能内联进 CREATE TABLE——延后为 ADD CONSTRAINT，
 * 由 `create_tables_statements` 的延后阶段（isDeferredStatement）在所有表建完后执行。
 */
const _create_table_exclusions_sql = (metadata: EntityMetadata): string =>
  metadata.exclusions.map(exclusion => `\n${buildPgExclusionConstraintSql(metadata, exclusion)};`).join('');

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

  // 实体级 CHECK（含属性级 `check` 编译项）：与 sqlite-core 同一条核心编译路径，
  // 约束名含表达式哈希，供 `init()` 漂移比对
  for (const check of metadata.checks) {
    const compiled = compileCheckConstraint(metadata, check);
    column_check_sql.push(`CONSTRAINT ${quoteIdentifier(compiled.name)} CHECK ${compiled.sql}`);
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

export const create_table_indexes_sql = (metadata: EntityMetadata, ifNotExists = false): string => {
  let indexSql = '';
  const tableName = getTableNameByMetadata(metadata);

  // 添加实体定义的索引（包括组合索引）
  if (metadata.indexMap && metadata.indexMap.size > 0) {
    metadata.indexMap.forEach(index => {
      // 条件唯一索引（`where`）以 `uq_` 命名、进约束漂移比对，`reconcileEntityIndexes`
      // （ifNotExists=true 的补建路径）跳过——已有表的收敛只修普通索引，约束类索引不一致
      // 由 `init()` 的漂移检查点名，不静默补建
      if (index.where) {
        if (ifNotExists) return;
        const whereSql = compileCheckRuleGroup(index.where, metadata);
        const indexName = buildConditionalUniqueName(metadata, index.name, whereSql);
        const columns =
          index.properties?.map(prop => getIndexColumnSql(metadata, prop, index.normalized)).join(', ') ||
          getIndexColumnSql(metadata, index.name, index.normalized);
        indexSql += `\nCREATE UNIQUE INDEX ${quoteIdentifier(indexName)} ON ${tableName}(${columns}) WHERE ${whereSql};`;
        return;
      }
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
  create_table_sql += _create_table_exclusions_sql(metadata);
  create_table_sql += create_table_indexes_sql(metadata);
  return create_table_sql;
};
