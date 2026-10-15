# Implementation Plan: epic-009 首轮切片第 6 步（US-515 ECN 变更管理 + US-525 阶段 C）

**Branch**: `claude/bom-related-work-77235b` | **Spec**: [spec.md](./spec.md) | **Story**: [US-515](../../../requirements/stories/domain/US-515-bom-change-management.md)

## 摘要

落地 `ecn` 实体与「变更管理驱动的生效期」：ECN 是发生项区间的唯一真相源，`effective_from/to` 由 `ecn.effective_date` 派生；写入协议矩阵放行挂在 `draft` ECN 上的新对象；可见性按 ECN 状态裁决（US-508 AC#12/#16）；发布 / 改期 / 取消三种转换在存储层走同一入口，在「转换后运行投影」上按生效域切片对受影响头整批校验；外加影响面与差异两条 TS 查询 API 与 demo 阶段 C。

## 技术上下文（第 1~5 步已建立的先例）

- 跨行聚合校验（位号计数 / 阶梯 / 替代组 / 分摊）都在**存储层发布触发器**里（`bom-trigger-ddl.ts`），SQLite 与 PGlite 各一份 DDL；本步的投影校验沿用同一形态。
- 追溯生效检查按「`history_batch` 开启态批次」跳过（`pgPublishTransitionFunction` 第 782 行先例）——种子 / 历史 ECN 走 `loadHistory`。
- 级联 DML 在触发器里执行时两后端都不递归触发其他触发器（SQLite `recursive_triggers` 默认关；PGlite 0.5.8 探针「行级触发器内 DML 不触发」）——ecn 状态转移触发器里的级联必须显式删全子表（位号 / 分摊），不指望位号级联触发器兜底（PG 侧位号级联本就在应用层）。
- PG 触发器函数模式：`DECLARE msg text; SELECT … INTO msg; IF msg IS NOT NULL THEN RAISE EXCEPTION '%', msg;`（`pgCycleFunction` 先例）；SQLite 触发器模式：`SELECT RAISE(ABORT, …) FROM … LIMIT 1;` 或 `WHERE EXISTS (…)`。
- 「当日」口径：SQLite `date('now')`（UTC）、PG `(now() AT TIME ZONE 'UTC')::date`。
- 定点整数 10⁹ 比较与规范串还原（替代组合计 / 分摊合计）已有实现，投影校验复用同法。

## 关键设计决策

### D1. `ecn` 实体与列变更（schema）

- 新实体 `BomEcn`：`ecnNo`（unique）、`state`（draft/released/cancelled，默认 draft）、`effectiveDate`（date，**创建即必填**，INSERT 触发器兜底）、`reason`（nullable）、`historyBatchNo`（nullable，历史装载通道用）。`effective` 是派生态不存。
- `BomLine.ecnInId`、`BomLineOccurrence.ecnInId/ecnOutId` 列类型 string → **uuid**，加 FK → `bom$ecn.id`（PGlite 的 FK 类型匹配要求，`routingId` 先例）；`BomSubstituteGroup` 补 `ecnInId`（uuid，nullable）——矩阵里组也要能挂 ECN。
- `BOM_ENTITIES` 11 → 12。既有库重开时新表 / 新列由引擎迁移补齐（demo 的 e2e 已有既有库用例，本步扩断言）。

### D2. 保存期：派生区间与写入协议矩阵（存储层）

**派生区间**（真相源唯一）：
- 发生项 INSERT：`ecnInId` 非空 ⇒ `effectiveFrom` 必须恰等于该 ECN 的 `effectiveDate`（AC#5 手填冲突拒绝）；挂 draft ECN 是唯一允许挂的形态（挂 released ECN 的 INSERT 拒绝，AC#14）。
- 打截止标记（`ecnOutId` 空 → X）：X 必须是 draft；本发生项 `ecnInId` 空或已发布（AC#16）、`effectiveTo` 当前为 NULL（AC#15）；同一语句 `effectiveTo` 收窄为 X 的生效日。
- 手改 `effectiveFrom/To`（与派生值不一致）拒绝；`ecnOutId` X → NULL 时 `effectiveTo` 同步恢复 NULL（撤回 / 取消级联路径）。
- 区间排他（US-030 阶段 C 已有）自动给出 AC#17/#18/#19 的写入顺序约束，不新增触发器。

