import { getEntityMetadata } from '@aiao/rxdb';
import { pgCreateTrigger, pgTriggerFunction, sqliteTrigger } from '../backend/ddl-kit.js';
import { BomLineOccurrence } from '../entities.js';
import { deleteReachSql, deletionDepthExceededSql, insertReachSql, reachSqlFor, type ReachSql } from './reach-sql.js';

const changed = (postgres: boolean): string =>
  postgres ?
    `OLD."childItemId" IS DISTINCT FROM NEW."childItemId" OR OLD."flowDirection" IS DISTINCT FROM NEW."flowDirection"`
  : `OLD."childItemId" IS NOT NEW."childItemId" OR OLD."flowDirection" IS NOT NEW."flowDirection"`;

const sqliteMaintenance = (sql: ReachSql): string[] => {
  const table = sql.dialect.table('bom_line_occurrence');
  const remove = `SELECT RAISE(ABORT, 'rxdb:bom_cycle:depth_limit') WHERE EXISTS (${deletionDepthExceededSql(sql)}); ${deleteReachSql(sql)}`;
  return [
    ...sqliteTrigger(table, 'bom_reach_insert', 'AFTER INSERT', insertReachSql(sql), `NEW."flowDirection" = 'consume'`),
    ...sqliteTrigger(table, 'bom_reach_delete', 'AFTER DELETE', remove, `OLD."flowDirection" = 'consume'`),
    ...sqliteTrigger(
      table,
      'bom_reach_update',
      'AFTER UPDATE OF "childItemId", "flowDirection"',
      `${remove} ${insertReachSql(sql)}`,
      changed(false)
    )
  ];
};

const pgMaintenance = (sql: ReachSql): string[] => {
  const occurrence = getEntityMetadata(BomLineOccurrence);
  const body = `  IF TG_OP = 'UPDATE' AND NOT (${changed(true)}) THEN RETURN NEW; END IF;
  IF TG_OP <> 'INSERT' THEN
    IF EXISTS (${deletionDepthExceededSql(sql)}) THEN RAISE EXCEPTION 'rxdb:bom_cycle:depth_limit'; END IF;
    ${deleteReachSql(sql)}
  END IF;
  IF TG_OP <> 'DELETE' THEN ${insertReachSql(sql)} END IF;`;
  return [
    pgTriggerFunction(occurrence, 'bom_reach_maintain', body),
    pgCreateTrigger(
      occurrence,
      sql.dialect.table('bom_line_occurrence'),
      'bom_reach_maintain',
      'AFTER INSERT OR DELETE OR UPDATE OF "childItemId", "flowDirection"',
      'bom_reach_maintain'
    )
  ];
};

/** 由存储层原子维护发生项插入、删除与端点/方向更新。 */
export const buildReachMaintenanceDdl = (adapterName: string): string[] => {
  const sql = reachSqlFor(adapterName);
  return sql.postgres ? pgMaintenance(sql) : sqliteMaintenance(sql);
};
