# Tasks: epic-009 首轮切片第 4 步

## Phase 0: 文档

- [x] T001 在 specs/014-bom-slice-4/ 完成 spec/plan/tasks（本文件）

## Phase 1: 位号子表（US-507 阶段 C）

- [x] T002 `BomLineDesignator` 实体 + `designator_managed` 列 + 结构列/已发布协议/发布计数触发器（两后端）；loadHistory 扩展 `designators` 装载；`bom-designator.spec.ts` 红→绿（AC#4/#5/#12 + AC#10/#13 位号部分）

## Phase 2: 七步中间值暴露

- [x] T003 `explodeBom` 需求行/穿透节点带 `steps`（P/P'/G/G'/D/phantom 判定与来源）；现有数量测试保持绿 + steps 断言补测

## Phase 3: 种子与 golden（US-525 阶段 A 数据底座）

- [x] T004 `scooter-dataset.ts` 确定性种子（确定性 ID/时间戳/批次号，SC-100 全覆盖 AC 形状）+ `loadScooterDataset`；`bom-scooter.spec.ts` 两遍装载逐字节相同红→绿（AC#1 vitest 面）
- [x] T005 `scooter-golden.ts` 手写 golden + `explodeBom` 对账测试红→绿（共享输入、独立 oracle）

## Phase 4: demo 与 e2e（US-525 阶段 A 应用）

- [x] T006 `apps/dev-rxdb-bom`（Angular）：展开树 + 算式面板（七步 + 第 5 步「工序损耗未交付」）+ 评估日输入 + 直连写入按钮 + reset/seed target；本地 serve 验证
- [x] T007 `apps/dev-rxdb-bom-e2e`（playwright）：AC#1~#6 各一条用例 + 既有库重开用例

## Phase 5: 门禁与回写

- [x] T008 插件与两 app 收尾（api-baseline、lint/typecheck/test、覆盖率 ≥ 80%、demo tag）
- [x] T009 affected full（含新 app）+ 修复
- [x] T010 故事回写（US-507 阶段 C 勾选 + US-525 阶段 A 勾选与关闭记录；epic/roadmap/status-overview 第 4 步记录）+ specs/014 quickstart
- [x] T011 提交

## Dependencies and implementation strategy

T001 → T002（位号）∥ T003（steps）；T004/T005 依赖 T002/T003；T006 依赖 T004/T005；T007 依赖 T006；T008-T011 串行收尾。每任务 TDD：先红测试后实现。