**矩阵放行**（扩展现有「已发布头全拒」守卫，行 / 发生项 / 位号 / 组 / 成员 / 分摊六处）：
- 行 INSERT 挂 draft ECN；行 DELETE 仅当 `ecnInId` 指向 draft/cancelled ECN 且发生项已先删；行 UPDATE 仍全拒。
- 发生项 INSERT 挂 draft ECN，且所属行 `ecnInId` 为空 / 已发布 / 等于本 ECN（AC#26 ① 不跨草稿引用）；`ecnOutId` 打标记 / 清标记按上节；其余 UPDATE（含改 qty、换子件）拒绝（AC#14/#22）。
- 位号 / 分摊行 / 组成员：INSERT/DELETE 仅当所属发生项 `ecnInId` 挂 draft ECN（成员 INSERT 另查组的 `ecnInId` 归属，AC#26）；组 INSERT 挂 draft ECN；组 UPDATE 全拒。
- `bom_header` 的 UPDATE 仍只有 `draft → released`（已有）；头字段改值全拒（AC#22 已有 `sqlitePublishTransitionTrigger` 之外的头列守卫——若缺 `costLotQty` 等列守卫则本步补全）。
- 错误码沿用 `BomWriteProtocolError`（`rxdb:bom_write_protocol:…`）。

### D3. 解析可见性（US-508 AC#12/#16）

`bom-sql.ts` 四个已解析查询（resolved occurrences / header occurrences / children of revisions / parents of items）统一追加：
- 引入侧：`occ.ecnInId IS NULL OR EXISTS (SELECT 1 FROM ecn e WHERE e.id = occ.ecnInId AND e.state = 'released')`；
- 截止侧：`effectiveTo` 比较仅在 `ecnOutId IS NULL OR EXISTS(…released…)` 时生效，否则该行视为 `+∞`（未发布 ECN 的截止不截止）。
- 可见性只看 `asOfDate` 与 ECN 状态，不读宿主当日（AC#16 拨钟断言）。

### D4. 三种转换的存储层入口（ecn 表 UPDATE 触发器）

一个入口、三组 WHEN 分支（SQLite 分触发器、PG 分函数内 IF）：
- `draft → released`：生效日 ≥ UTC 当日（追溯拒绝，AC#8；`historyBatchNo` 指向开启态批次时跳过——历史装载）；投影校验。
- `released` 改 `effectiveDate`：未生效（生效日 > 当日）才可改（AC#7/#11）；不得越过同一逻辑行后继 ECN 的生效日（AC#20，点名后继 ECN）；级联更新（**收窄先于放宽**：新日期更晚先改引入行 from 再改截止行 to；更早则相反）；投影校验。
- `released → cancelled`：未生效才可取消；被后续 ECN 截止的引入发生项存在则拒（AC#12 点名 B）；引入的逻辑行 / 组仍被其他 ECN 引用则拒（AC#26 ③ 点名 E2）；级联删除（位号 → 分摊 → 发生项 → 逻辑行，按 `ecnInId = OLD.id` 反查）+ 清截止标记恢复 `effectiveTo = NULL`；投影校验。
- 其余转移（released→draft、cancelled→*、released 后改其他列）拒绝。任一校验失败 RAISE → 整语句回滚（级联一并回滚，AC#4 的原子性）。

### D5. 转换后运行投影校验（发布 / 改期 / 取消共用）

受影响头集合 = 该 ECN 引入/截止的发生项经行归属的头 ∪ 该 ECN 引入的逻辑行归属的头。对每个头，在投影上跑既有四类聚合的变体：
- **投影成员**：`(ecnInId IS NULL OR ecnInId = 目标 ECN OR EXISTS(…released…))`；**采信区间**：`ecnOutId IS NULL OR = 目标 ECN OR EXISTS(…released…)` 时用存储 `effectiveTo`，否则视为 `+∞`。
- **位号计数**：目标 ECN 引入的 `designatorManaged` 行位号数 = qty（逐行，AC#9，错误点名头 / 发生项）。
- **替代组**（检查点切片法）：组内投影成员的 `effectiveFrom` ∪ 采信 `effectiveTo` 构成检查点集；每个检查点上：成员非空时恰好一个 primary（AC#9/US-512#9）、priority 无并列（AC#25）、proportional 定点合计 = 1（AC#23/#24/US-512#6）；**空切片不校验**（US-512#14）。错误给出切片边界与运行投影合计。
- **阶梯**：投影成员两两「日期段与批量段同时相交」检测（复用 `sqliteTierPublishGuard` 谓词形态）。
- **分摊合计**：目标 ECN 引入的发生项的分摊行定点合计 = 1（US-520 AC#4/#10 接入同一入口）。
- 头发布触发器（草稿头 `draft → released`）保持不变——两套入口互不重叠（已发布头不再有发布转移）。

### D6. TS 查询 API（AC#1/#2）

