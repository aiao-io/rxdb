# Implementation Plan: epic-009 首轮切片第 2 步

**Branch**: `claude/bom-related-work-77235b` | **Created**: 2026-10-13

## 技术上下文（第 1 步已就位）

- `@aiao/rxdb-plugin-bom`：五个实体、双后端触发器（结构列 / 已发布协议 / 十进制格式）、`DO $$` 块触发器先例、BomRepository 门面
- US-030 阶段 B/C：部分唯一索引（`uq_` 命名 + 漂移）、区间排他、SQLite ≥ 3.47（`RAISE` 表达式）
- 测试装配：双后端共享断言、实体单例注册（同后端共享 adapter）、`tableRef(backend, table)` 直连 SQL 辅助

## 设计

### 1. 实体与 schema 变更（`entities.ts`）

- `BomItemRevision`：新增索引 `released_effective_from`（`properties: ['itemId','effectiveFrom'], unique: true, where: {and:[{field:'state',operator:'=',value:'released'}]}`，US-508 AC#10）；新增 `historyBatchNo`（string，nullable，FK → `bom_history_batch.batchNo`，ON DELETE RESTRICT 默认）
- `BomHeader`：新增 `historyBatchNo`（同口径）
- 新实体 `BomHistoryBatch`（表 `bom_history_batch`）：`batchNo`（string，primary——调用方给定、确定性 AC#18）、`state`（enum `open/closed`，default `open`）、append-only 触发器（拒绝 DELETE；UPDATE 只允许 `open→closed`）

### 2. 追溯发布检查（`backend/bom-trigger-ddl.ts` 扩展）

`item_revision` 的发布转移触发器（两后端）追加：

- `effective_from` 非空（已有）；
- `effective_from >= 发布当日`，发布当日 = 存储层 UTC 日期（SQLite `date('now')`、PG `(now() AT TIME ZONE 'UTC')::date`）；
- 例外：行的 `history_batch_no` 指向**开启态**批次时跳过（子查询查 `bom_history_batch.state`）；
- 消息 `rxdb:bom_publish_validation:item_revision:追溯生效被拒绝（effective_from 早于发布当日）`。

### 3. 判环触发器（`backend/bom-trigger-ddl.ts` 扩展）

- 入口：`bom_line_occurrence` 的 INSERT 与 UPDATE（SQLite `WHEN NEW."child_item_id" IS NOT OLD."child_item_id"` 守卫更新路径；PG 函数内按 `TG_OP` / 字段变化判断）。
- 作用域：NEW 行经 line → header 的 `(bom_type, org_id)`；父物料 = header 的 `parent_revision_id` → `item_id`。
- 并集边（物料级，不过滤头状态与日期）：
  ```sql
  SELECT r."item_id" AS parent_item_id, occ."child_item_id"
  FROM bom_line_occurrence occ
  JOIN bom_line l ON l.id = occ."line_id"
  JOIN bom_header h ON h.id = l."header_id"
  JOIN item_revision r ON r.id = h."parent_revision_id"
  WHERE h."bom_type" = :scope_type AND h."org_id" = :scope_org
  ```
- 递归 CTE（两后端同一形状，`WITH RECURSIVE` 是标准 SQL）：从 `child_item_id` 出发沿并集边找 `parent_item_id`；`depth` 硬上限 `BOM_CYCLE_DEPTH_LIMIT = 128`；`path` 列以物料 id 用 `>` 串起（PG `path::text` 由 `array` 构造）。
- 判定三态：找到父物料 → `RAISE` `rxdb:bom_cycle:<path>`（自环在 depth 0 命中，路径 = 单个物料，AC#2）；未找到且触深度上限 → `RAISE` 深度错误（不静默通过，AC#3）；未找到且耗尽 → 放行。
- SQLite 形态：`BEFORE INSERT/UPDATE` 触发器内 `SELECT RAISE(ABORT, ...) FROM (<递归 CTE>) WHERE ... LIMIT 1`；PG 形态：plpgsql 函数内执行 CTE，`DO $$` 块装触发器（第 1 步先例）。

### 4. 错误家族扩展（`types.ts`）

- `BomCycleError extends BomError { path: string[] }`；归一前缀 `rxdb:bom_cycle:`（路径按 `>` 拆）。
- `BomResolutionError extends BomError { field?: string }`——解析 API 违约（缺 `as_of_date` 等）。
- `BomSyncUnsupportedError extends BomError`——BOM 实体声明同步（AC#12）。
- `BomDepthLimitError`？不必要——深度上限错误也是 `rxdb:bom_cycle:` 前缀带 depth 信息，归一为 BomCycleError（path 空、附 detail）。

### 5. 解析器（`src/resolve/`）

- `resolution.ts`（类型）：`ResolutionContext` / `ResolvedLineOccurrence` / `ResolutionResult` / `ResolutionManifest` / `UnresolvedAlternative`。
- `bom-sql.ts`：方言对象（占位符 `?` / `$n`、表引用）与 SQL 构造：
  - 头选择：released + `(parent_revision_id, bom_type, org_id)` + 可选 `alternative_no`；
  - 发生项：line→header released，`effective_from <= :d AND (effective_to IS NULL OR effective_to > :d)`；
  - 子件修订解析：相关子查询（precise 直接取、imprecise 取最新 released ≤ 日期）——SQLite `ORDER BY ... LIMIT 1` 子查询 / PG `LATERAL` 或相关子查询同形。
