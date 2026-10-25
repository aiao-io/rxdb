import { BOM_CYCLE_DEPTH_LIMIT } from '../backend/constants.js';
import { bomSqlDialectFor, isBomPostgres, type BomSqlDialect } from '../resolve/bom-sql.js';

/** 可达维护使用的后端SQL表达式，不包含新的持久化真相源。 */
export interface ReachSql {
  dialect: BomSqlDialect;
  postgres: boolean;
  uuid: string;
  timestamp: string;
}

/** 为当前本地后端构造表引用和原生标识符表达式。 */
export const reachSqlFor = (adapterName: string): ReachSql => ({
  dialect: bomSqlDialectFor(adapterName === 'postgres' ? 'pglite' : adapterName),
  postgres: isBomPostgres(adapterName),
  uuid:
    isBomPostgres(adapterName) ? 'gen_random_uuid()' : (
      `lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-8' || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6)))`
    ),
  timestamp: isBomPostgres(adapterName) ? 'CURRENT_TIMESTAMP' : `strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`
});

/** 从不可变的行归属解析作用域和父端点。 */
export const occurrenceScopeSql = (sql: ReachSql, row: 'OLD' | 'NEW'): string => `
  SELECT h."bomType" AS t, h."orgId" AS o, r."itemId" AS p
  FROM ${sql.dialect.table('bom_line')} l
  JOIN ${sql.dialect.table('bom_header')} h ON h."id" = l."headerId"
  JOIN ${sql.dialect.table('item_revision')} r ON r."id" = h."parentRevisionId"
  WHERE l."id" = ${row}."lineId" AND ${row}."flowDirection" = 'consume'`;

/** 当前物料级并集边；可排除被替换发生项，生效日期和发布态不参与。 */
export const unionEdgesSql = (sql: ReachSql, excluded?: string): string => `
  SELECT DISTINCT h."bomType" AS t, h."orgId" AS o, r."itemId" AS p, occ."childItemId" AS c
  FROM ${sql.dialect.table('bom_line_occurrence')} occ
  JOIN ${sql.dialect.table('bom_line')} l ON l."id" = occ."lineId"
  JOIN ${sql.dialect.table('bom_header')} h ON h."id" = l."headerId"
  JOIN ${sql.dialect.table('item_revision')} r ON r."id" = h."parentRevisionId"
  WHERE occ."flowDirection" = 'consume'${excluded === undefined ? '' : ` AND occ."id" <> ${excluded}`}`;

/** 只为父端祖先×子端后代补不存在的对，不改写已经存在的逻辑对。 */
export const insertReachSql = (sql: ReachSql): string => {
  const reach = sql.dialect.table('bom_reach');
  return `INSERT INTO ${reach} ("id", "bomType", "orgId", "ancestorItemId", "descendantItemId", "createdAt", "updatedAt")
    SELECT ${sql.uuid}, candidate.t, candidate.o, candidate.a, candidate.d, ${sql.timestamp}, ${sql.timestamp}
    FROM (
      WITH scope AS (${occurrenceScopeSql(sql, 'NEW')}),
      ancestors(a) AS (
        SELECT p FROM scope
        UNION SELECT r."ancestorItemId" FROM ${reach} r JOIN scope s ON r."bomType" = s.t AND r."orgId" = s.o AND r."descendantItemId" = s.p
      ), descendants(d) AS (
        SELECT NEW."childItemId" FROM scope
        UNION SELECT r."descendantItemId" FROM ${reach} r JOIN scope s ON r."bomType" = s.t AND r."orgId" = s.o WHERE r."ancestorItemId" = NEW."childItemId"
      ) SELECT s.t, s.o, a.a, d.d FROM scope s CROSS JOIN ancestors a CROSS JOIN descendants d
    ) candidate WHERE candidate.a <> candidate.d
    ON CONFLICT ("bomType", "orgId", "ancestorItemId", "descendantItemId") DO NOTHING;`;
};

