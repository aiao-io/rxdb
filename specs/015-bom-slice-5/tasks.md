# Tasks: epic-009 首轮切片第 5 步

## Phase 0: 文档

- [x] T001 在 specs/015-bom-slice-5/ 完成 spec/plan/tasks（本文件）

## Phase 1: 多输出物料流（US-513 阶段 A）

- [x] T002 `flow_direction` 列（三值 enum）+ 判环/可达性只认 consume（US-509 AC#4）+ by_product 子件≠头父件与 consume 负用量存储层拒绝；`bom-flow.spec.ts` 红→绿（AC#1/#3/#4/#5/#9/#11 存储面）
- [x] T003 展开反向流：`by_product` 产出量（按 P' 缩放 / 按批）与 `scrap_out` 产出量进结果不进需求行；「无投入」拒绝；自回流分列；`bom-flow.spec.ts` 红→绿（AC#3/#4/#6/#8/#10 展开面）

## Phase 2: 替代组（US-512 非 ECN）

- [x] T004 `bom_substitute_group` 实体 + 发生项成员列（role/priority/probability/equiv_qty）+ 概率 9 位小数域触发器 + 单行 CHECK（AC#10）+ 组合外键（AC#11 ②）；`bom-substitute.spec.ts` 红→绿（AC#10/#11 ②/#13/#15 ① 存储面）
- [x] T005 发布转移切片聚合校验（恰好一个 primary / priority 不并列 / proportional 合计恒 1，定点整数比较）；`bom-substitute.spec.ts` 红→绿（AC#5/#7/#11 ①/#12/#15 ②③）
- [x] T006 展开分流（proportional 分摊 golden、priority 择优与不足拒绝、manual unresolved）+ `ResolutionContext` 扩展；`bom-substitute.spec.ts` 红→绿（AC#1/#2/#3/#4/#8）

## Phase 3: 路线本体与挂接（US-524 A/D + US-520 非 ECN）

- [x] T007 `work_center` / `routing` / `routing_operation` 实体 + BOM 头 `routing_id` + 工序损耗列（D）+ 行发生项 `operation_seq` 与分摊比例列（9 位小数域）；`bom-routing.spec.ts` 红→绿（AC#1/#2/#6/#7/#8/#10/#11 存储面 + US-520 分摊合计校验）
- [x] T008 展开第 5 步工序损耗：投料工序（含）至末工序累乘；`steps` 加第 5 步；`bom-routing.spec.ts` 红→绿（US-511 AC#1/#13 golden；无路线行不变）

## Phase 4: demo 阶段 B（US-525 AC#7~#9）

- [x] T009 种子 B 层（替代组 / 外壳下料 / 路线 10→20→30 + 分摊 6:4）+ golden B 层（A 层路径值逐位不变）；对账测试红→绿
- [x] T010 面板第 5 步（工序损耗与分摊展示）+ e2e 三条 AC 用例

## Phase 5: 门禁与回写

- [x] T011 插件收尾（api-baseline、lint/typecheck/test、覆盖率 ≥ 80%）
- [x] T012 affected full + 修复
- [x] T013 故事回写（US-513 阶段 A、US-512 非 ECN AC、US-524 A/D、US-520 非 ECN、US-511 B2、US-525 阶段 B、US-509 AC#4）+ epic/roadmap/status-overview 第 5 步记录 + specs/015 quickstart
- [x] T014 提交

## Dependencies and implementation strategy

T001 → T002/T003（flow_direction，US-509 AC#4 同批）；T004/T005/T006（替代组，依赖发布转移校验机制）；T007（路线实体，独立）∥ T004；T008 依赖 T003/T007；T009/T010 依赖 T004~T008；T011-T014 串行收尾。每任务 TDD：先红测试后实现。
