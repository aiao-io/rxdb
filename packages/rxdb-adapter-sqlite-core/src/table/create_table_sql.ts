import { EntityMetadata, getEntityColumnName, PropertyType, RelationKind } from '@aiao/rxdb';
import { isFunction } from '@aiao/utils';
import type { RxDBAdapterSqliteBase } from '../RxDBAdapterSqliteBase.js';
import {
  get_sql_value,
  get_table_name,
  get_table_name_by_metadata,
  getTableColumnIndexName,
  quote_sql_identifier,
  RxDBAdapterSqliteError,
  rxDBColumnTypeToSqliteType,
  transformValueJsToSqlite
} from '../sqlite-core.utils.js';

/**
 * 归一化索引列：`lower(COALESCE(CAST(列 AS TEXT), ''))`。
 *
 * @remarks
 * `COALESCE` 负责 NULL —— SQL 规定每个 NULL 互不相等，含 NULL 的行在普通 UNIQUE 下
 * **一行都拦不住**（树形实体的根节点 `parentId IS NULL` 正是这种情况）；
 * `lower()` 负责大小写，与树形 UI 的 `toLowerCase()` 同级重名判定同口径。
 * `CAST(… AS TEXT)` 让非文本列（整数排序值等）也能进同一个表达式。
 *
 * 每列各自包一层，索引仍是**多列元组**，不是拼接成一个字符串。
 *
 * @param quotedColumn - 已加引号的列名
 * @param normalized - 索引是否声明了 `normalized`
 * @returns 索引定义里该列对应的表达式
 */
const normalize_index_column = (quotedColumn: string, normalized: boolean | undefined): string =>
  normalized ? `lower(COALESCE(CAST(${quotedColumn} AS TEXT), ''))` : quotedColumn;

/**
 * 创建表的列的 SQL（包含外键约束）
 * @param adapter
 * @param metadata
 * @returns
 */
