# Feature Specification: epic-009 首轮切片第 7 步（US-524 B/C + US-514 + US-516 + US-525 阶段 D）

**Feature Branch**: `claude/bom-related-work-77235b`
**Created**: 2026-10-15
**Status**: Draft

**Input**: 首轮切片第 1~6 步已交付（建图 → 视图 → 展开 → 反查 → 数量 → 时间轴，affected 全绿）；本步按 [epic 切片表](../../../requirements/epics/epic-009-bom-domain-model.md#首轮可开工切片) 第 5 步的「演示与真实需求驱动的后续阶段」与 [US-525 阶段 D](../../../requirements/stories/domain/US-525-bom-end-to-end-demo.md) 的引导，交付双图、卷算与门禁。

- [US-524 工艺路线本体](../../../requirements/stories/domain/US-524-routing-master-model.md) — 阶段 B（AC#3/#4）+ C（AC#5）
- [US-514 成本卷算](../../../requirements/stories/domain/US-514-bom-cost-rollup.md) — 全部 AC#1~#19
- [US-516 EBOM↔MBOM 映射与差异对比](../../../requirements/stories/domain/US-516-ebom-mbom-mapping.md) — 全部 AC#1~#22
- [US-525 BOM 端到端 demo](../../../requirements/stories/domain/US-525-bom-end-to-end-demo.md) — 阶段 D（AC#13~#16）

## 用户故事与优先级

### US1 费率、工时与成本属性（US-524 阶段 B/C，Priority: P1）

- `activity_type`（工作中心内的作业类型，`(workCenterId, code)` 唯一）+ `activity_rate`（`(work_center, activity_type, valid_from)` 区间取值；币种、计费单位 `rate_uom`；生效区间排他存储层拒绝，AC#3）。
- `routing_operation` 补工时模型：`setup_time` / `run_time` / `fixed_time` + `time_uom`（共用时间单位；十进制值合同）。
- `work_center` 补成本属性：`overhead_rate`（制费，按 `rate_uom` 计——US-514 的 `overhead(n, L)` 输入；故事未细说来源，取「工作中心按工时计制费」的最小模型，golden 手写据此）。
- 缺费率报错不以 0 兜底（AC#4 由 US-514 卷算验收）。

**Independent Test**：US-524 AC#3/#4/#5（AC#5 的数值断言在 US-514 用例里）。

### US2 成本卷算（US-514 全部 AC，Priority: P1）

- `BomHeader.cost_lot_qty`（卷算必填、缺失拒绝；十进制规范串 + 已发布头字段守卫自动覆盖）。
- `rollupCost(context, root, { currency, batchQty })`：拓扑逆序单遍，四项构成——材料（本层局部需求 × 子件 unit_cost，共享 US-511 第 2~6 步同一实现 + 第 7 步同一换算）、加工（setup/run/fixed 工时按各自基数 + 工序加工量 W_op × 费率）、制费（Σ 工时 × work_center.overhead_rate）、副产抵减（out(b, L) × credit_price）。
- 节点 = 已解析头（修订/类型/组织/备选 + as_of_date/币种/费率日进缓存键）；虚拟件不是节点（穿透计入父件）；环检出报错；`unresolved`/`truncated` 即拒绝（AC#4/#11）。
- 替代组按 usage_probability × equiv_qty 加权（AC#2）；外购叶子价格带 `price_uom` 物料级换算（缺换算拒绝，AC#6）。
- 逐层明细可展开审计；结果按十进制值合同；单一币种不符拒绝（AC#10）；同快照读取。
- 单价/价格的存储：外购叶子价格与副产 credit_price 需要载体——种子 D 层经 `bom_item` 加 `unitPrice`/`priceUom`/`priceCurrency` 与 `creditPrice` 列（外购物料才有价格；无价报缺失，AC#6 的演示面）。

**Independent Test**：US-514 AC#1~#19（数值 oracle 全部手写）。

### US3 EBOM↔MBOM 映射（US-516 全部 AC，Priority: P1）

- `bom_map_scope`（ebom_root_header_id / mbom_root_header_id / org_id）+ `bom_map`（source_line_id ↔ target_line_id 多对多，六态 `relation`；NULL 规则；两侧类型/组织/范围成员资格保存校验；路径级映射 `source_line_path` 与「相邻」判据）。
- 跟进基线：`target_occurrence_id` + 源侧解析依据步骤集合（JSON 列，逐项可比）；缺口查询按步骤集合比对（祖先用量变/修订解析变都点名；AC#16/#17/#18/#20/#21/#22）。
- 覆盖率查询：路径级优先、行级兜底；未覆盖≠removed（AC#6）；路径失效标出（AC#13/#14/#15）。
- 确认跟进把基线整体推进（AC#7/#19）。

**Independent Test**：US-516 AC#1~#22。

### US4 demo 阶段 D（US-525 AC#13~#16，Priority: P1）

- 种子 D 层：EBOM 钣金外壳 → MBOM 拆成板材 + 2 个工序件（`relation = 'split'` 双向可追溯）；整机 5 层 + 工艺路线 + 副产品的成本输入齐全（外购叶子价格、费率、工时、`cost_lot_qty`、credit_price）；其中一个子件故意不给成本。
- 页面：双图并排（EBOM/MBOM 各自展开 + 覆盖率/缺口展示）；成本卷算页（逐层明细可展开 + 缺成本项显示「缺失」而非 0）。
- golden D：材料/加工/制费/抵减/总额逐项手写；e2e 第 14~17 条（AC#13~#16）。

## 约束与门禁

同前几步：TS strict / 零 ESLint 警告 / TSDoc；插件覆盖率 ≥ 80%；api-baseline 更新；双后端同断言；affected full 全绿后提交。US-514 与 US-524 的 AC 关闭以消费方用例绿为准（联合验证，不各自线性排期）。

## 非目标

- 排产/产能；实际成本与差异；多币种与汇率；自动生成 MBOM（转换规则引擎）；工艺路线生成；US-519 扩展属性、US-518 序列/批次、US-521 导入导出、US-523 实例（阶段 E/F）。
