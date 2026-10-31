import type { MigrationType, TransactionExecutor } from '@aiao/rxdb';
import { readTableCatalog } from '../storage-catalog.js';
import { BOM_GRAPH_ENTITIES } from './entities.js';
import { buildReachInstallDdl } from './install.js';
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

const graphTablesPresent = async (executor: TransactionExecutor, postgres: boolean): Promise<boolean> => {
  for (const Entity of BOM_GRAPH_ENTITIES) {
    if ((await readTableCatalog(executor, postgres, executor.tableRef(Entity))).columns.size === 0) return false;
  }
  return true;
};

/**
 * 回填之后的判环：自环，或某条边的子端已可达父端。
 *
 * @remarks
 * 只在清空后整表回填的同一事务里成立：此刻派生表恰为闭包去掉自反对，「子端可达父端」逐边点查
 * 唯一键即可回答，不必再算一遍闭包；无环时闭包本无自反对，回填结果即完整闭包。
 */
const backfilledCycleSql = (sql: ReachSql): string => `SELECT 1 FROM (${unionEdgesSql(sql)}) e
  WHERE e.p = e.c OR EXISTS (SELECT 1 FROM ${sql.dialect.table('bom_reach')} r
    WHERE r."bomType" = e.t AND r."orgId" = e.o AND r."ancestorItemId" = e.c AND r."descendantItemId" = e.p)
  LIMIT 1`;

/**
 * 在同一个迁移事务中重建派生表并安装依赖闭包的存储约束。
 *
 * @remarks
 * 系统迁移排在缺表补建之前：同一版本首次引入 BOM 实体的既有库此刻还没有源表，
 * 内连接的并集边集为空、没有可回填的对；判环与维护随插件 install 在建表之后安装。
 * 派生表先清空再整表回填（远端部署同口径），全图闭包只算一遍；同一次连接末尾的
 * `bootstrapExisting` 仍会对照闭包复核整表。
 */
export const createReachMigration = (adapterName: string): MigrationType => ({
  name: BOM_REACH_MIGRATION,
  async up(executor) {
    const sql = reachSqlFor(adapterName);
    if (!(await graphTablesPresent(executor, sql.postgres))) return;
    await executor.query(`DELETE FROM ${sql.dialect.table('bom_reach')}`);
    await executor.query(backfillReachSql(sql));
    const cycle = await executor.query(backfilledCycleSql(sql));
    if (cycle.rows.length > 0) throw new Error('[rxdb-plugin-bom] 旧主数据并集包含有向环，不能建立可达性');
    for (const statement of buildReachInstallDdl(adapterName)) await executor.query(statement);
  },
  down: () => Promise.reject(new Error('[rxdb-plugin-bom] 可达性迁移不可逆，禁止删除已启用的写入约束'))
});
