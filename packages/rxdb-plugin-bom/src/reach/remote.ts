import { buildReachCycleDdl } from './cycle-ddl.js';
import { backfillReachSql, closureCteSql } from './migration.js';
import { buildReachMaintenanceDdl } from './reach-ddl.js';
import { reachSqlFor } from './reach-sql.js';

/** 远端部署在同一事务中回填派生表，并为所有拓扑写入安装作用域锁。 */
export const remoteReachDdl = (): string => {
  const sql = reachSqlFor('postgres');
  return [
    '-- rxdb-plugin-bom：远端BOM并集可达性、写入期判环与增量维护',
    'LOCK TABLE "bom"."bom_line_occurrence" IN SHARE ROW EXCLUSIVE MODE;',
    `CREATE TABLE IF NOT EXISTS "bom"."bom_reach" (
      "id" uuid PRIMARY KEY, "bomType" text NOT NULL CHECK ("bomType" IN ('ebom', 'mbom', 'sales')),
      "orgId" text NOT NULL, "ancestorItemId" uuid NOT NULL, "descendantItemId" uuid NOT NULL,
      "createdAt" timestamptz NOT NULL, "updatedAt" timestamptz NOT NULL,
      "createdBy" text, "updatedBy" text, CHECK ("ancestorItemId" <> "descendantItemId")
    );`,
    'CREATE UNIQUE INDEX IF NOT EXISTS "bom_reach_pair" ON "bom"."bom_reach" ("bomType", "orgId", "ancestorItemId", "descendantItemId");',
    'CREATE INDEX IF NOT EXISTS "bom_reach_descendant" ON "bom"."bom_reach" ("bomType", "orgId", "descendantItemId", "ancestorItemId");',
    `DO $$ BEGIN IF EXISTS (${closureCteSql(sql)} SELECT 1 FROM closure WHERE a = d LIMIT 1)
      THEN RAISE EXCEPTION 'rxdb:bom_cycle:existing_graph'; END IF; END; $$;`,
    'DELETE FROM "bom"."bom_reach";',
    backfillReachSql(sql),
    ...buildReachCycleDdl('postgres', true),
    ...buildReachMaintenanceDdl('postgres')
  ].join('\n');
};
