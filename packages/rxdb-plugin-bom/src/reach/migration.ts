import type { MigrationType, TransactionExecutor } from '@aiao/rxdb';
import { buildReachCycleDdl } from './cycle-ddl.js';
import { buildReachMaintenanceDdl } from './reach-ddl.js';
import { reachSqlFor, unionEdgesSql, type ReachSql } from './reach-sql.js';

/** 已发布后保持稳定的可达性迁移水位。 */
export const BOM_REACH_MIGRATION = '0001-bom-reach';

/** 集合闭包不携带路径，循环输入也只产生有限物料对并被自反对检查拒绝。 */
export const closureCteSql = (sql: ReachSql): string => `WITH RECURSIVE edges AS MATERIALIZED (${unionEdgesSql(sql)}),
  closure(t, o, a, d) AS (
    SELECT t, o, p, c FROM edges
    UNION SELECT c.t, c.o, c.a, e.c FROM closure c JOIN edges e ON e.t = c.t AND e.o = c.o AND e.p = c.d
  )`;

/** 旧库回填的单次集合写入，迁移事务之外不调用。 */
export const backfillReachSql = (sql: ReachSql): string => `INSERT INTO ${sql.dialect.table('bom_reach')}
  ("id", "bomType", "orgId", "ancestorItemId", "descendantItemId", "createdAt", "updatedAt")
  SELECT ${sql.uuid}, c.t, c.o, c.a, c.d, ${sql.timestamp}, ${sql.timestamp}
  FROM (${closureCteSql(sql)} SELECT t, o, a, d FROM closure) c WHERE c.a <> c.d
  ON CONFLICT ("bomType", "orgId", "ancestorItemId", "descendantItemId") DO NOTHING;`;

/** 检测缺对、伪对及自反对，拒绝空表或半回填被误当作“不可达”。 */
export const assertReachComplete = async (executor: TransactionExecutor, adapterName: string): Promise<void> => {
  const sql = reachSqlFor(adapterName);
  const result = await executor.query(`${closureCteSql(sql)}
    SELECT 1 FROM (
      SELECT t, o, a, d FROM closure EXCEPT SELECT "bomType", "orgId", "ancestorItemId", "descendantItemId" FROM ${sql.dialect.table('bom_reach')}
    ) missing
    UNION ALL SELECT 1 FROM (
      SELECT "bomType", "orgId", "ancestorItemId", "descendantItemId" FROM ${sql.dialect.table('bom_reach')} EXCEPT SELECT t, o, a, d FROM closure
    ) extra LIMIT 1`);
  if (result.rows.length > 0) throw new Error('[rxdb-plugin-bom] 可达性派生表不完整，必须在显式迁移中重建');
};

/** 在同一个迁移事务中回填并安装依赖闭包的存储约束。 */
export const createReachMigration = (adapterName: string): MigrationType => ({
  name: BOM_REACH_MIGRATION,
  async up(executor) {
    const sql = reachSqlFor(adapterName);
    const cycle = await executor.query(`${closureCteSql(sql)} SELECT 1 FROM closure WHERE a = d LIMIT 1`);
    if (cycle.rows.length > 0) throw new Error('[rxdb-plugin-bom] 旧主数据并集包含有向环，不能建立可达性');
    await executor.query(backfillReachSql(sql));
    await assertReachComplete(executor, adapterName);
    for (const statement of [...buildReachCycleDdl(adapterName), ...buildReachMaintenanceDdl(adapterName)])
      await executor.query(statement);
  },
  down: () => Promise.reject(new Error('[rxdb-plugin-bom] 可达性迁移不可逆，禁止删除已启用的写入约束'))
});
