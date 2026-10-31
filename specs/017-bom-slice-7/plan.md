# Implementation Plan: epic-009 首轮切片第 7 步（US-524 B/C + US-514 + US-516 + US-525 阶段 D）

**Branch**: `claude/bom-related-work-77235b` | **Spec**: [spec.md](./spec.md)

## 摘要

交付成本卷算与双图映射：US-524 阶段 B/C 把费率、工时与成本属性落进路线本体；US-514 在「本层局部需求共享 US-511 第 2~6 步同一实现」的前提下做拓扑逆序单遍卷算；US-516 建 EBOM↔MBOM 的第三张表（映射 + 跟进基线 + 缺口/覆盖率查询）；US-525 阶段 D 用种子 D 层 + 手写 golden + 双图/卷算页面验收全部。

## 技术上下文（既有先例）

- 十进制值合同、区间排他（`exclusions`）、发布校验、双后端 DDL 模式均已有；`bom_line_occurrence` 的区间排他（US-030）可直接复刻到 `activity_rate` 的生效区间。
- `explosion.ts` 的 `emitConsumeLine` 已按行计算七步（P→P′→G→G′→G″→D→穿透）——本步把它拆出「本层需求计算」（第 2~6 步，不取整不穿透）为共享函数，explosion 与 cost 共用，成本不重新实现数量逻辑。
- 已解析头与 manifest（US-508）、`resolutionContext`、`unresolved`/`truncated` 标记（US-510/US-512）都已就位，卷算直接消费。
- 第 6 步的写入协议矩阵（已发布头成员）不覆盖 `bom_map`——映射是独立新表，保存校验走 TS 层（无直连 SQL 协议要求）。

## 关键设计决策

### D1. US-524 阶段 B/C（schema）

- `BomActivityType`：`(workCenterId, code)` 唯一；`BomActivityRate`：`(workCenterId, activityTypeId, validFrom)` + `rate`/`currency`/`rateUom`，生效区间排他（exclusions，仿 occurrence_no_overlap，`[validFrom, +∞)` 半开）。
- `BomWorkCenter` 加 `overheadRate`/`overheadCurrency`（nullable）：制费 = Σ 换算到 rate_uom 的工时 × overheadRate——US-514 的 `overhead(n, L)` 输入（故事未细说来源，取「按工时计制费」最小模型，golden 据此手写；spec 注明）。
- `BomRoutingOperation` 加 `setupTime`/`runTime`/`fixedTime`（规范串，默认 '0'）+ `timeUom`（默认 'h'）。
- 缺费率报错（AC#4）与工时基数（AC#5）由 US-514 用例验收。

### D2. US-514 成本卷算

- `BomHeader.costLotQty`（nullable 规范串）：**卷算时**缺失即拒绝（不强制历史头补填；新种子 D 层补齐）。
- `BomItem` 加 `unitPrice`/`priceUom`/`priceCurrency`/`creditPrice`（全 nullable）：外购叶子价格与副产抵减输入；有价即外购、无价且需价即报缺失（AC#6）。
- 引擎 `quantity/cost.ts`：`rollupCost(adapter, context, root, { currency, batchQty? })`。
  - 递归后序 + memo（缓存键 = resolved headerId + asOfDate + currency + rateDate——节点是已解析头，AC#8 不串）；进行中栈检出环（AC#4）。
  - 每节点：解析本层行（reuse `buildHeaderOccurrencesSql` 的窗口与 ECN 过滤）→ 对每条 consume 行取**本层局部需求**（共享函数，含装配/组件损耗与行级换算到子头 base_uom；不取整）→ 子节点 cost 递归 → 材料 = Σ 局部需求 × unit_cost；虚拟件行不递归、在父件内穿透（AC#3）；替代组成员按 usage_probability × equiv_qty 加权（AC#2）；by_product 行按 US-513 产出量 × credit_price 抵减（AC#5/#17）。
  - 加工：头挂路由时逐工序 hours = setup + run × W_op(L) + fixed（time_uom 求和）→ 换 rate_uom → × 费率（按费率日取区间值）；W_op 复用第 5 步的工序加工量逻辑（explosion 的 operationScrapChain 共享）；制费 = Σ hours(rate_uom) × work_center.overheadRate；无路线 = 明细注明「无路线」（US-524 AC#10）。
  - 单一币种：费率/价格/制费币种 ≠ 上下文币种即拒绝点名（AC#10）；`unresolved`/`truncated` 即拒绝（AC#11）；全部读取在同一 transaction 快照。
  - 返回明细树（逐层可展开）+ 各节点 batch_cost/unit_cost；十进制值合同全链路。
