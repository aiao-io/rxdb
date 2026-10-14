# Feature Specification: epic-009 首轮切片第 3 步（US-511 阶段 A / C + B1）

**Feature Branch**: `claude/bom-related-work-77235b`
**Created**: 2026-10-14
**Status**: Draft

**Input**: 第 1、2 步已交付（US-030 A/B/C、US-507 A/B、US-508 首轮 AC、US-509 首轮 AC、US-510 阶段 A，affected 272/272 全绿）；按 [epic 切片表](../../../requirements/epics/epic-009-bom-domain-model.md#首轮可开工切片) 推进第 3 步。

- [US-511 展开数量正确性](../../../requirements/stories/domain/US-511-bom-quantity-semantics.md) — 阶段 A / C / B1（不含 AC#1 / #13，工序损耗随 B2）

## 用户故事与优先级

### US1 用量语义与十进制 kernel（US-511 阶段 A，Priority: P1）

- 实体扩展：`bom_header` 加 `base_uom` / `base_qty` / `assembly_scrap` / `assembly_scrap_convention`；`bom_line_occurrence` 加 `uom` / `qty_formula` / `formula_grammar_version` / `is_fixed_qty` / `tier_group_no` / `lotsize_from` / `lotsize_to` / `component_scrap` / `component_scrap_convention` / `component_scrap_fixed` / `uom_conversion`；`bom_item` 加 `stock_uom` / `uom_decimals` / `uom_conversion`。
- 单行 CHECK（US-030 阶段 A 落点）：`qty` 与 `qty_formula` 恰好一项（AC#7）；阶梯三字段同空或 `tier_group_no` 与 `lotsize_from` 同非空（AC#21）。
- 十进制 kernel（`decimal.ts`，纯 BigInt 定点）：34 位有效数字、中间量 half-even、需求行按小数位向上取整一次；加 / 减 / 乘 / 除 / 比较 / ceil。
- 公式求值器（`formula.ts`）：受限语法（十进制字面量、`+ − × ÷`、括号、命名参数），`formula_grammar_version` 持久化；缺参 / 语法错 / 除零 / 非有限 / 负值 → 整次拒绝点名路径与参数（AC#14）。
- 单位换算（`uom.ts`）：同量纲标准系数（g→kg 等 metric 前缀）；跨量纲只经行级 / 物料级显式换算率；缺换算率拒绝点名路径，不默认 1（AC#5 / #10）。

**Independent Test**：定量行父件 ×10 用量不变（AC#2）；公式改参数结果随变、版本可审计（AC#3）；七步 golden 位级一致（AC#20 / #22 展开段）；行 UoM=米 → 千克按换算率转库存单位（AC#5）；缺换算率 / 量纲不兼容拒绝（AC#10）；阶梯按损耗前 P 恰好命中一行、普通行恒计入（AC#6）；P 落在组内所有区间外整次拒绝（AC#19）；定量经两条路径各计一次（AC#15）；需求 10.0001 件小数位 0 → 11（AC#16）；非虚拟子装配取整值下传（AC#17）；15 位 / 34 位 golden 逐字回读与手算一致。

### US2 损耗（US-511 阶段 B1，Priority: P1）

- 装配损耗在头、组件损耗在行发生项，各自 `scrap_convention`（加成制 `×(1+s)` / 良率制 `÷(1−s)`）；固定损耗按行 UoM 计、不再被良率放大。
- 良率制 `s = 1` 保存即拒（存储层逐字节谓词 `s = '0' OR substr(s, 1, 2) = '0.'`，AC#12）。

**Independent Test**：组件需求 100、损耗 20% → 加成 120 / 良率 125（AC#11）；良率制 `s=1` 保存拒绝（AC#12）；AC#20 全流程 golden `216.4948453608247422680412371134021` → 需求行 217。

### US3 虚拟件穿透（US-511 阶段 C，Priority: P1）

- `bom_line_occurrence.phantom_override`（可空布尔）覆盖 `item_revision.default_phantom`（COALESCE）；phantom 为真：换算到子 BOM 头基准 UoM 后作为 P 进入第 1 步，不产出需求行、不舍入；phantom 为假：按库存单位小数位向上取整产出需求行。
- 虚拟件在当前上下文无已发布头 → 整次拒绝（AC#18）；非虚拟件无头按叶子产出需求行。

**Independent Test**：同物料在不同装配下 phantom 与否（AC#4）；1000 g phantom → 1 kg 基准 → 恰好 2 件（AC#8）；两级 phantom + 行级换算覆盖的 golden（AC#9）；phantom 无头整次拒绝（AC#18）。

### US4 阶梯切片发布校验（US-511 阶段 A 的存储段，Priority: P1）

- 发布转移校验（两后端）：同 `(header, tier_group_no)` 组内两条阶梯行，生效域与批量区间**同时**相交才拒绝，点名组号、发生项、日期段与批量段（AC#24）；批量比较收窄域：15 位有效数字、整数 / 小数部分各 ≤ 15 位（保存期逐字节触发器拒绝，AC#25 / #26），SQLite `CAST AS REAL` 与 PG `::numeric` 结论一致。

**Independent Test**：同档跨期改量并存通过、相交拒绝（AC#24）；15 位相邻边界两后端一致判相邻；16 位有效数字与幅值越界（`1e-400`、`1` 后 16 个 0）保存即拒（AC#25 / #26）。

## 功能需求

1. **七步公式顺序不可颠倒**（故事技术笔记）：P（父计划量，单位 = 头基准 UoM）→ P'（装配损耗）→ G（组件毛需求：`is_fixed ? q : q × P' / base_qty`，单位 = 行 UoM；阶梯按损耗前 P 选行）→ G'（组件损耗 + 固定损耗）→ （工序损耗，B2 前无此步）→ D（行 UoM → 子件库存 UoM）→ phantom 穿透 / 产出需求行。
2. **单位换算在穿透之前**：phantom 的 D 先换算到子件库存 UoM、再换算到头基准 UoM 作为 P。
3. **精度合同**：内部 34 位有效数字、中间量 half-even；只在非虚拟需求行上按库存单位小数位**向上取整**一次；phantom 中间量不舍入。工作精度与舍入模式进 manifest 算法版本。
4. **truncated / unresolved 拒绝计算**：遇到 US-510 的 `truncated` 或 US-508 的 `unresolved` 结构，数量展开拒绝（复用 `assertCompleteResolution` 口径）。
5. **manifest 追加**：本次用到的换算率、公式参数、公式语法版本与算法版本。
6. **API 形态**：`explodeBom(adapter, context, target, { plannedQty: { value, uom }, params?, budgets?, signal? })` → `{ manifest, requirementLines, truncated }`；需求行 `{ path, itemId, revisionId, qty, uom, rounded }`。复用 `expandBom` 的 BFS 骨架与预算结算，节点携数量。
7. **不扩核心 PropertyType**：十进制字段全部 string + 插件局部值对象。

## 约束与门禁

同前两步：TS strict / 零 ESLint 警告 / TSDoc；插件包覆盖率 ≥ 80%；api-baseline 更新（新导出：`explodeBom`、十进制 kernel、公式求值器、单位换算、需求行类型等）；双后端同断言（含直连 SQL 拒绝）；affected full 272 任务全绿后提交。golden 按「同一精度、同一顺序手算」位级对账（AC#20 的 34 位 golden 逐字断言）。

## 非目标

- 工序损耗与路线（US-520 / US-524，B2）；替代组分摊（US-512）；成本（US-514）；非 consume 行数量语义（US-513）；通用表达式求值；`flow_direction` 过滤（列不存在，全 consume）。
