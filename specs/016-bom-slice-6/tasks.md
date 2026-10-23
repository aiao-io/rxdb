# Tasks: epic-009 首轮切片第 6 步（US-515 + US-525 阶段 C）

## Phase 0: 文档

- [x] T001 在 specs/016-bom-slice-6/ 完成 spec/plan/tasks（本文件）

## Phase 1: schema 与保存期协议

- [x] T002 `BomEcn` 实体（ecnNo unique / state / effectiveDate 必填 / reason / historyBatchNo）+ `BOM_ENTITIES` 12 个；`ecnInId`/`ecnOutId` 列 string→uuid + FK→ecn；`BomSubstituteGroup.ecnInId` 补列；api-baseline 首跑更新（自更新机制）；`bom-ecn.spec.ts` 建文件（AC#8 追溯拒绝、实体 CRUD 红→绿）
- [x] T003 保存期派生与写入协议：发生项 `ecn_in` 派生 `effective_from`（AC#5）、截止标记收窄与 AC#15/#16、清标记恢复；矩阵放行（行/发生项/位号/组/成员/分摊六处，AC#13/#14/#22、US-507 AC#10、AC#26 ①）；`bom-ecn.spec.ts` 红→绿（AC#5/#13/#14/#15/#16/#17/#18/#19/#22/#26①、US-507 AC#10）

## Phase 2: 可见性与状态机

- [x] T004 解析可见性：`bom-sql.ts` 四查询加引入侧排除 + 截止侧采信（US-508 AC#12/#16 拨钟断言）；`bom-ecn-resolution.spec.ts` 红→绿
- [x] T005 ECN 状态机存储层：发布（追溯拒绝 + 历史批次跳过）、改期（未生效 + AC#20 后继 ECN + 级联先收窄后放宽）、取消（未生效 + AC#12/#26③ + 级联删除/清标记）、非法转移拒绝；先探针验证 PGlite 触发器内 DML 后实现两后端；`bom-ecn.spec.ts` 红→绿（AC#3/#4/#6/#7/#8/#11/#12/#20/#21/#26②③、AC#10 并入）
- [x] T006 投影切片校验：受影响头投影 + 检查点切片聚合（位号计数 AC#9；替代组 primary/priority/proportional AC#23/#24/#25 + US-512#6/#9/#14；阶梯；分摊合计）三转换共用一个入口；`bom-ecn-slice.spec.ts` 红→绿

## Phase 3: 查询、历史装载与 demo

- [x] T007 `resolve/ecn.ts`：`ecnImpact`（AC#1 整机与路径）+ `ecnDiff`（AC#2 四类差异）+ 插件门面挂载；`bom-ecn-impact.spec.ts` 红→绿
- [x] T008 `loadHistory` 扩 `ecns` 与行/发生项/组 `ecnInId/ecnOutId`（C 层种子通道）；`bom-history.spec.ts` 红→绿
- [x] T009 种子 C 层 `SCOOTER_DATASET_C`（ECN-2026-014 改 3 张 BOM 5 行 + 一张已生效 ECN）+ golden C（受影响路径两段值，不受影响路径逐位不变）；对账测试红→绿
- [x] T010 demo ECN 面板（列表/影响面/差异/新建发布取消）+ e2e 第 11~13 条（US-525 AC#10/#11/#12）

## Phase 4: 门禁与回写

- [x] T011 插件收尾（api-baseline、lint/typecheck/test、覆盖率 ≥ 80%）
- [x] T012 affected full + 修复
- [x] T013 故事回写（US-515 全部 AC、US-508 AC#12/#16、US-512 AC#6/#9/#14、US-507 AC#10、US-525 阶段 C）+ epic/roadmap/status-overview 第 6 步记录 + specs/016 quickstart
- [x] T014 提交

## Dependencies and implementation strategy

T002 → T003（协议引用 ecn 表）；T004 ∥ T003（可见性只读 ecn 表）；T005/T006 依赖 T002~T004（级联 + 投影校验）；T007 依赖 T004（复用解析 SQL）；T008 ∥ T007；T009 依赖 T008；T010 依赖 T005~T009；T011-T014 串行收尾。每任务 TDD：先红测试后实现。
