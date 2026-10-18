import { deleteReachSql, deletionDepthExceededSql, insertReachSql, reachSqlFor, type ReachSql } from './reach-sql.js';

const changed = (postgres: boolean): string =>
  postgres ?
    `OLD."childItemId" IS DISTINCT FROM NEW."childItemId" OR OLD."flowDirection" IS DISTINCT FROM NEW."flowDirection"`
  : `OLD."childItemId" IS NOT NEW."childItemId" OR OLD."flowDirection" IS NOT NEW."flowDirection"`;

const sqliteTrigger = (sql: ReachSql, suffix: string, event: string, body: string, when?: string): string =>
  `CREATE TRIGGER IF NOT EXISTS "bom_reach_${suffix}" ${event} ON ${sql.dialect.table('bom_line_occurrence')}
    ${when === undefined ? '' : `WHEN ${when}`} BEGIN ${body} END;`;

const sqliteMaintenance = (sql: ReachSql): string[] => {
  const remove = `SELECT RAISE(ABORT, 'rxdb:bom_cycle:depth_limit') WHERE EXISTS (${deletionDepthExceededSql(sql)}); ${deleteReachSql(sql)}`;
  return [
    sqliteTrigger(sql, 'insert', 'AFTER INSERT', insertReachSql(sql), `NEW."flowDirection" = 'consume'`),
    sqliteTrigger(sql, 'delete', 'AFTER DELETE', remove, `OLD."flowDirection" = 'consume'`),
    sqliteTrigger(
      sql,
      'update',
      'AFTER UPDATE OF "childItemId", "flowDirection"',
      `${remove} ${insertReachSql(sql)}`,
      changed(false)
    )
  ];
};

const pgMaintenance = (sql: ReachSql): string[] => [
  `CREATE OR REPLACE FUNCTION "bom"."bom_reach_maintain"() RETURNS trigger AS $$ BEGIN
    IF TG_OP = 'UPDATE' AND NOT (${changed(true)}) THEN RETURN NEW; END IF;
    IF TG_OP <> 'INSERT' THEN
      IF EXISTS (${deletionDepthExceededSql(sql)}) THEN RAISE EXCEPTION 'rxdb:bom_cycle:depth_limit'; END IF;
      ${deleteReachSql(sql)}
    END IF;
    IF TG_OP <> 'DELETE' THEN ${insertReachSql(sql)} END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END; $$ LANGUAGE plpgsql;`,
  `DROP TRIGGER IF EXISTS "bom_reach_maintain" ON ${sql.dialect.table('bom_line_occurrence')};`,
  `CREATE TRIGGER "bom_reach_maintain" AFTER INSERT OR DELETE OR UPDATE OF "childItemId", "flowDirection"
    ON ${sql.dialect.table('bom_line_occurrence')} FOR EACH ROW EXECUTE FUNCTION "bom"."bom_reach_maintain"();`
];

/** 由存储层原子维护发生项插入、删除与端点/方向更新。 */
export const buildReachMaintenanceDdl = (adapterName: string): string[] => {
  const sql = reachSqlFor(adapterName);
  return sql.postgres ? pgMaintenance(sql) : sqliteMaintenance(sql);
};