- 数值 oracle：AC#1/#7/#9/#12~#19 全部手写 golden（共用 scooter 数据集的扩展 D 层）。

### D3. US-516 EBOM↔MBOM 映射

- 实体：`BomMapScope`（ebomRootHeaderId/mbomRootHeaderId/orgId 唯一）+ `BomMap`（scopeId、sourceLineId?、targetLineId?、relation 六态、sourceLinePath JSON?、targetOccurrenceId?、baselineSteps JSON?）。
- 保存校验（TS 层 `resolve/bom-map.ts` 的 `saveMapping` + 实体 CHECK 兜 NULL 规则）：两侧 `bom_type`/`org_id` 与范围一致；范围成员资格（头链一跳判据，物料级并集图只剪枝）；路径相邻性与末元素 = sourceLineId；AC#9/#10/#12/#13/#15 的拒绝形态。
- 覆盖率：`mappingCoverage(scopeId, context)`——按路径计；路径级映射只覆盖该路径；行级兜底；未覆盖报出（不静默 removed）；失效映射标「路径失效」。
- 跟进基线/缺口：确认跟进时从 manifest 收集「到源行为止的解析步骤集合」（(逻辑行, 发生项, 解析修订)）存 JSON；`mappingGaps(scopeId, context)` 按步骤集合比对（祖先变/解析修订变/行消失均点名；unresolved/truncated 标「无法判定」）——AC#4/#7/#8/#16~#22。
- 目标侧 `targetOccurrenceId` 确认推进。

### D4. demo 阶段 D（US-525 AC#13~#16）

- 种子 D 层 `SCOOTER_DATASET_D`：EBOM 钣金件 `SHEET-ASSY`（→ SHEET）与 MBOM 头（→ SHEET + 工序件 WIP-BEND/WIP-CUT 两个新物料）+ `bom_map_scope`/`bom_map`（split）；成本输入：全部外购叶子 `unitPrice`、HOUSING/PROCESS-01 路线的费率与工时、各头 `costLotQty`、副产 OFFCUT 的 `creditPrice`；**故意缺成本的子件**（如 TRIM 无价格）。
- golden D：整机卷算的材料/加工/制费/抵减/总额手写（按 D1 的制费模型）。
- 页面：双图并排（EBOM/MBOM 各自展开树 + 覆盖率/缺口面板）；卷算面板（整机按钮 + 逐层明细树 + 缺失项显示「缺失」）。
- e2e：AC#13（split 双向追溯 + 未覆盖报告）、AC#14（golden 逐项）、AC#15（缺成本显示缺失）、AC#16（门禁命令绿——CI 侧断言，e2e 用例只验证 tag/结构）。

## 风险与对策

| 风险                                                 | 对策                                                                                    |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 本层需求共享提取改动 explosion 行为                  | 提取为纯函数 + explosion 全量回归（354 用例 + golden 逐位不变）；cost 用例先红          |
| US-516 的基线/缺口逻辑复杂（步骤集合比对）           | 按 AC 分组 TDD：保存校验 → 覆盖率 → 基线 → 缺口，每层独立 spec                          |
| 制费模型故事未细说                                   | spec 已注明取最小模型（按工时 × overheadRate）；golden 手写据此；回写故事时注明         |
| 种子 D 层给 A/B/C 层头补 costLotQty/价格（改既有行） | 经 loadHistory overlay 通道（第 6 步已建）；golden A/B/C 不受影响（成本列不进数量展开） |

## 分阶段任务

见 [tasks.md](./tasks.md)。顺序：T001 文档 → T002 US-524 B/C schema → T003 本层需求共享提取 → T004 卷算引擎 → T005 US-516 实体与保存校验 → T006 覆盖率 → T007 基线/缺口 → T008 种子 D + golden D → T009 demo 页面 + e2e → T010~T012 门禁与回写。