- `resolver.ts`：
  - `resolveBom(context, { parentItemId | parentRevisionId })`：父修订选择（按日期取最新 released ≤ 日期，或显式 id；父修订未发布 → `BomResolutionError`）；头/备选判定（多备选且无 `alternativeNo` → `unresolved` + 候选）；全部读取在 `adapter.transaction` 内（AC#15）。
  - `loadHistory(batch)`：`adapter.transaction`：插 batch 行（open）→ 插 draft 修订/头（带 `historyBatchNo`）→ 逐行 UPDATE 到 released（触发器放行追溯）→ 关 batch；batch 输入形状 `{ batchNo: string; revisions: [{ itemId, revisionNo, effectiveFrom, defaultPhantom }], headers: [{ parentRevisionKey?, ... }] }`——头挂到本批修订（按批内序号索引）；行发生项？装载的结构要含行——batch 输入含 `lines`（挂本批头，含发生项），全部 draft 插入后统一发布转移。输入里的引用以批内索引解决（如 revision 序号、header 序号、line 序号）。
- `cycle-constraint-ddl.ts`：`cycleConstraintDdlForRemotePg()` 返回 PG DDL 文本（advisory 锁 + `transaction_isolation` 检查 + 触发器），纯文本生成器，本仓不部署。

### 6. 展开与反查（`src/resolve/expansion.ts`）

- `expandBom(context, { parentItemId | parentRevisionId, budgets, signal })`：下钻；`whereUsed(context, { childItemId, budgets, signal })`：反查。
- 递归 CTE（`WITH RECURSIVE`，两后端同形）：
  - 下钻：根 = 父物料的解析修订/头；子步 = 解析后的发生项（released 头 + 生效窗口 + 子件修订解析内联）；路径 = 发生项 id 序列；`depth` 上限来自预算。
  - 反查：从子件出发沿边向上，路径 = 发生项 id 序列（反向）。
- 预算结算（TS，BFS 序）：深度（CTE 硬限）、展开数、返回路径数；触顶即停止处理、`truncated: { reason, }` 附触顶项；`AbortSignal` 在行批间检查（`cancelled` 原因）。
- `assertCompleteResolution(result)`：`unresolved` / `truncated` 存在即抛（供 US-511 / US-514 / US-521 消费方守卫，AC#11 的本步形态）。

### 7. 插件接线（`plugin.ts`）

- 后端解析：`http` / `supabase` → `BomBackendCapabilityError`（「该适配器无写入期环约束」点名，AC#6）。
- 同步检查：对每个已注册 BOM 实体经 `rxdb.entitySync` 解析生效策略，非 `None` → `BomSyncUnsupportedError`（AC#12）。
- 触发器 DDL：追加判环触发器与批次表触发器（沿用第 1 步的 DDL 下发循环）。
- `declare module`：`rxdb.bom` 上暴露 `resolveBom` / `expandBom` / `whereUsed` / `loadHistory` / `cycleConstraintDdlForRemotePg`。

### 8. 测试矩阵（TDD）

| 面 | 位置 |
| --- | --- |
| US-508 AC#1/#3~#8/#11/#17 | 插件 `bom-resolution.spec.ts`（双后端：跨 org、同日边界、草稿过滤、修订选择、缺日期拒绝、拨钟不变、unresolved、imprecise/precise manifest） |
| AC#9/#10/#13/#14/#18 | 同上 + 触发器直连 SQL 断言（追溯发布、部分唯一、loadHistory 确定性、批次 append-only） |
| AC#15 | wa-sqlite persistent + pglite idb 双实例交错写入 |
| US-509 AC#1/#2/#3/#5/#10/#14/#17 | `bom-cycle.spec.ts`（双后端：真环+路径、自环、深度上限、直连 SQL、跨类型、草稿头反向边） |
| AC#9 union_only | 同上（跨时段互斥反向边 → 插件 API 标记） |
| AC#6/#7/#12 | 插件安装期断言（http/supabase fail-fast、DDL 文本、同步拒绝） |
| US-510 AC#1/#2/#7/#10/#11 | `bom-expansion.spec.ts`（双后端：深度截断、12 整机反查、窗口滤除、菱形 10,000 截断、assertComplete 拒绝） |

### 9. 门禁与回写

api-baseline 更新、覆盖率 ≥ 80%、affected full、故事回写（US-508 勾首轮 AC + 技术笔记首轮切片句；US-509 勾首轮 AC；US-510 阶段 A 勾选）、epic/roadmap/status-overview 第 2 步记录、specs/012 quickstart。

## 风险与对策

| 风险 | 对策 |
| --- | --- |
| 递归 CTE 在触发器内的性能（每次发生项写入扫全图） | 并集边是子查询物化（PG `AS MATERIALIZED`），第 1 步规模（< 10⁴ 边）可接受；US-510 阶段 B 换 O(1) 可达性 |
| SQLite 触发器内 `WITH RECURSIVE` 与 `RAISE` 组合 | 探针先行；形态为 `SELECT RAISE(...) FROM (CTE) WHERE ...` |
| PG 递归 CTE 与 plpgsql 变量绑定 | CTE 内用 `$1` 类占位符（plpgsql `USING` 或拼接）——实现期定形 |
| 展开预算无法在 SQL 内早停 | 深度硬上限在 CTE；展开数 / 路径数在 TS BFS 结算（spec 第 13 条已论证 AC#10 的截断原因正确） |
| 菱形 1M 路径测试耗时 | 一次性基准断言，两后端各 ≤ ~5s；必要时缩小为 2¹⁶ 结构另单测预算结算逻辑 |
