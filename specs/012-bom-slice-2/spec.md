# Feature Specification: epic-009 首轮切片第 2 步（US-508 + US-509 首轮 AC + US-510 阶段 A）

**Feature Branch**: `claude/bom-related-work-77235b`
**Created**: 2026-10-13
**Status**: Implemented
**Input**: 第 1 步已交付（US-030 A/B/C + US-507 A/B + Tauri rusqlite 0.33 + qty 存储段，affected 272/272 全绿）；按 [epic 切片表](../../../requirements/epics/epic-009-bom-domain-model.md#首轮可开工切片) 推进第 2 步。

权威规格见各故事文件，本 spec 是第 2 步的**实现范围编译**，冲突以故事为准：

- [US-508 BOM 视图解析](../../../requirements/stories/domain/US-508-bom-view-resolution.md) — 首轮 AC#1~#11 / #13~#15 / #17 / #18（AC#12 / #16 等 US-515）
- [US-509 DAG 约束与环路检测](../../../requirements/stories/domain/US-509-bom-dag-cycle-detection.md) — 首轮 AC#1~#3 / #5~#7 / #9~#12 / #14 / #17（AC#4 等 US-513、AC#8 等 US-510 阶段 B、AC#13 等真实 PG、AC#15/#16 等 US-515）
- [US-510 多级展开与 where-used 反查](../../../requirements/stories/domain/US-510-bom-multilevel-explosion.md) — 阶段 A：AC#1 / #2 / #11 与 AC#7 / #10 的下钻部分（滤除、截断）

## User Scenarios & Testing

### US1 视图解析（US-508 首轮，Priority: P1）

按显式 `ResolutionContext`（`bom_type` / `org_id` / `as_of_date` 必填 / `alternative_no` 选择）解析出唯一一份有效行集，附 manifest（命中的头、发生项 ID、解析所得子件修订、上下文）；同一上下文在同一份已提交数据上永远同一结果。

**Independent Test**：跨 org 互不串（AC#1）；同日失效+生效只取新行（AC#4）；草稿头不入结果（AC#5）；修订按 `effective_from ≤ as_of_date` 取最新（AC#6）；缺 `as_of_date` 拒绝（AC#7）；改时钟结果与 manifest 不变（AC#8）；追溯发布被拒（AC#9）；同物料同 `effective_from` 双已发布修订被部分唯一索引拒绝（AC#10）；多备选手动未指定 → `unresolved` + 候选（AC#11）；imprecise/precise 解析分别记 manifest（AC#17）；一次解析的读取在同一读事务（AC#15）。

### US2 历史装载通道（US-508 AC#13/#14/#18，Priority: P1）

`loadHistory(batch)` 一次事务写入：建开启态 `bom_history_batch` → 写 draft 修订/头（盖批次号）→ 发布转移（触发器对开启态批次跳过追溯检查，其余校验照常）→ 关闭批次。批次号由调用方给定（确定性，AC#18）；批次表只追加、只允许开启→关闭转移；已关闭批次不再放行追溯发布（AC#14）。

**Independent Test**：装载 `effective_from` 在过去的已发布修订/头被接受、行带批次号且批次已关闭（AC#13）；直连 SQL 用已关闭批次号再追溯发布被拒、改/删批次行被拒（AC#14）；同一 batch 输入两个空库装载后批次行逐字相同（AC#18）。

### US3 判环下沉存储层（US-509 首轮，Priority: P1）

同一 `(bom_type, org_id)` 内全部已存 `consume` 行发生项按物料级并集判环，成环与自环（路径长度 0 的退化环）在写入期由触发器拒绝，`BomCycleError` 携带环路径；草稿头与 draft ECN 的发生项也在并集里（解析不可见 ≠ 判环不可见）。无闭包表时递归 CTE + 深度硬上限，触上限报错不静默通过。

**Independent Test**：A→B→C 后插 C→A 被拒且错误带路径（AC#1）；自环被同一触发器拒绝（AC#2）；递归 CTE 检出、深度上限报错（AC#3）；直连 SQL 绕过 adapter 仍被拒（AC#5）；EBOM 的 A→B 与 MBOM 的 B→A 互不干扰（AC#10）；draft 头下的反向边被拒（AC#17）；结构归属列改写被拒、X 内不成环（AC#14）；跨时段互斥的反向边被拒并附 `union_only` 标记（AC#9）；http/supabase `init()` 显式 fail-fast（AC#6）；导出 PG DDL 片段（advisory 锁 + 隔离级别检查，AC#7）；BOM 实体声明同步即拒绝（AC#12）。

### US4 多级展开与反查（US-510 阶段 A，Priority: P1）

递归 CTE 下钻（路径 = 行发生项 ID 序列，同子装配经两条路径即两个结果节点）与 where-used 反查；预算（深度 / 展开数 / 返回路径数 / 取消），任一触顶停止并标 `truncated`（附触顶项）；截断结果给消费方（数量 / 成本 / 导出）必须拒绝。

**Independent Test**：8 层 BOM 深度上限 5 → 截断原因深度（AC#1）；12 个整机的 where-used 返回 12 条各带路径（AC#2）；路径行在窗口外被滤除（AC#7 下钻部分）；20 串联菱形（1,048,576 条路径）预算截断恰好返回 10,000 条、原因路径数（AC#10 截断部分）；截断结果交给消费方拒绝（AC#11）。

## 需求要点（实现须遵守的合同）

1. **ResolutionContext**：`bom_type` / `org_id` / `asOfDate` 必填（缺 `as_of_date` 拒绝并点名，不读系统时钟）；`alternativeNo` 可选（未给且多备选 → `unresolved` 列候选，不擅自挑）。
2. **发生项可见性**：头 `released` 且 `ecn_in_id` 空（首轮恒空，不加 ecn 过滤、注释写明退化为只看头状态）；区间 `[effective_from, effective_to)` 含 `as_of_date`。
3. **修订选择**：precise 锁版；imprecise 取 `released` 且 `effective_from ≤ as_of_date` 中最大 `effective_from`；「最新」唯一由 AC#10 的部分唯一索引（US-030 阶段 B）保证。
4. **禁止追溯生效**：发布转移触发器（两后端）要求 `effective_from ≥ 发布当日`（存储层 UTC 日期：SQLite `date('now')` / PG `(now() AT TIME ZONE 'UTC')::date`）；指向**开启态** `bom_history_batch` 的发布跳过该检查，其余校验照常。
5. **历史装载**：`bom_history_batch`（batch_no PK、state open/closed、append-only + 仅 open→closed 转移）；`item_revision` / `bom_header` 增 `history_batch_no`（可空，FK）；loadHistory 一次事务：开批次 → 写 draft 行 → 发布转移 → 关批次。
6. **判环作用域与入口**：`(bom_type, org_id)` 物料级并集；入口只有行发生项的 INSERT 与 `child_item_id` UPDATE（`flow_direction` 列不存在，首轮无过滤、无更新入口，列落地时重新生成触发器）；结构归属列已不可改（第 1 步）。
7. **环错误**：`BomCycleError { path: string[] }`；触发器消息前缀 `rxdb:bom_cycle:`（路径以物料 id 串起）；自环走同一触发器（路径 = 单个物料）。
8. **递归 CTE 兜底**：无闭包表时触发器内递归 CTE 深度硬上限；找到父物料 → 环；未找到且触上限 → 报错不静默通过；未找到且耗尽 → 放行。
9. **union_only**：插件 API 层接住 `BomCycleError` 后读路径上各边的发生项区间，无共同生效时点 → 附 `union_only` 标记；直连 SQL 被拒只有错误码与路径（有意的）。
10. **适配器矩阵**：SQLite 家族 + PGlite 触发器（DDL 本仓掌控）；`http` / `supabase` `init()` 显式 fail-fast（无写入期环约束，不静默降级）；`cycleConstraintDdlForRemotePg()` 返回含 `pg_advisory_xact_lock`（按 `(bom_type, org_id)`）与 `transaction_isolation` 检查的 PG DDL 文本，部署与否由使用方负责。
11. **同步拒绝**：BOM 实体声明同步配置（生效策略非 `None`）→ 插件安装期拒绝，点名「BOM 实体首轮不参与同步」（AC#12）。
12. **一致快照**：一次解析 / 展开的全部读取在同一个读事务（`adapter.transaction`）里完成（AC#15）。
13. **预算语义**：递归 CTE 带深度硬上限（SQL 侧唯一硬停）；展开数 / 返回路径数在 TS 按 BFS 序逐行结算、触顶即停止处理并标 `truncated`（附触顶项）；取消经 `AbortSignal` 在行批间检查。AC#10 的 1,048,576 路径结构在 BFS 序下先触路径数（展开数远低于上限），与 AC 的预期原因一致。
14. **manifest**：命中的头、发生项 ID、每条发生项解析所得子件修订（子件无 BOM 头也记）与上下文；`unresolved` 与 `truncated` 不是结果——消费方（US-511 / US-514 / US-521）遇到一律拒绝（本步实现 `assertCompleteResolution` 守卫 + 测试）。

## 交付阶段状态约定

不把三条故事置 Done：US-508 留 AC#12/#16（等 US-515）；US-509 留 AC#4/#8/#13/#15/#16（各自前置）；US-510 只勾阶段 A 的 AC、AC#7/#10 记 ⚠️ 直到阶段 B。

## 约束与门禁

同第 1 步：TS strict / 零 ESLint 警告 / TSDoc；插件包覆盖率 ≥ 80%；api-baseline 更新（新导出：ResolutionContext 等类型、BomCycleError / BomResolutionError / BomSyncUnsupportedError、resolveBom / expandBom / whereUsed / loadHistory）；双后端同断言；affected full 272 任务全绿后提交。
