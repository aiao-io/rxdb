import { quoteSqlIdentifier } from '../system/sql-literal.js';
import { advancedIndexesOf, compileAdvancedIndex } from './advanced-index.js';
import { compileGeneratedColumn, generatedColumnsOf } from './generated-column.js';
import type { EntityMetadata } from './metadata.interface.js';
import type { StorageDialect } from './storage-expression.js';

/** 生成只读列的 DDL 片段，不改变可写实体属性集。 */
export const generatedColumnDefinitions = (metadata: EntityMetadata, dialect: StorageDialect): string[] =>
  generatedColumnsOf(metadata).map(declaration => {
    const column = compileGeneratedColumn(metadata, declaration, dialect);
    return `${quoteSqlIdentifier(column.columnName)} ${column.sqlType} GENERATED ALWAYS AS (${column.expression}) ${column.storage.toUpperCase()}`;
  });

/**
 * 生成当前方言生效的高级索引 DDL。
 * @param metadata - 实体存储元数据
 * @param dialect - 目标方言
 * @param tableRef - 适配器提供的物理表引用
 * @param resolveIndexName - 索引物理名解析；默认保持主表集的逻辑名
 * @returns 当前方言的索引建表语句
 */
export const advancedIndexStatements = (
  metadata: EntityMetadata,
  dialect: StorageDialect,
  tableRef: string,
  resolveIndexName: (name: string) => string = name => name
): string[] =>
  advancedIndexesOf(metadata).flatMap(declaration => {
    const index = compileAdvancedIndex(metadata, declaration, dialect);
    if (index === null) return [];
    const target =
      index.expression === undefined ?
        index.columns.map(quoteSqlIdentifier).join(', ')
      : `(${index.expression})${index.operatorClass === undefined ? '' : ` ${index.operatorClass}`}`;
    return [
      `CREATE ${index.unique ? 'UNIQUE ' : ''}INDEX ${quoteSqlIdentifier(resolveIndexName(index.name))} ON ${tableRef}` +
        `${dialect === 'postgres' ? ` USING ${index.method}` : ''} (${target});`
    ];
  });