const create_table_column_sql = (adapter: RxDBAdapterSqliteBase, metadata: EntityMetadata) => {
  const tableName = get_table_name_by_metadata(metadata);
  let runSQL = `CREATE TABLE ${quote_sql_identifier(tableName)} (`;
  const column_unique_sql: string[] = [];
  const column_check_sql: string[] = [];
  const column_sql: string[] = [];

  metadata.propertyMap.forEach(property => {
    const columnName = property.columnName;
    let columnSQL = `${quote_sql_identifier(columnName)} ${rxDBColumnTypeToSqliteType(property)}`;

    // 主键
    if (property.type === PropertyType.integer && property.primary) {
      columnSQL += ' PRIMARY KEY AUTOINCREMENT';
    } else if (
      (property.type === PropertyType.uuid ||
        property.type === PropertyType.string ||
        property.type === PropertyType.bigint) &&
      property.primary
    ) {
      columnSQL += ` PRIMARY KEY`;
      // UUID 主键需要在数据库端生成默认值
      if (property.type === PropertyType.uuid) {
        columnSQL += ` DEFAULT (lower(hex(randomblob(16))))`;
      }
    }

    // 处理默认值（在 nullable 检查之前）
    // 注意：UUID 主键的默认值已在上面处理，这里跳过
    const hasDbDefault = property.type === PropertyType.uuid && property.primary;
    if (
      !hasDbDefault &&
      property.default !== undefined &&
      !isFunction(property.default) &&
      property.type !== PropertyType.binary
    ) {
      const resolvedDefault = property.default;
      if (resolvedDefault === 'CURRENT_TIMESTAMP') {
        columnSQL += ` DEFAULT(strftime('%FT%H:%M:%fZ'))`;
      } else {
        const defaultValue = transformValueJsToSqlite(resolvedDefault, property);
        // 数字类型（INTEGER/REAL）不加引号
        if (
          property.type === PropertyType.boolean ||
          property.type === PropertyType.integer ||
          property.type === PropertyType.number ||
          property.type === PropertyType.bigint
        ) {
          columnSQL += ` DEFAULT ${defaultValue}`;
        } else {
          columnSQL += ` DEFAULT ${get_sql_value(defaultValue)}`;
        }
      }
    }

    // nullable（在默认值之后判断）
    if (!property.nullable) columnSQL += ' NOT NULL';

    // check 约束
    if (property.encrypted !== true) {
      const quotedColumn = quote_sql_identifier(columnName);
      switch (property.type) {
        case PropertyType.json:
        case PropertyType.keyValue:
        case PropertyType.stringArray:
        case PropertyType.numberArray:
          column_check_sql.push(`CHECK ( JSON_VALID(${quotedColumn})=1 )`);
          break;
        case PropertyType.boolean:
          column_check_sql.push(`CHECK (${quotedColumn} in(0,1))`);
          break;
        case PropertyType.enum:
          if ('enum' in property && property.enum && property.enum.length > 0) {
            const enumValues = property.enum.map(v => get_sql_value(String(v))).join(',');
            if (property.nullable) {
              // 不能写成 `IN(...,null)`：值不在列表时 `IN` 遇 NULL 返回 NULL(unknown)，
              // 而 CHECK 约束对 NULL 是**放行**的 —— 整个约束会接受任意非法值。
              // 必须把可空性与取值域拆开判断（SQLC-006）
              column_check_sql.push(`CHECK (${quotedColumn} IS NULL OR ${quotedColumn} IN(${enumValues}))`);
            } else {
              column_check_sql.push(`CHECK (${quotedColumn} in(${enumValues}))`);
            }
          }
          break;

        default:
          break;
      }
    }

    if (property.unique)
      column_unique_sql.push(
        `CREATE UNIQUE INDEX ${quote_sql_identifier(getTableColumnIndexName(metadata, property))} on ${quote_sql_identifier(tableName)}(${quote_sql_identifier(columnName)});`
      );
    column_sql.push(columnSQL);
  });

  // 添加关系列（外键）
  metadata.relationMap.forEach(relation => {
    if (relation.kind === RelationKind.ONE_TO_ONE || relation.kind === RelationKind.MANY_TO_ONE) {
      const columnName = relation.columnName;
      const mappedMetadata = adapter.rxdb.schemaManager.getEntityMetadata(
        relation.mappedEntity,
        relation.mappedNamespace
      );

      const idProperty = mappedMetadata?.propertyMap.get('id');
      if (!idProperty) {
        throw new RxDBAdapterSqliteError(
          `关系 ${metadata.name}.${relation.name} 的映射实体 ${relation.mappedEntity} 缺少 id 属性元数据，无法确定外键列类型`
        );
      }
      const fkColumnType = rxDBColumnTypeToSqliteType(idProperty);

      // SET NULL 约束时，字段必须允许为 NULL，否则 SQLite 置空会失败
      const mustBeNullable = relation.onDelete === 'SET NULL' || relation.onUpdate === 'SET NULL';
      let columnSQL = `${quote_sql_identifier(columnName)} ${fkColumnType}`;
      if (!relation.nullable && !mustBeNullable) {
        columnSQL += ' NOT NULL';
      }

      // 一对多关系支持默认绑定
      if (relation.kind === RelationKind.MANY_TO_ONE) {
        const relDefault = (relation as { default?: unknown }).default;
        if (relDefault !== undefined && !isFunction(relDefault)) {
          const resolved = relDefault;
          columnSQL +=
            fkColumnType === 'INTEGER' || fkColumnType === 'REAL' ?
              ` DEFAULT ${String(get_sql_value(resolved))}`
            : ` DEFAULT ${String(get_sql_value(resolved))}`;
        }
      }

      // 添加外键约束
      if (relation.mappedEntity) {
        const mappedTableName = get_table_name(
          mappedMetadata?.tableName ?? relation.mappedEntity,
          relation.mappedNamespace
        );
        columnSQL += ` REFERENCES ${quote_sql_identifier(mappedTableName)}(${quote_sql_identifier(idProperty.columnName)})`;

        // 应用级联配置
        if (relation.onDelete) {
          columnSQL += ` ON DELETE ${relation.onDelete}`;
        }

        if (relation.onUpdate) {
          columnSQL += ` ON UPDATE ${relation.onUpdate}`;
        }
      }

      column_sql.push(columnSQL);

      // 一对一关系需要唯一约束
      if (relation.unique || relation.kind === RelationKind.ONE_TO_ONE) {
        column_unique_sql.push(
          `CREATE UNIQUE INDEX ${quote_sql_identifier(getTableColumnIndexName(metadata, relation))} on ${quote_sql_identifier(tableName)}(${quote_sql_identifier(columnName)});`
        );
      }
    }
  });

  for (const foreignKey of metadata.foreignKeys ?? []) {
    const mappedMetadata = adapter.rxdb.schemaManager.getEntityMetadata(
      foreignKey.mappedEntity,
      foreignKey.mappedNamespace
    );
    if (!mappedMetadata) {
      throw new RxDBAdapterSqliteError(
        `实体 ${metadata.name} 的外键 ${foreignKey.name} 找不到引用实体 ${foreignKey.mappedEntity}`
      );
    }
    const columns = foreignKey.properties.map(property => {
      const column = getEntityColumnName(metadata, property);
      if (!column)
        throw new RxDBAdapterSqliteError(`实体 ${metadata.name} 的外键 ${foreignKey.name} 找不到字段 ${property}`);
      return quote_sql_identifier(column);
    });
    const mappedColumns = foreignKey.mappedProperties.map(property => {
      const column = getEntityColumnName(mappedMetadata, property);
      if (!column) {
        throw new RxDBAdapterSqliteError(
          `实体 ${metadata.name} 的外键 ${foreignKey.name} 找不到引用字段 ${foreignKey.mappedEntity}.${property}`
        );
      }
      return quote_sql_identifier(column);
    });
    let constraint = `CONSTRAINT ${quote_sql_identifier(foreignKey.name)} FOREIGN KEY (${columns.join(', ')}) REFERENCES ${quote_sql_identifier(get_table_name_by_metadata(mappedMetadata))}(${mappedColumns.join(', ')})`;
    if (foreignKey.onDelete) constraint += ` ON DELETE ${foreignKey.onDelete}`;
    if (foreignKey.onUpdate) constraint += ` ON UPDATE ${foreignKey.onUpdate}`;
    column_check_sql.push(constraint);
  }

  const need_column_sql = [...column_sql, ...column_check_sql];
  if (need_column_sql.length) {
    runSQL += need_column_sql.map(sql => `\n${sql}`).join(',');
    runSQL += '\n);';
  } else {
    throw new RxDBAdapterSqliteError('columns is empty!');
  }

  // 添加 columns 里的唯一约束
  if (column_unique_sql.length) {
    runSQL += '\n' + column_unique_sql.join('\n');
  }

  // 添加实体定义的索引（包括组合索引）
  //
  // 读 `indexMap` 而不是 `metadata.indexes`：与同文件对属性的处理保持一致（:28 读的是
  // `propertyMap`）。`metadata.indexes` 是「仅本类定义」语义，父类索引只进 `indexMap`
  // （见 `metadata-transition.ts`），照 `indexes` 建表会**静默丢掉全部继承索引** ——
  // 查询照常能跑，只是退化成全表扫描，大数据集上才暴露。
  if (metadata.indexMap && metadata.indexMap.size > 0) {
    metadata.indexMap.forEach(index => {
      // SQLite 的索引名是**库级全局**的，不含 namespace 时跨 namespace 的同名实体
      // 会撞在一起、第二张表直接建不出来。与表名同口径带上 `namespace$`（SQLC-021）
      const indexName = `idx_${get_table_name_by_metadata(metadata)}_${index.name}`;
      const columns =
        index.properties
          ?.map(prop => {
            const property = metadata.propertyMap.get(prop);
            if (property) return normalize_index_column(quote_sql_identifier(property.columnName), index.normalized);
            const fkNames = metadata.foreignKeyNames;
            const fkColumnNames = metadata.foreignKeyColumnNames;
            if (fkNames && fkColumnNames) {
              const fkIdx = fkNames.indexOf(prop);
              if (fkIdx >= 0)
                return normalize_index_column(quote_sql_identifier(fkColumnNames[fkIdx]), index.normalized);
            }
            return normalize_index_column(quote_sql_identifier(prop), index.normalized);
          })
          .join(', ') || quote_sql_identifier(index.name);
      const uniqueKeyword = index.unique ? 'UNIQUE ' : '';
      runSQL += `\nCREATE ${uniqueKeyword}INDEX ${quote_sql_identifier(indexName)} ON ${quote_sql_identifier(tableName)}(${columns});`;
    });
  }

  return runSQL;
};

/**
 * 计算创建表的 sql
 * @param metadata 实体元数据
 */
export const create_table_sql = (adapter: RxDBAdapterSqliteBase, metadata: EntityMetadata) => {
  return create_table_column_sql(adapter, metadata);
};