// visited 显式物化与同链其余 CTE 一致：PG 的递归 CTE 本就恒物化，SQLite 也只求值一次，
// 提示只把 SQLite 的协程计划固定为物化，不依赖计划器的取舍
const deletionCtes = (sql: ReachSql): string => {
  const reach = sql.dialect.table('bom_reach');
  return `WITH RECURSIVE scope AS MATERIALIZED (${occurrenceScopeSql(sql, 'OLD')}),
    ancestors(a) AS MATERIALIZED (
      SELECT p FROM scope
      UNION SELECT r."ancestorItemId" FROM ${reach} r JOIN scope s ON r."bomType" = s.t AND r."orgId" = s.o AND r."descendantItemId" = s.p
    ), descendants(d) AS MATERIALIZED (
      SELECT OLD."childItemId" FROM scope
      UNION SELECT r."descendantItemId" FROM ${reach} r JOIN scope s ON r."bomType" = s.t AND r."orgId" = s.o WHERE r."ancestorItemId" = OLD."childItemId"
    ), edges AS MATERIALIZED (
      SELECT e.p, e.c FROM (${unionEdgesSql(sql, 'OLD."id"')}) e JOIN scope s ON e.t = s.t AND e.o = s.o
    ), visited(a, d, depth) AS MATERIALIZED (
      SELECT a, a, 0 FROM ancestors
      UNION SELECT v.a, e.c, v.depth + 1 FROM visited v JOIN edges e ON e.p = v.d WHERE v.depth < ${BOM_CYCLE_DEPTH_LIMIT}
    )`;
};

/**
 * 删除重检的硬限判断，无法完成否定证明时让源写入回滚。
 *
 * @remarks
 * 删除 consume 发生项（或把它改为非 consume、换子件）后，要在 {@link BOM_CYCLE_DEPTH_LIMIT}（128）层内
 * 证明受影响的祖先×后代对已无其他支持路径。物料图深度超过该层数时证明无法完成，写入以
 * `rxdb:bom_cycle:depth_limit`（归一为 `BomCycleError`，路径为空）整体拒绝——这是对外的硬限制，
 * 不降级为保留可能陈旧的可达对。
 */
export const deletionDepthExceededSql = (sql: ReachSql): string => `${deletionCtes(sql)}
  SELECT 1 FROM visited v JOIN edges e ON e.p = v.d WHERE v.depth >= ${BOM_CYCLE_DEPTH_LIMIT} LIMIT 1`;

/**
 * 否定证明「受影响对已无其他支持路径」：visited 里没有该对。两种写法同义，形态按后端计划器取舍：
 * PG 把物化 CTE 上的 NOT EXISTS 计划成嵌套循环反连接，每个目标对线性扫一遍 visited（长链删中间边时
 * 目标对 × visited 达百万级比较）；行值 NOT IN 只建一次哈希子计划。SQLite 相反：NOT EXISTS 给物化 CTE
 * 建自动索引，行值 NOT IN 反而慢一个数量级。NOT IN 遇空值整体为 UNKNOWN（该对不删、闭包留陈旧对）：
 * 目标对两端是可达表的非空列，visited 排除空值后两种写法在任何输入上逐行同义。
 */
const unsupportedPair = (sql: ReachSql): string =>
  sql.postgres ?
    `(target."ancestorItemId", target."descendantItemId") NOT IN (SELECT v.a, v.d FROM visited v WHERE v.a IS NOT NULL AND v.d IS NOT NULL)`
  : `NOT EXISTS (SELECT 1 FROM visited v WHERE v.a = target."ancestorItemId" AND v.d = target."descendantItemId")`;

/** 只移除已不再由真实发生项支持的受影响物料对。 */
export const deleteReachSql = (sql: ReachSql): string => {
  const reach = sql.dialect.table('bom_reach');
  return `DELETE FROM ${reach} WHERE "id" IN (
    ${deletionCtes(sql)}
    SELECT target."id" FROM ${reach} target JOIN scope s ON target."bomType" = s.t AND target."orgId" = s.o
    WHERE target."ancestorItemId" IN (SELECT a FROM ancestors)
      AND target."descendantItemId" IN (SELECT d FROM descendants)
      AND ${unsupportedPair(sql)}
  );`;
};
