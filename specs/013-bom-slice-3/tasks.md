# Tasks: epic-009 首轮切片第 3 步

## Phase 0: 文档

- [x] T001 在 specs/013-bom-slice-3/ 完成 spec/plan/tasks（本文件）

## Phase 1: 十进制 kernel 与公式（US-511 阶段 A 的计算底座）

- [x] T002 `quantity/decimal.ts`：BigInt 定点四则 / 比较 / 34 位 half-even / `ceilTo`；`decimal.spec.ts` 红→绿（含 34 位 golden 与 half-even 边界）
- [x] T003 `quantity/formula.ts`：受限语法求值 + `FORMULA_GRAMMAR_VERSION`；`formula.spec.ts` 红→绿（AC#3/#14 的语法面：缺参 / 语法错 / 除零 / 负值点名）

## Phase 2: 实体与存储约束（阶段 A/B1/C 的 schema）

- [x] T004 实体扩展（头 / 行发生项 / 物料的 UoM、损耗、阶梯、公式、phantom_override 列）+ 单行 CHECK（AC#7 / #21）+ `BomQuantityError`；`bom-quantity-schema.spec.ts` 红→绿
- [x] T005 存储触发器扩展：良率制损耗域（AC#12）+ 阶梯边界 15 位域（AC#25/#26，逐字节谓词，两后端保存期一致拒绝）；直连 SQL 断言红→绿

## Phase 3: 单位换算（阶段 A）

- [x] T006 `quantity/uom.ts`：metric 前缀标准系数 + 行级/物料级显式换算率链（1 行单位 = N 库存单位）；`uom.spec.ts` 红→绿（AC#5/#10 的换算面，缺换算率点名）

## Phase 4: 七步展开（阶段 A + B1 + C 的计算）

- [x] T007 `quantity/explosion.ts`：`explodeBom`（BFS 复用 + 节点携数量）；七步公式；需求行产出与 `ceilTo`；`truncated`/`unresolved` 拒绝；manifest 追加；`bom-explosion.spec.ts` 红→绿（AC#20 golden / #2 / #15 / #16 / #17 / #22 展开段）
- [x] T008 阶梯选行（AC#6 按损耗前 P 命中一行、普通行恒计入；AC#19 越界整次拒绝）+ `bom-tier.spec.ts` 红→绿
- [x] T009 损耗七步接入（AC#11 加成 120 / 良率 125）+ `bom-scrap.spec.ts` 红→绿
- [x] T010 phantom 穿透（AC#4 行级覆盖修订级、#8 1000g→1kg→2 件、#9 两级 phantom + 行级覆盖 golden、#18 无头拒绝）+ `bom-phantom.spec.ts` 红→绿

## Phase 5: 阶梯切片发布校验（阶段 A 存储段）

- [x] T011 头发布转移触发器：同组阶梯行生效域 × 批量区间同时相交拒绝（AC#24）；`bom-tier.spec.ts` 补直连断言红→绿

## Phase 6: 门禁与回写

- [x] T012 插件接线收尾（rxdb.bom 门面 explodeBom、api-baseline 更新、lint/typecheck/test、覆盖率 ≥ 80%）
- [x] T013 affected full（272 任务）+ 修复
- [x] T014 故事回写（US-511 阶段 A/C/B1 勾选 + 关闭记录；epic/roadmap/status-overview 第 3 步记录）+ specs/013 quickstart
- [ ] T015 提交

## Dependencies and implementation strategy

T001 → T002/T003（kernel 先行，纯单测）∥ T004/T005（schema 存储约束）；T006 依赖 T002；T007 依赖 T002/T003/T004/T006；T008/T009/T010 依赖 T007；T011 依赖 T004；T012-T015 串行收尾。每任务 TDD：先红测试后实现。
