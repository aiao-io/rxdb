# Tasks: epic-009 首轮切片第 2 步

## Phase 0: 文档

- [x] T001 在 specs/012-bom-slice-2/ 完成 spec/plan/tasks（本文件）

## Phase 1: US1/US2 视图解析与历史装载（US-508 首轮）

独立验收：跨 org 互不串、同日边界只取新行、草稿过滤、修订按时点选择、缺日期拒绝、拨钟不变、追溯发布被拒、部分唯一、unresolved、manifest 精确、loadHistory 确定性、批次 append-only、快照一致。

- [x] T002 [US1] `ResolutionContext` / `ResolutionResult` / manifest 类型 + `BomResolutionError`；`resolveBom` 骨架（事务内头/发生项/子件修订解析 SQL）；双后端测试 AC#1/#3~#8/#11/#17 红→绿
- [x] T003 [US1] 追溯发布检查（item_revision 发布触发器两后端：`effective_from >= 存储层 UTC 当日`）+ AC#9 测试红→绿
- [x] T004 [US1] `BomItemRevision` 部分唯一索引 `released_effective_from`（US-030 阶段 B）+ AC#10 测试红→绿
- [x] T005 [US2] `BomHistoryBatch` 实体 + `history_batch_no` 列（修订/头）+ append-only 与 open→closed 触发器；`loadHistory(batch)` 实现；测试 AC#13/#14/#18 红→绿
- [x] T006 [US1] AC#15 一致快照（wa-sqlite persistent 双实例 + pglite idb 双实例交错写入）红→绿

## Phase 2: US3 判环（US-509 首轮）

独立验收：真环+路径拒绝、自环拒绝、深度上限报错、直连 SQL 拒绝、跨类型放行、草稿头反向边拒绝、union_only 标记、http/supabase fail-fast、DDL 导出、同步拒绝。

- [x] T007 [US3] 双后端判环触发器（并集边子查询 + 递归 CTE + 深度硬上限 + 三态判定）；`BomCycleError`（path）+ `rxdb:bom_cycle:` 归一；测试 AC#1/#2/#3/#5/#10/#14/#17 红→绿
- [x] T008 [US3] `union_only` 标记（插件 API 层读路径边区间判共同生效时点）+ AC#9 测试红→绿
- [x] T009 [US3] 适配器矩阵：http/supabase `init()` fail-fast（AC#6）；`cycleConstraintDdlForRemotePg()`（AC#7）；同步配置拒绝 `BomSyncUnsupportedError`（AC#12）；测试红→绿

## Phase 3: US4 展开与反查（US-510 阶段 A）

独立验收：深度截断、12 整机反查、窗口滤除、菱形 10,000 截断（原因路径数）、截断结果消费方拒绝。

- [x] T010 [US4] `expandBom` 递归 CTE（下钻，路径=发生项 id 序列）+ 预算结算 + `truncated`；`whereUsed` 反查 CTE；测试 AC#1/#2/#7 红→绿
- [x] T011 [US4] 菱形 1M 路径基准断言（恰好 10,000 条、原因路径数）+ `assertCompleteResolution` 守卫（AC#10/#11）红→绿

## Phase 4: 门禁与回写

- [x] T012 插件接线收尾（rxdb.bom 门面方法、DDL 下发追加判环/批次触发器、api-baseline 更新、lint/typecheck/test、覆盖率 ≥ 80%）
- [x] T013 affected full（272 任务）+ 修复
- [x] T014 故事回写（US-508 / US-509 / US-510 首轮 AC 勾选 + 技术笔记；epic/roadmap/status-overview 第 2 步记录）+ specs/012 quickstart
- [x] T015 提交

## Dependencies and implementation strategy

T001 → T002（US1）→ T003/T004（US1 触发器与索引）与 T005（US2）可并行；T006 依赖 T002；US3 依赖 US2 的触发器扩展点（同文件）；US4 依赖 US1 的解析 SQL 复用。每任务 TDD：先红测试后实现。
