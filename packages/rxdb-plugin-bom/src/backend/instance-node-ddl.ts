/** @fileoverview 实例安装的序列必填、父链无环与事实不可改写守卫。 */

import { getEntityColumnName, quoteSqlIdentifier, type EntityMetadata } from '@aiao/rxdb';
import { BOM_INSTANCE_PREFIX } from '../types.js';

const FACT_FIELDS = [
  'itemRevisionId',
  'parentInstanceId',
  'sourceOccurrenceId',
  'serialNumber',
  'lotCode',
  'installedAt'
] as const;

const sqliteTable = (metadata: EntityMetadata, table = metadata.tableName): string =>
  quoteSqlIdentifier(`${metadata.namespace}$${table}`);

const pgTable = (metadata: EntityMetadata, table = metadata.tableName): string =>
  `${quoteSqlIdentifier(metadata.namespace)}.${quoteSqlIdentifier(table)}`;

const column = (metadata: EntityMetadata, field: string): string =>
  quoteSqlIdentifier(getEntityColumnName(metadata, field) as string);

const ancestors = (metadata: EntityMetadata, table: string): string =>
  `WITH RECURSIVE ancestors("id") AS (` +
  `SELECT NEW.${column(metadata, 'parentInstanceId')} UNION ` +
  `SELECT p.${column(metadata, 'parentInstanceId')} FROM ${table} p ` +
  `JOIN ancestors a ON a."id" = p.${column(metadata, 'id')} ` +
  `WHERE p.${column(metadata, 'parentInstanceId')} IS NOT NULL) `;

const sqliteSerialGuard = (metadata: EntityMetadata): string => {
  const serial = `NEW.${column(metadata, 'serialNumber')}`;
  return (
    `SELECT RAISE(ABORT, '${BOM_INSTANCE_PREFIX}实际物料「' || i."itemNo" || '」缺少序列号') ` +
    `FROM ${sqliteTable(metadata, 'item_revision')} r ` +
    `JOIN ${sqliteTable(metadata, 'item')} i ON i."id" = r."itemId" ` +
    `WHERE r."id" = NEW.${column(metadata, 'itemRevisionId')} AND i."serialized" = 1 ` +
    `AND (${serial} IS NULL OR length(trim(${serial})) = 0);`
  );
};

const sqliteCycleGuard = (metadata: EntityMetadata): string =>
  ancestors(metadata, sqliteTable(metadata)) +
  `SELECT RAISE(ABORT, '${BOM_INSTANCE_PREFIX}实例图成环：' || NEW.${column(metadata, 'id')}) ` +
  `WHERE EXISTS (SELECT 1 FROM ancestors WHERE "id" = NEW.${column(metadata, 'id')});`;

/** 先删后建：插件升级后旧版本的同名触发器体被替换，不与新体并存。 */
const sqliteTrigger = (metadata: EntityMetadata, operation: 'INSERT' | 'UPDATE', body: string[]): string[] => {
  const name = quoteSqlIdentifier(`bom_instance_node_guard_${operation === 'INSERT' ? 'i' : 'u'}`);
  return [
    `DROP TRIGGER IF EXISTS ${name};`,
    `CREATE TRIGGER ${name} BEFORE ${operation} ON ${sqliteTable(metadata)} BEGIN\n${body.join('\n')}\nEND;`
  ];
};

/**
 * 为实例安装表生成 SQLite 守卫，声明式 CHECK 与排他仍由实体元数据负责。
 *
 * @param metadata - 实体元数据；其他实体返回空数组
 * @returns 幂等的 INSERT / UPDATE 触发器（先删后建，重连即替换旧版本触发器体）
 */
export const buildSqliteInstanceNodeDdl = (metadata: EntityMetadata): string[] => {
  if (metadata.name !== 'BomInstanceNode') return [];
  const serial = sqliteSerialGuard(metadata);
  const cycle = sqliteCycleGuard(metadata);
  const changed = FACT_FIELDS.map(field => `NEW.${column(metadata, field)} IS NOT OLD.${column(metadata, field)}`).join(
    ' OR '
  );
  const immutable = `SELECT RAISE(ABORT, '${BOM_INSTANCE_PREFIX}安装事实不可改写，换父或重装须先截止旧区间再新增记录') WHERE ${changed};`;
  return [
    ...sqliteTrigger(metadata, 'INSERT', [serial, cycle]),
    ...sqliteTrigger(metadata, 'UPDATE', [immutable, serial, cycle])
  ];
};

/**
 * 为实例安装表生成 PGlite 守卫，查询实际物料并独立检查实例父链。
 *
 * @param metadata - 实体元数据；其他实体返回空数组
 * @returns 可重复安装的守卫函数与行触发器
 */
export const buildPgInstanceNodeDdl = (metadata: EntityMetadata): string[] => {
  if (metadata.name !== 'BomInstanceNode') return [];
  const name = 'bom_instance_node__write_guard';
  const serial = `NEW.${column(metadata, 'serialNumber')}`;
  const changed = FACT_FIELDS.map(
    field => `NEW.${column(metadata, field)} IS DISTINCT FROM OLD.${column(metadata, field)}`
  ).join(' OR ');
  const definition = [
    `CREATE OR REPLACE FUNCTION ${quoteSqlIdentifier(metadata.namespace)}.${quoteSqlIdentifier(name)}() RETURNS trigger AS $$`,
    `DECLARE actual_item text;`,
    `BEGIN`,
    `  IF TG_OP = 'UPDATE' THEN`,
    `    IF ${changed} THEN`,
    `      RAISE EXCEPTION '${BOM_INSTANCE_PREFIX}安装事实不可改写，换父或重装须先截止旧区间再新增记录';`,
    `    END IF;`,
    `  END IF;`,
    `  SELECT i."itemNo" INTO actual_item FROM ${pgTable(metadata, 'item_revision')} r ` +
      `JOIN ${pgTable(metadata, 'item')} i ON i."id" = r."itemId" ` +
      `WHERE r."id" = NEW.${column(metadata, 'itemRevisionId')} AND i."serialized" = TRUE ` +
      `AND (${serial} IS NULL OR length(btrim(${serial})) = 0);`,
    `  IF actual_item IS NOT NULL THEN`,
    `    RAISE EXCEPTION '${BOM_INSTANCE_PREFIX}实际物料「%」缺少序列号', actual_item;`,
    `  END IF;`,
    `  IF EXISTS (${ancestors(metadata, pgTable(metadata))}SELECT 1 FROM ancestors WHERE "id" = NEW.${column(metadata, 'id')}) THEN`,
    `    RAISE EXCEPTION '${BOM_INSTANCE_PREFIX}实例图成环：%', NEW.${column(metadata, 'id')};`,
    `  END IF;`,
    `  RETURN NEW;`,
    `END;`,
    `$$ LANGUAGE plpgsql;`
  ].join('\n');
  const trigger =
    `DO $$ BEGIN\n` +
    `DROP TRIGGER IF EXISTS "bom_instance_node__write_trg" ON ${pgTable(metadata)};\n` +
    `CREATE TRIGGER "bom_instance_node__write_trg" BEFORE INSERT OR UPDATE ON ${pgTable(metadata)} ` +
    `FOR EACH ROW EXECUTE FUNCTION ${metadata.namespace}.${name}();\nEND $$;`;
  return [definition, trigger];
};
