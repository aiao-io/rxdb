/** @fileoverview 实例安装的序列必填、父链无环与事实不可改写守卫。 */

import type { EntityMetadata } from '@aiao/rxdb';
import { BomInstanceNode, BomItem, BomItemRevision } from '../entities.js';
import { BOM_INSTANCE_PREFIX } from '../types.js';
import {
  column,
  isEntity,
  pgCreateTrigger,
  pgTableOf,
  pgTableRef,
  pgTriggerFunction,
  sqliteTableOf,
  sqliteTableRef,
  sqliteTrigger
} from './ddl-kit.js';

const FACT_FIELDS = [
  'itemRevisionId',
  'parentInstanceId',
  'sourceOccurrenceId',
  'serialNumber',
  'lotCode',
  'installedAt'
] as const;

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
    `FROM ${sqliteTableOf(BomItemRevision)} r ` +
    `JOIN ${sqliteTableOf(BomItem)} i ON i."id" = r."itemId" ` +
    `WHERE r."id" = NEW.${column(metadata, 'itemRevisionId')} AND i."serialized" = 1 ` +
    `AND (${serial} IS NULL OR length(trim(${serial})) = 0);`
  );
};

const sqliteCycleGuard = (metadata: EntityMetadata): string =>
  ancestors(metadata, sqliteTableRef(metadata)) +
  `SELECT RAISE(ABORT, '${BOM_INSTANCE_PREFIX}实例图成环：' || NEW.${column(metadata, 'id')}) ` +
  `WHERE EXISTS (SELECT 1 FROM ancestors WHERE "id" = NEW.${column(metadata, 'id')});`;

/**
 * 为实例安装表生成 SQLite 守卫，声明式 CHECK 与排他仍由实体元数据负责。
 *
 * @param metadata - 实体元数据；其他实体返回空数组
 * @returns 幂等的 INSERT / UPDATE 触发器（先删后建，重连即替换旧版本触发器体）
 */
export const buildSqliteInstanceNodeDdl = (metadata: EntityMetadata): string[] => {
  if (!isEntity(metadata, BomInstanceNode)) return [];
  const serial = sqliteSerialGuard(metadata);
  const cycle = sqliteCycleGuard(metadata);
  const changed = FACT_FIELDS.map(field => `NEW.${column(metadata, field)} IS NOT OLD.${column(metadata, field)}`).join(
    ' OR '
  );
  const immutable = `SELECT RAISE(ABORT, '${BOM_INSTANCE_PREFIX}安装事实不可改写，换父或重装须先截止旧区间再新增记录') WHERE ${changed};`;
  const tableRef = sqliteTableRef(metadata);
  return [
    ...sqliteTrigger(tableRef, 'bom_instance_node_guard_i', 'BEFORE INSERT', [serial, cycle].join('\n')),
    ...sqliteTrigger(tableRef, 'bom_instance_node_guard_u', 'BEFORE UPDATE', [immutable, serial, cycle].join('\n'))
  ];
};

/**
 * 为实例安装表生成 PGlite 守卫，查询实际物料并独立检查实例父链。
 *
 * @param metadata - 实体元数据；其他实体返回空数组
 * @returns 可重复安装的守卫函数与行触发器
 */
export const buildPgInstanceNodeDdl = (metadata: EntityMetadata): string[] => {
  if (!isEntity(metadata, BomInstanceNode)) return [];
  const name = 'bom_instance_node__write_guard';
  const serial = `NEW.${column(metadata, 'serialNumber')}`;
  const changed = FACT_FIELDS.map(
    field => `NEW.${column(metadata, field)} IS DISTINCT FROM OLD.${column(metadata, field)}`
  ).join(' OR ');
  const body = [
    `  IF TG_OP = 'UPDATE' THEN`,
    `    IF ${changed} THEN`,
    `      RAISE EXCEPTION '${BOM_INSTANCE_PREFIX}安装事实不可改写，换父或重装须先截止旧区间再新增记录';`,
    `    END IF;`,
    `  END IF;`,
    `  SELECT i."itemNo" INTO actual_item FROM ${pgTableOf(BomItemRevision)} r ` +
      `JOIN ${pgTableOf(BomItem)} i ON i."id" = r."itemId" ` +
      `WHERE r."id" = NEW.${column(metadata, 'itemRevisionId')} AND i."serialized" = TRUE ` +
      `AND (${serial} IS NULL OR length(btrim(${serial})) = 0);`,
    `  IF actual_item IS NOT NULL THEN`,
    `    RAISE EXCEPTION '${BOM_INSTANCE_PREFIX}实际物料「%」缺少序列号', actual_item;`,
    `  END IF;`,
    `  IF EXISTS (${ancestors(metadata, pgTableRef(metadata))}SELECT 1 FROM ancestors WHERE "id" = NEW.${column(metadata, 'id')}) THEN`,
    `    RAISE EXCEPTION '${BOM_INSTANCE_PREFIX}实例图成环：%', NEW.${column(metadata, 'id')};`,
    `  END IF;`
  ].join('\n');
  return [
    pgTriggerFunction(metadata, name, body, 'actual_item text;'),
    pgCreateTrigger(metadata, pgTableRef(metadata), 'bom_instance_node__write_trg', 'BEFORE INSERT OR UPDATE', name)
  ];
};
