/**
 * US-208 线 G：两案对照实验共用的**事务体**。
 *
 * 本文件是整个实验的支点：同一段源码被消费两次 ——
 *
 * - 方案 B（adapter 托管主进程）通过真实 ESM `import` 拿到 {@link SCENARIOS}，在主进程里执行；
 * - 方案 A（IPC 事务 ID 协议）由探针把**本文件的原文**读出来、剥掉 `export` 注入渲染进程执行。
 *
 * 于是两案跑的 SQL 语句、顺序、参数逐字相同，差的只有「事务体在哪个进程里跑」这一件事。
 * 各写一份的话，任何耗时或语义差异都可以被归因成「两份代码不一样」，对照就失去意义了。
 *
 * ## 对本文件的硬约束
 *
 * 注入渲染进程时是**普通脚本**，不是模块：
 *
 * - 不许有 `import` / `require` / 任何 Node API —— 渲染进程是 `sandbox: true` 的；
 * - 顶层只许出现 `export const`，探针按 `/^export /gm` 剥前缀，别的形式剥不掉；
 * - 事务体只能通过入参 `exec` 摸数据库，不能捕获任何外部句柄。
 *
 * 事务体一律**不含** `BEGIN` / `COMMIT` / `ROLLBACK`：谁来划事务边界正是被对照的那件事。
 *
 * @module pglite-tx-experiment/scenarios
 */

/**
 * 实验用的 schema。
 *
 * @remarks
 * 三张东西缺一不可：外键（验「关系」在事务内可见）、bigint/bytea/jsonb/timestamptz 四列
 * （验跨 IPC 逐值保真）、以及一个 `pg_notify` 触发器（验变更事件跨进程）。
 * 触发器挂 AFTER 且 `RETURN NULL`，通知随事务提交才投递 —— 回滚掉的写入不该惊动渲染进程，
 * 这一点两案都要验。
 */
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS tx_probe (
  id      text PRIMARY KEY,
  label   text NOT NULL,
  amount  integer NOT NULL DEFAULT 0,
  big     bigint,
  bin     bytea,
  doc     jsonb,
  at      timestamptz
);

CREATE TABLE IF NOT EXISTS tx_probe_child (
  id        text PRIMARY KEY,
  parent_id text NOT NULL REFERENCES tx_probe(id) ON DELETE CASCADE,
  seq       integer NOT NULL
);

CREATE OR REPLACE FUNCTION tx_probe_notify() RETURNS trigger AS $fn$
BEGIN
  PERFORM pg_notify('tx_probe_changes', COALESCE(NEW.id, OLD.id));
  RETURN NULL;
END;
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tx_probe_notify_trg ON tx_probe;
CREATE TRIGGER tx_probe_notify_trg
  AFTER INSERT OR UPDATE OR DELETE ON tx_probe
  FOR EACH ROW EXECUTE FUNCTION tx_probe_notify();
`;

/**
 * 三个事务体 + 一个专供崩溃用例的慢事务体。
 *
 * 每个都是 `(exec, args) => Promise<结果>`：
 *
 * - `exec(sql, params)` 解析为 PGlite 的 `Results`（`{ rows, fields, affectedRows }`），
 *   出错时 reject；
 * - 返回值要能过 structured clone —— 方案 B 下它是要跨 IPC 回渲染进程的。
 */
export const SCENARIOS = {
  /**
   * AC#2 正向半边：一次事务内多次读写，且中途读得到自己尚未提交的写入。
   *
   * @remarks
   * 中间那次 JOIN 是关键：它同时证明「新插入的父行」与「引用它的子行」在事务内互相可见。
   * 只 `SELECT` 单表的话，即便实现把每条语句拆到互不相干的隐式事务里也照样能过。
   */
  async writeReadWrite(exec, args) {
    await exec(`INSERT INTO tx_probe (id, label, amount) VALUES ($1, 'first', 10)`, [args.idA]);
    await exec(`INSERT INTO tx_probe (id, label, amount) VALUES ($1, 'second', 20)`, [args.idB]);
    await exec(`INSERT INTO tx_probe_child (id, parent_id, seq) VALUES ($1, $2, 1)`, [args.childId, args.idA]);
    const midway = await exec(
      `SELECT p.id, p.amount, c.seq
         FROM tx_probe p JOIN tx_probe_child c ON c.parent_id = p.id
        WHERE p.id = $1`,
      [args.idA]
    );
    await exec(`UPDATE tx_probe SET amount = amount + 5 WHERE id = $1`, [args.idA]);
    const after = await exec(`SELECT amount FROM tx_probe WHERE id = $1`, [args.idA]);
    return {
      statements: 6,
      joinedInsideTx: midway.rows.length,
      amountSeenInsideTx: midway.rows[0]?.amount ?? null,
      amountAfterUpdate: after.rows[0]?.amount ?? null
    };
  },

  /**
   * AC#2 反向半边：写入两行后故意撞主键，整条事务必须一行都不落。
   *
   * @remarks
   * 用主键冲突而不是在 JS 里 `throw`：后者只证明「调用方能中止」，前者还额外把
   * PostgreSQL 自己的 aborted-transaction 状态卷进来 —— 那正是「把多条独立请求包装成假事务」
   * 的实现会露馅的地方（假事务下第一行会留在库里）。
   */
  async failMidway(exec, args) {
    await exec(`INSERT INTO tx_probe (id, label, amount) VALUES ($1, 'doomed', 1)`, [args.idA]);
    await exec(`INSERT INTO tx_probe (id, label, amount) VALUES ($1, 'duplicate', 2)`, [args.idA]);
    return { unreachable: true };
  },

  /**
   * 类型保真：bigint / bytea / jsonb / timestamptz 四类值走完「渲染进程 → IPC → PG → IPC → 渲染进程」。
   *
   * @remarks
   * 值由渲染进程构造、又回到渲染进程比对，两个方向都过一遍 structured clone。
   * 只验返回方向的话，方案 A 每条语句都要传参这件事就没被验到。
   */
  async typeFidelity(exec, args) {
    await exec(
      `INSERT INTO tx_probe (id, label, amount, big, bin, doc, at) VALUES ($1, 'types', 0, $2, $3, $4, $5)`,
      [args.id, args.big, args.bin, args.doc, args.at]
    );
    const read = await exec(`SELECT big, bin, doc, at FROM tx_probe WHERE id = $1`, [args.id]);
    return { row: read.rows[0] ?? null };
  },

  /**
   * 崩溃用例专用：先睡一会儿再写，给探针留出「在事务进行中杀掉渲染进程」的窗口。
   *
   * @remarks
   * `pg_sleep` 睡在数据库里而不是 JS 里，是为了让方案 B 也真的有一段「事务已开、
   * 调用方还没拿到结果」的时间 —— 方案 B 整条事务只有一次 invoke，睡在 JS 里的话
   * 主进程根本还没开始执行。
   */
  async slowInsert(exec, args) {
    await exec(`SELECT pg_sleep($1)`, [args.sleepSeconds]);
    await exec(`INSERT INTO tx_probe (id, label, amount) VALUES ($1, 'slow', 42)`, [args.id]);
    return { inserted: args.id };
  }
};
