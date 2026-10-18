import { BOM_CYCLE_DEPTH_LIMIT } from '../backend/constants.js';
import { occurrenceScopeSql, reachSqlFor, unionEdgesSql, type ReachSql } from './reach-sql.js';

const cycleScope = (sql: ReachSql): string => `scope AS MATERIALIZED (${occurrenceScopeSql(sql, 'NEW')})`;

const reverseHit = (sql: ReachSql): string => `WITH ${cycleScope(sql)}
  SELECT 1 FROM scope s WHERE NEW."childItemId" = s.p OR EXISTS (
    SELECT 1 FROM ${sql.dialect.table('bom_reach')} r WHERE r."bomType" = s.t AND r."orgId" = s.o
      AND r."ancestorItemId" = NEW."childItemId" AND r."descendantItemId" = s.p
  )`;

const scopedEdges = (sql: ReachSql): string => `edges AS MATERIALIZED (
  SELECT e.p, e.c FROM (${unionEdgesSql(sql, 'NEW."id"')}) e JOIN scope s ON e.t = s.t AND e.o = s.o
)`;

const witness = (sql: ReachSql): string => `WITH RECURSIVE ${cycleScope(sql)}, ${scopedEdges(sql)},
  eligible AS MATERIALIZED (
    SELECT e.p, e.c FROM edges e CROSS JOIN scope s
    WHERE e.c = s.p OR EXISTS (SELECT 1 FROM ${sql.dialect.table('bom_reach')} r
      WHERE r."bomType" = s.t AND r."orgId" = s.o AND r."ancestorItemId" = e.c AND r."descendantItemId" = s.p)
  ), next_edge AS MATERIALIZED (
    SELECT e.p, e.c FROM eligible e WHERE NOT EXISTS (SELECT 1 FROM eligible other WHERE other.p = e.p AND other.c < e.c)
  ), path(item, witness, depth) AS (
    SELECT NEW."childItemId", CAST(NEW."childItemId" AS TEXT), 0 FROM scope
    UNION ALL SELECT e.c, path.witness || '>' || CAST(e.c AS TEXT), path.depth + 1
      FROM path JOIN next_edge e ON e.p = path.item CROSS JOIN scope s
      WHERE path.item <> s.p AND path.depth < ${BOM_CYCLE_DEPTH_LIMIT}
  ) SELECT path.witness FROM path CROSS JOIN scope s WHERE path.item = s.p LIMIT 1`;

const depthExceeded = (sql: ReachSql): string => `WITH RECURSIVE ${cycleScope(sql)}, ${scopedEdges(sql)},
  walk(item, depth) AS (
    SELECT NEW."childItemId", 0 FROM scope
    UNION SELECT e.c, w.depth + 1 FROM walk w JOIN edges e ON e.p = w.item WHERE w.depth < ${BOM_CYCLE_DEPTH_LIMIT}
  ) SELECT 1 FROM walk w JOIN edges e ON e.p = w.item WHERE w.depth >= ${BOM_CYCLE_DEPTH_LIMIT} LIMIT 1`;

const sqliteCycleDdl = (sql: ReachSql): string[] => {
  const body = `
    SELECT RAISE(ABORT, 'rxdb:bom_cycle:' || COALESCE((${witness(sql)}), 'depth_limit')) WHERE EXISTS (${reverseHit(sql)});
    SELECT RAISE(ABORT, 'rxdb:bom_cycle:depth_limit') WHERE EXISTS (${depthExceeded(sql)});`;
  const table = sql.dialect.table('bom_line_occurrence');
  return [
    'DROP TRIGGER IF EXISTS "bom_line_occurrence_cycle_i";',
    'DROP TRIGGER IF EXISTS "bom_line_occurrence_cycle_u";',
    `CREATE TRIGGER "bom_line_occurrence_cycle_i" BEFORE INSERT ON ${table} WHEN NEW."flowDirection" = 'consume' BEGIN ${body} END;`,
    `CREATE TRIGGER "bom_line_occurrence_cycle_u" BEFORE UPDATE OF "childItemId", "flowDirection" ON ${table}
      WHEN NEW."flowDirection" = 'consume' AND (OLD."childItemId" IS NOT NEW."childItemId" OR OLD."flowDirection" IS NOT NEW."flowDirection")
      BEGIN ${body} END;`
  ];
};

const remoteLock = (sql: ReachSql): string => `
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'rxdb:bom_cycle:isolation:%', current_setting('transaction_isolation');
  END IF;
  SELECT h."bomType" AS t, h."orgId" AS o INTO STRICT lock_scope
    FROM ${sql.dialect.table('bom_line')} l JOIN ${sql.dialect.table('bom_header')} h ON h."id" = l."headerId"
    WHERE l."id" = CASE WHEN TG_OP = 'DELETE' THEN OLD."lineId" ELSE NEW."lineId" END;
  PERFORM pg_advisory_xact_lock(hashtext('bom:' || lock_scope.t || ':' || lock_scope.o));
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;`;

const pgCycleDdl = (sql: ReachSql, remote: boolean): string[] => {
  const table = sql.dialect.table('bom_line_occurrence');
  const functionName = remote ? 'bom_cycle_guard_remote' : 'bom_line_occurrence__cycle_guard';
  const triggerName = remote ? 'bom_line_occurrence_cycle_remote_trg' : 'bom_line_occurrence__cycle_trg';
  return [
    `CREATE OR REPLACE FUNCTION "bom"."${functionName}"() RETURNS trigger AS $$ DECLARE cycle_path text; lock_scope record; BEGIN
      ${remote ? remoteLock(sql) : ''}
      IF NEW."flowDirection" <> 'consume' THEN RETURN NEW; END IF;
      IF TG_OP = 'UPDATE' AND OLD."childItemId" IS NOT DISTINCT FROM NEW."childItemId" AND OLD."flowDirection" IS NOT DISTINCT FROM NEW."flowDirection" THEN RETURN NEW; END IF;
      IF EXISTS (${reverseHit(sql)}) THEN
        SELECT found.witness INTO cycle_path FROM (${witness(sql)}) found;
        IF cycle_path IS NULL THEN RAISE EXCEPTION 'rxdb:bom_cycle:depth_limit'; END IF;
        RAISE EXCEPTION 'rxdb:bom_cycle:%', cycle_path;
      END IF;
      IF EXISTS (${depthExceeded(sql)}) THEN RAISE EXCEPTION 'rxdb:bom_cycle:depth_limit'; END IF;
      RETURN NEW;
    END; $$ LANGUAGE plpgsql;`,
    `DROP TRIGGER IF EXISTS "${triggerName}" ON ${table};`,
    `CREATE TRIGGER "${triggerName}" BEFORE INSERT OR UPDATE${remote ? ' OR DELETE' : ''} ON ${table}
      FOR EACH ROW EXECUTE FUNCTION "bom"."${functionName}"();`
  ];
};

/** 已知闭包负责点查，单个见证和负向深度检查均有128硬停且不枚举全部路径。 */
export const buildReachCycleDdl = (adapterName: string, remote = false): string[] => {
  const sql = reachSqlFor(adapterName);
  return sql.postgres ? pgCycleDdl(sql, remote) : sqliteCycleDdl(sql);
};
