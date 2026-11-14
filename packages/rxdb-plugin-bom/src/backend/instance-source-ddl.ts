/**
 * @fileoverview 实例来源保护：直接删发生项与 ECN 撤回、取消都必须保留引用历史。
 */

import type { EntityMetadata } from '@aiao/rxdb';
import { BomEcn, BomInstanceNode, BomLineOccurrence } from '../entities.js';
import { BOM_INSTANCE_PREFIX } from '../types.js';
import {
  isEntity,
  pgCreateTrigger,
  pgTableOf,
  pgTableRef,
  pgTriggerFunction,
  sqliteTableOf,
  sqliteTableRef,
  sqliteTrigger
} from './ddl-kit.js';

interface SourceTables {
  instance: string;
  occurrence: string;
  ecn: string;
}

const sourceViolation = (tables: SourceTables, condition: string): string =>
  `SELECT '${BOM_INSTANCE_PREFIX}发生项 ' || o."id" || ' 被 ' || CAST(COUNT(*) AS TEXT) || ' 个实例引用，禁止删除来源'` +
  ` FROM ${tables.occurrence} o JOIN ${tables.instance} n ON n."sourceOccurrenceId" = o."id"` +
  ` WHERE ${condition} GROUP BY o."id" ORDER BY o."id" LIMIT 1`;

/** 违约查询命中即以其消息中止（消息带发生项与引用数）。 */
const sqliteGuard = (name: string, table: string, event: string, violation: string, when?: string): string[] =>
  sqliteTrigger(table, name, event, `  SELECT RAISE(ABORT, (${violation})) WHERE EXISTS (${violation});`, when);

/** 仅实例实体已注册时安装 SQLite 跨表守卫，错误包含发生项及全部历史引用数。 */
export const buildSqliteInstanceSourceDdl = (metadata: EntityMetadata): string[] => {
  if (!isEntity(metadata, BomInstanceNode)) return [];
  const tables: SourceTables = {
    instance: sqliteTableRef(metadata),
    occurrence: sqliteTableOf(BomLineOccurrence),
    ecn: sqliteTableOf(BomEcn)
  };
  return [
    ...sqliteGuard(
      'bom_instance_source_delete',
      tables.occurrence,
      'BEFORE DELETE',
      sourceViolation(tables, 'o."id" = OLD."id"')
    ),
    ...sqliteGuard(
      'bom_instance_source_cancel',
      tables.ecn,
      'BEFORE UPDATE OF "state"',
      sourceViolation(tables, 'o."ecnInId" = OLD."id"'),
      `OLD."state" IN ('draft', 'released') AND NEW."state" = 'cancelled'`
    )
  ];
};

const pgGuard = (
  metadata: EntityMetadata,
  name: string,
  table: string,
  event: string,
  violation: string,
  condition: string
): string[] => [
  pgTriggerFunction(
    metadata,
    name,
    `  IF ${condition} THEN\n` +
      `    SELECT (${violation}) INTO blocked;\n` +
      `    IF blocked IS NOT NULL THEN\n      RAISE EXCEPTION '%', blocked;\n    END IF;\n` +
      `  END IF;`,
    'blocked text;'
  ),
  pgCreateTrigger(metadata, table, name, event, name)
];

/** 仅实例实体已注册时安装 PGlite 跨表守卫，取消校验先于全部级联写入。 */
export const buildPgInstanceSourceDdl = (metadata: EntityMetadata): string[] => {
  if (!isEntity(metadata, BomInstanceNode)) return [];
  const tables: SourceTables = {
    instance: pgTableRef(metadata),
    occurrence: pgTableOf(BomLineOccurrence),
    ecn: pgTableOf(BomEcn)
  };
  return [
    ...pgGuard(
      metadata,
      'bom_instance_source_delete',
      tables.occurrence,
      'BEFORE DELETE',
      sourceViolation(tables, 'o."id" = OLD."id"'),
      'TRUE'
    ),
    ...pgGuard(
      metadata,
      'bom_instance_source_cancel',
      tables.ecn,
      'BEFORE UPDATE OF "state"',
      sourceViolation(tables, 'o."ecnInId" = OLD."id"'),
      `OLD."state" IN ('draft', 'released') AND NEW."state" = 'cancelled'`
    )
  ];
};
