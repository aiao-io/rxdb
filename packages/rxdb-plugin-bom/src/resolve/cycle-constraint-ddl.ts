/**
 * @fileoverview 远端 PostgreSQL 的写入期环约束 DDL 导出（US-509 AC#7）
 *
 * `http` / `supabase` 下本仓发不出 DDL（AC#6 显式 fail-fast）；本模块返回可供使用方
 * 自行部署的 DDL 文本，部署与否由使用方负责。与本地 PGlite 触发器同口径的递归判环，
 * 另加多写入端的两道保障：
 * 1. 触发器开头取 `(bom_type, org_id)` 级的 `pg_advisory_xact_lock`，同一作用域的写入串行化；
 * 2. 检查 `current_setting('transaction_isolation')` 必须是 `read committed`——advisory lock
 *    只让写入排队，拿锁不等于刷新快照；Repeatable Read / Serializable 的旧快照会漏检并提交反向边。
 *    两个作用域交叉顺序写入的死锁由 PostgreSQL 检出并中止其一（推断，未连真实 PG 复现）。
 */

/**
 * 生成远端 PostgreSQL 的环约束 DDL（含 advisory 锁与隔离级别检查）。
 *
 * @returns 可直接执行的 DDL 文本（`CREATE OR REPLACE FUNCTION` + `CREATE TRIGGER`）
 */
export const cycleConstraintDdlForRemotePg = (): string => {
  const lockExpr = `('bom:' || scope."bomType" || ':' || scope."orgId")`;
  return `-- rxdb-plugin-bom US-509 AC#7：远端 PostgreSQL 写入期环约束（部署与否由使用方负责）
CREATE OR REPLACE FUNCTION bom_cycle_guard_remote() RETURNS trigger AS $$
DECLARE
  scope bom_header%ROWTYPE;
  msg text;
BEGIN
  -- US-513：非 consume 边是反向物料流，不进入判环
  IF NEW.flow_direction <> 'consume' THEN
    RETURN NEW;
  END IF;

  -- 隔离级别是合同的一部分：advisory lock 只串行化写入，Repeatable Read 的旧快照会漏检
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'rxdb:bom_cycle:isolation:%', current_setting('transaction_isolation');
  END IF;

  -- NEW 行的作用域：line → header → parent_revision
  SELECT h.* INTO scope
  FROM bom_line l
  JOIN bom_header h ON h.id = l.header_id
  WHERE l.id = NEW.line_id;

  -- 同一 (bom_type, org_id) 的写入串行化；跨作用域交叉顺序的死锁由 PG 检出并中止其一
  PERFORM pg_advisory_xact_lock(hashtext(${lockExpr}));

  WITH RECURSIVE reach(item_id, path, depth) AS (
    SELECT NEW.child_item_id, NEW.child_item_id::text, 0
    UNION ALL
    SELECT e.child_item_id, reach.path || '>' || e.child_item_id, reach.depth + 1
    FROM reach
    JOIN (
      SELECT r.item_id AS parent_item_id, occ.child_item_id
      FROM bom_line_occurrence occ
      JOIN bom_line l ON l.id = occ.line_id
      JOIN bom_header h ON h.id = l.header_id
      JOIN item_revision r ON r.id = h.parent_revision_id
      WHERE h.bom_type = scope.bom_type AND h.org_id = scope.org_id
        AND occ.id IS DISTINCT FROM NEW.id
        AND occ.flow_direction = 'consume'
      UNION ALL
      SELECT scope.item_id, NEW.child_item_id
      WHERE NEW.flow_direction = 'consume'
    ) e ON e.parent_item_id = reach.item_id
    WHERE reach.depth < ${128} AND reach.item_id <> scope.item_id
  ),
  found AS (SELECT reach.path FROM reach WHERE reach.item_id = scope.item_id LIMIT 1),
  truncated AS (
    SELECT 1 AS hit FROM reach
    JOIN (
      SELECT r.item_id AS parent_item_id
      FROM bom_line_occurrence occ
      JOIN bom_line l ON l.id = occ.line_id
      JOIN bom_header h ON h.id = l.header_id
      JOIN item_revision r ON r.id = h.parent_revision_id
      WHERE h.bom_type = scope.bom_type AND h.org_id = scope.org_id
    ) e ON e.parent_item_id = reach.item_id
    WHERE reach.depth >= ${128} LIMIT 1
  )
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM found) THEN 'rxdb:bom_cycle:' || (SELECT path FROM found)
    WHEN EXISTS (SELECT 1 FROM truncated) THEN 'rxdb:bom_cycle:depth_limit'
  END INTO msg FROM (SELECT 1) AS seed;

  IF msg IS NOT NULL THEN
    RAISE EXCEPTION '%', msg;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS bom_line_occurrence_cycle_remote_trg ON bom_line_occurrence;
CREATE TRIGGER bom_line_occurrence_cycle_remote_trg
  BEFORE INSERT OR UPDATE OF child_item_id ON bom_line_occurrence
  FOR EACH ROW EXECUTE FUNCTION bom_cycle_guard_remote();
`;
};