新文件 `resolve/ecn.ts`，插件门面挂 `ecnImpact` / `ecnDiff`：
- `ecnImpact(ecnId)`：成员发生项 → 归属头 → 父物料，按 ECN 生效日（生效后结构）经 where-used 逻辑向上走到无父物料（整机），返回整机列表与命中路径（AC#1）。
- `ecnDiff(ecnId)`：按 `生效日 - 1 天` 与 `生效日` 两个评估日对涉及的每个头各解析一次（复用 `buildResolvedOccurrencesSql`），按逻辑行对齐对比：新增（after 有 before 无的行）、删除（截止）、改量（同行 qty 变）、改版（同行 child 变，AC#2）。

### D7. 历史装载 C 层

`HistoryBatchInput` 扩 `ecns: { ecnNo, state, effectiveDate, reason?, id?, createdAt?, updatedAt? }[]`；行 / 发生项 / 组输入扩 `ecnInId?/ecnOutId?`。装载顺序：批次行 → 修订 → **ECN 行（draft 写 + 发布转移，盖批次号跳过追溯检查）** → 头与行（区间按 ECN 派生值写）。种子 C 层复用此通道。

### D8. demo 阶段 C（US-525 AC#10~#12）

- 种子 C 层 `SCOOTER_DATASET_C`：`ECN-2026-014`（released，2026-10-01）改 3 张 BOM（SC-100 / PCBA / BATT）的 5 行——新增 1、截止 1、改量 1（qty 2→3）、改版 2（换子件）；另有一张已生效 ECN（如 2026-01-15，改 HOUSING 或 COVER-ASSY 的 1 行）供 AC#12 ②「拒绝取消」。受影响行以「截止 + 引入」落库（下层行的 `effectiveTo`/`ecnOutId` 由 C 层装载打标记——分层种子允许的追加，golden 对受影响路径分两段给值，不受影响路径逐位不变）。
- golden C 层：受影响路径按 `2026-09-22`（默认评估日，> 10-01）给新值；AC#10 用两段评估日（如 2026-09-15 / 2026-10-15）断言行集不同。
- 页面：ECN 面板（种子 ECN 列表 + 选中后影响面 / 差异展示 + 「现场新建并发布 ECN」「取消现场 ECN」「对已生效 ECN 点取消」三个操作按钮，走插件 API）；评估日切换复用现有输入（AC#10）。
- e2e：三条 AC 用例（bom-demo.spec.ts 第 11~13 条）。

## 风险与对策

| 风险 | 对策 |
| --- | --- |
| 投影校验 SQL 在两后端口径漂移（切片边界、定点合计） | 双后端同一断言矩阵（vitest 参数化跑 SQLite + PGlite 两遍）；探针先验证 PGlite plpgsql 触发器内 DML 与 `date('now')` 语义 |
| PGlite plpgsql 触发器函数里的多表级联 DML 受限 | 第 5 步探针已证「触发器内 DML 不触发」但可执行；若不支持多语句 DML，级联降级为 ecn UPDATE 语句前的同一事务应用层步骤（插件 API），直连 UPDATE 只做状态 + 校验（可见性规则兜底一致性）——实现时先探针再定 |
| 改列类型 string→uuid 的既有库迁移 | PG 引擎迁移 ALTER；demo reset 全删重建；vitest 用新库；api-baseline 更新随提交 |
| 检查点切片法的 SQL 规模 | 每个聚合一个独立触发器函数，SQLite / PG 各 ~60 行；用 LIMIT 1 + 单行错误消息点名冲突切片 |
| 种子 C 层改写 A/B 层行的 `effectiveTo`（分层种子「不改写下层行」的字面冲突） | 打截止标记是 C 层 ECN 语义的必然（US-525 AC#11 就要求改 3 张 BOM 的 5 行）；golden 受影响路径显式分两段给值，「不受影响路径逐位不变」的断言范围相应收紧并在 quickstart 注明 |

## 验证策略

- 单测按故事 AC 分组：`bom-ecn.spec.ts`（保存期协议 + 状态机，双后端参数化）、`bom-ecn-resolution.spec.ts`（可见性 + US-508 AC#12/#16）、`bom-ecn-impact.spec.ts`（AC#1/#2）、`bom-ecn-slice.spec.ts`（投影切片校验 AC#23~#25 + US-512#6/#9/#14）、既有 spec 回归（金样值不变——除非路径受影响）。
- e2e：`dev-rxdb-bom-e2e` 第 11~13 条 + 既有 10 条回归。
- 门禁：lint / typecheck / test / 覆盖率 ≥ 80% / api-baseline / affected full。

## 分阶段任务

见 [tasks.md](./tasks.md)。顺序：T001 文档 → T002 schema（ecn 实体 + 列） → T003 保存期派生与矩阵 → T004 可见性 → T005 状态机（发布/改期/取消 + 级联） → T006 投影校验 → T007 TS 查询 → T008 历史装载 → T009 种子/golden → T010 demo 面板 + e2e → T011~T013 门禁与回写。
