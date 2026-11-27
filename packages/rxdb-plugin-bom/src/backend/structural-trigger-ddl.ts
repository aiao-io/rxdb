import { getEntityColumnName, type EntityMetadata, type EntityType } from '@aiao/rxdb';
import {
  BomHeader,
  BomItemRevision,
  BomLine,
  BomLineDesignator,
  BomLineOccurrence,
  BomLineOperationSplit
} from '../entities.js';
import {
  column,
  isEntity,
  pgCreateTrigger,
  pgTableRef,
  pgTriggerFunction,
  sqliteTableRef,
  sqliteTrigger
} from './ddl-kit.js';

const WRITE_PROTOCOL = (subject: string, detail: string): string => `rxdb:bom_write_protocol:${subject}:${detail}`;
const raiseWhen = (message: string, condition: string): string =>
  `  SELECT RAISE(ABORT, '${message}') WHERE ${condition};`;

/** 结构归属列的不可改判据（SQLite：`IS NOT`，PG：`IS DISTINCT FROM` 的反）。 */
const STRUCTURAL_COLUMNS: readonly (readonly [EntityType, readonly string[]])[] = [
  [BomItemRevision, ['itemId']],
  [BomHeader, ['parentRevisionId', 'bomType', 'orgId']],
  [BomLineDesignator, ['occurrenceId']],
  [BomLineOperationSplit, ['occurrenceId']],
  [BomLine, ['headerId']],
  [BomLineOccurrence, ['lineId']]
];

const structuralColumnsOf = (metadata: EntityMetadata): readonly string[] =>
  STRUCTURAL_COLUMNS.find(([Entity]) => isEntity(metadata, Entity))?.[1] ?? [];

/** SQLite 结构归属列创建后不可改，与远端和本地 PostgreSQL 共用字段清单。 */
export const buildSqliteStructuralDdl = (metadata: EntityMetadata): string[] => {
  const columns = structuralColumnsOf(metadata);
  if (columns.length === 0) return [];
  const tableRef = sqliteTableRef(metadata);
  const body = columns
    .map(field =>
      raiseWhen(
        WRITE_PROTOCOL(getEntityColumnName(metadata, field) as string, '结构归属列创建后不可改（草稿里也不可改）'),
        `NEW.${column(metadata, field)} IS NOT OLD.${column(metadata, field)}`
      )
    )
    .join('\n');
  return sqliteTrigger(tableRef, `${metadata.tableName}_structural`, 'BEFORE UPDATE', body);
};

/** PostgreSQL 结构归属守卫，本地安装与远端独立部署共用。 */
export const buildPgStructuralDdl = (metadata: EntityMetadata): string[] => {
  const columns = structuralColumnsOf(metadata);
  if (columns.length === 0) return [];
  const checks = columns
    .map(
      field =>
        `  IF OLD.${column(metadata, field)} IS DISTINCT FROM NEW.${column(metadata, field)} THEN\n` +
        `    RAISE EXCEPTION '${WRITE_PROTOCOL(getEntityColumnName(metadata, field) as string, '结构归属列创建后不可改（草稿里也不可改）')}';\n  END IF;`
    )
    .join('\n');
  const functionName = `${metadata.tableName}__structural_guard`;
  const tableRef = pgTableRef(metadata);
  return [
    pgTriggerFunction(metadata, functionName, checks),
    pgCreateTrigger(
      metadata,
      tableRef,
      `${metadata.tableName}__structural_trg`,
      'BEFORE UPDATE',
      `${metadata.tableName}__structural_guard`
    )
  ];
};
