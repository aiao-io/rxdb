# Tasks: epic-009 首轮切片第 7 步（US-524 B/C + US-514 + US-516 + US-525 阶段 D）

## Phase 0: 文档

- [x] T001 在 specs/017-bom-slice-7/ 完成 spec/plan/tasks（本文件）

## Phase 1: 费率、工时与成本属性（US-524 阶段 B/C）

- [x] T002 `BomActivityType` + `BomActivityRate`（生效区间排他）+ `BomWorkCenter` 补 overheadRate/Currency + `BomRoutingOperation` 补 setup/run/fixed/timeUom；`bom-routing.spec.ts` 红→绿（AC#3 存储面）
- [x] T003 费率按日期取值 + 缺费率报错 + 工时基数（US-524 AC#3/#4/#5 的消费面断言随 T004/T005 的卷算用例）

## Phase 2: 成本卷算（US-514）

- [x] T004 `BomHeader.costLotQty` + `BomItem` 价格列（unitPrice/priceUom/priceCurrency/creditPrice）；schema 测试红→绿
- [x] T005 本层需求共享提取：explosion 的第 2~6 步拆成纯函数（explosion 全量回归逐位不变）
- [x] T006 `quantity/cost.ts` 卷算引擎：递归后序 memo + 环检出 + 材料/加工/制费/抵减 + 明细树；`bom-cost.spec.ts` 红→绿（US-514 AC#1/#3/#4/#6/#7/#9/#10/#12/#13/#14/#17 数值 oracle）
- [x] T007 替代组加权（AC#2）、副产抵减（AC#5）、加工工时与 W_op（AC#15/#16/#18/#19）、precise/imprecise 不串（AC#8）、unresolved/truncated 拒绝（AC#11）；`bom-cost.spec.ts` 红→绿

## Phase 3: EBOM↔MBOM 映射（US-516）

- [x] T008 `BomMapScope` + `BomMap` 实体 + NULL 规则 CHECK；`bom-map.spec.ts` 建文件（AC#2/#3/#9 存储面红→绿）
- [x] T009 保存校验 TS 层：两侧类型/组织、范围成员资格（头链一跳）、路径相邻与末元素、AC#15 的修订边界；`bom-map.spec.ts` 红→绿（AC#1/#10/#11/#12/#13/#15）
- [x] T010 覆盖率查询：路径级优先行级兜底、未覆盖报出、失效映射标记；`bom-map.spec.ts` 红→绿（AC#5/#6/#13/#14）
- [x] T011 跟进基线与缺口查询：解析步骤集合基线、确认跟进整体推进、缺口按步骤点名（祖先变/解析修订变/unresolved/truncated）；`bom-map.spec.ts` 红→绿（AC#4/#7/#8/#16~#22）

## Phase 4: demo 阶段 D（US-525 AC#13~#16）

- [x] T012 种子 D 层（EBOM 钣金 → MBOM 拆分映射；成本输入齐全；故意缺成本子件）+ golden D 手写；`bom-scooter-d.spec.ts` 红→绿
- [x] T013 demo 双图并排 + 覆盖率/缺口面板 + 卷算面板（逐层明细 + 缺失显示）；e2e 第 14~17 条（AC#13/#14/#15/#16）

## Phase 5: 门禁与回写

- [x] T014 插件收尾（api-baseline、lint/typecheck/test、覆盖率 ≥ 80%）
- [x] T015 affected full + 修复
- [x] T016 故事回写（US-524 B/C、US-514 全量、US-516 全量、US-525 阶段 D）+ epic/status-overview/roadmap 第 7 步记录 + specs/017 quickstart
- [x] T017 提交

## Dependencies and implementation strategy

T002 ∥ T004（schema 独立）；T005 → T006（共享函数先行）；T006/T007 依赖 T002/T004/T005；T008 ∥ T006；T009~T011 依赖 T008；T012 依赖 T002~T011；T013 依赖 T012；T014-T017 串行收尾。每任务 TDD：先红测试后实现。
