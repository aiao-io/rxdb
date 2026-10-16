/**
 * @fileoverview 实例来源保护：直接删发生项与 ECN 撤回、取消都必须保留引用历史。
 */

import { quoteSqlIdentifier, type EntityMetadata } from '@aiao/rxdb';
import { BOM_INSTANCE_PREFIX } from '../types.js';

interface SourceTables {
  instance: string;
  occurrence: string;
  ecn: string;
}

const sourceViolation = (tables: SourceTables, condition: string): string =>
  `SELECT '${BOM_INSTANCE_PREFIX}发生项 ' || o."id" || ' 被 ' || CAST(COUNT(*) AS TEXT) || ' 个实例引用，禁止删除来源'` +
  ` FROM ${tables.occurrence} o JOIN ${tables.instance} n ON n."sourceOccurrenceId" = o."id"` +
  ` WHERE ${condition} GROUP BY o."id" ORDER BY o."id" LIMIT 1`;

const sqliteGuard = (name: string, table: string, event: string, violation: string, when?: string): string =>
  [
    `CREATE TRIGGER IF NOT EXISTS ${quoteSqlIdentifier(name)} ${event} ON ${table}`,
    ...(when === undefined ? [] : [`WHEN ${when}`]),
    `BEGIN`,
    `  SELECT RAISE(ABORT, (${violation})) WHERE EXISTS (${violation});`,
    `END;`
  ].join('\n');

/** 仅实例实体已注册时安装 SQLite 跨表守卫，错误包含发生项及全部历史引用数。 */
export const buildSqliteInstanceSourceDdl = (metadata: EntityMetadata): string[] => {
  if (metadata.name !== 'BomInstanceNode') return [];
  const table = (name: string): string => quoteSqlIdentifier(`${metadata.namespace}$${name}`);
  const tables: SourceTables = {
    instance: table(metadata.tableName),
    occurrence: table('bom_line_occurrence'),
    ecn: table('ecn')
  };
  return [
    sqliteGuard(
      'bom_instance_source_delete',
      tables.occurrence,
      'BEFORE DELETE',
      sourceViolation(tables, 'o."id" = OLD."id"')
    ),
    sqliteGuard(
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
): string[] => {
  const qualified = `${quoteSqlIdentifier(metadata.namespace)}.${quoteSqlIdentifier(name)}`;
  return [
    `CREATE OR REPLACE FUNCTION ${qualified}() RETURNS trigger AS $$\n` +
      `DECLARE blocked text;\nBEGIN\n` +
      `  IF ${condition} THEN\n` +
      `    SELECT (${violation}) INTO blocked;\n` +
      `    IF blocked IS NOT NULL THEN\n      RAISE EXCEPTION '%', blocked;\n    END IF;\n` +
      `  END IF;\n` +
      `  IF TG_OP = 'DELETE' THEN\n    RETURN OLD;\n  END IF;\n` +
      `  RETURN NEW;\nEND;\n$$ LANGUAGE plpgsql;`,
    `DO $$\nBEGIN\n` +
      `  DROP TRIGGER IF EXISTS ${quoteSqlIdentifier(name)} ON ${table};\n` +
      `  CREATE TRIGGER ${quoteSqlIdentifier(name)} ${event} ON ${table} FOR EACH ROW EXECUTE FUNCTION ${metadata.namespace}.${name}();\n` +
      `END $$;`
  ];
};

/** 仅实例实体已注册时安装 PGlite 跨表守卫，取消校验先于全部级联写入。 */
export const buildPgInstanceSourceDdl = (metadata: EntityMetadata): string[] => {
  if (metadata.name !== 'BomInstanceNode') return [];
  const table = (name: string): string => `${quoteSqlIdentifier(metadata.namespace)}.${quoteSqlIdentifier(name)}`;
  const tables: SourceTables = {
    instance: table(metadata.tableName),
    occurrence: table('bom_line_occurrence'),
    ecn: table('ecn')
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
