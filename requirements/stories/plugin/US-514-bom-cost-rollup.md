---
id: US-514
title: 成本卷算
status: Backlog
priority: Low
epic: epic-009-bom-domain-model
created: 2026-09-22
updated: 2026-10-01
tags: [plugin, bom, calculation, cost]
---

# 用户故事：成本卷算

## 作为/我想要/以便

**作为** 成本会计
**我想要** 按拓扑逆序一遍算出材料 + 加工 + 制费 − 副产抵减
**以便** 标准成本可复算、可逐层追溯

## 范围边界

### In Scope

- 自底向上按**拓扑逆序**单遍卷算
- 四项构成：材料（`consume` 行 × 子件单件成本）、加工（工序工时 × 费率）、制费、副产抵减
- **成本有量纲**：`batch_cost(n, L)` 是节点 n 生产 L 个基准单位的整批成本；`unit_cost(n) = batch_cost(n, L_n) / L_n`，
  `L_n` 是 n 的 BOM 头上的标准成本批量 `cost_lot_qty`（卷算必填，缺失即拒绝）；父件只乘子件的 `unit_cost`，
  不乘根级累计展开量
- **成本节点 = 已解析的头**：拓扑节点与缓存键是「已解析的 `bom_header`（隐含修订、类型、组织、备选）+ 影响计算的上下文
  （`as_of_date`、币种、费率日）」，不是裸 `item_id`
- 加工费按工序的 `time_basis`（每批 / 每件 / 固定，来自 [US-524](US-524-routing-master-model.md)）折算工时，
  换到费率的计费单位后乘费率；`setup` 与 `run` 不直接相加
- 单一币种：一次卷算只接受上下文币种的费率与价格，币种不符即拒绝，不做汇率换算
- 逐层成本明细可展开审计；结果在 [US-508](US-508-bom-view-resolution.md) 的 manifest 上追加用到的费率、价格与 `cost_lot_qty`
- 环存在时报错而非死循环；遇 `truncated` / `unresolved` 结构即拒绝

### Out of Scope

- 费率与作业类型的主数据维护（→ [US-524](US-524-routing-master-model.md)）
- 实际成本与差异分析（属事务域）
- 副产品成本分配方法学的选择（只消费给定的 `credit_price`）
- 多币种与汇率

## 验收标准

| #   | 前置条件                                                                                                           | 操作                                               | 预期结果                                                           | 状态 |
| --- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------- | ------------------------------------------------------------------ | ---- |
| 1   | 5 层 BOM + 工艺路线                                                                                                | 卷算                                               | 叶→根单遍完成，逐层成本可展开审计                                  | ⬜   |
| 2   | 替代组 strategy=proportional                                                                                       | 卷算                                               | 按 `usage_probability` 与 `equiv_qty` 加权，明细逐成员可对账       | ⬜   |
| 3   | 含虚拟件                                                                                                           | 卷算                                               | 虚拟件不是成本节点，其子件需求按 US-511 穿透后计入父件材料         | ⬜   |
| 4   | 人为构造环（绕过 US-509）                                                                                          | 卷算                                               | 检出并报错，不死循环、不返回部分结果                               | ⬜   |
| 5   | 含副产品                                                                                                           | 卷算                                               | 按 `credit_price` 抵减，明细中该项可见                             | ⬜   |
| 6   | 某子件缺成本或缺费率                                                                                               | 卷算                                               | 明确报缺失项，**不以 0 兜底**                                      | ⬜   |
| 7   | A 用 2 B，B 用 3 C，C 单价 1；`cost_lot_qty` 均为 1，无损耗无加工                                                  | 卷算 A                                             | A 材料成本恰为 6（不是把 C 的根级累计 6 当 B 的局部用量得出的 12） | ⬜   |
| 8   | 父件同时用子件 X 的 D 版（precise）与 E 版（imprecise→E），两版 BOM 成本不同                                       | 卷算                                               | D、E 两个节点各算各的，缓存不串                                    | ⬜   |
| 9   | 根件含定量用量行与 setup 工时                                                                                      | 求 `batch_cost(root, 1)` 与 `batch_cost(root, 10)` | 变动材料与 run 工时按 10 倍增长；定量用量与 setup 不变             | ⬜   |
| 10  | 费率币种与上下文币种不同                                                                                           | 卷算                                               | 拒绝，错误点名费率与币种                                           | ⬜   |
| 11  | 结构标任一来源的 `unresolved`（US-508 备选未定、US-512 manual 替代未选、US-518 序列 / 批次候选未定）或 `truncated` | 卷算                                               | 拒绝，不按候选集任意一个计算                                       | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 技术笔记

```
batch_cost(n, L) = Σ_{consume 发生项 l}  req(l, L) × unit_cost(child(l))                    -- 材料
                 + Σ_{工序 op}           hours(op, L) × rate(op.activity, op.work_center, ctx) -- 加工
                 + overhead(n, L)                                                            -- 制费
                 − Σ_{by_product b}      out(b, L) × credit_price(b)                         -- 副产抵减

unit_cost(n)     = batch_cost(n, L_n) / L_n          L_n = n 的 cost_lot_qty
req(l, L)        = US-511 第 2～6 步、以 P = L 求出的**本层**需求（子件库存单位）；遇 phantom 则在本节点内继续穿透
hours(op, L)     = 按 time_basis：每批 → setup；每件 → run × L；固定 → fixed；换到费率计费单位
```

**为什么父件乘 `unit_cost` 而不是乘展开量。** 旧公式写 `Σ qty_eff × cost(child)`、`qty_eff` 取 US-511 展开结果，
但展开结果是**根级累计绝对需求**，`cost(child)` 又已经包含了子件以下的全部消耗。反例：A 用 2 B、B 用 3 C、C 单价 1，
正确材料成本 6；根级展开给出 C 总需求 6，若把它当 B 的局部用量，B 成本得 6、再乘 A→B 的 2 得 12，
**双计数**（Decimal 探针复现）。所以成本 kernel 只用**本层局部系数** `req(l, L)`，它与 US-511 共享第 2～6 步的同一份实现——
卷算不重新实现数量逻辑，否则两处会漂——但不吃全局展开结果。

**为什么要 `cost_lot_qty`。** 定量用量、固定损耗、setup 工时都是「每批一次」的量，单件成本取决于按多大的批算。
不定基准批量，「单件成本」就不是一个数而是一个函数；把固定费用当线性系数摊到一件上，就默默选了「批量 = 1」。
所以每个头显式声明标准成本批量，子件的 `unit_cost` 在它自己的 `cost_lot_qty` 上求；根件可另按任意批量求 `batch_cost`（AC#9）。

**节点只算一次，但「节点」不是物料。** 同一物料的 D / E 修订、不同组织或备选，BOM 不同、成本也不同；
用 `item_id` 做缓存键会让先算的那个覆盖后算的（AC#8）。虚拟件不是成本节点：它的子件需求在父件节点内穿透计入，
于是行级 phantom 覆盖不会让同一个虚拟件在不同父件下共享一个错误的缓存值。

加工项的 `setup` / `run` / `rate` 三个量一个都不在 BOM 侧，它们来自
[US-524](US-524-routing-master-model.md) 的路线本体；
[US-520](US-520-bom-routing-operation.md) 只提供「哪一行归哪道工序」的挂接。
两条都是本故事的前置，缺任一条则加工项无从计算。费率按上下文的费率日取值（US-524 的费率生效区间），
与 `as_of_date` 一并进缓存键。

**拓扑逆序单遍是 DAG 约束存在的唯一实质理由**：没有环才能保证每个节点在其所有子件算完后恰好算一次。
AC#4 要求卷算自身也能检出环，而不是依赖 US-509 —— 写入期约束可能因迁移或直连被绕过，
计算期不做防御就会变成死循环而非报错。

AC#6 遵守本仓「无 fallback 兜底」铁律：缺成本以 0 计会产出一个看起来正常的错误数字，
这比报错难发现得多。但只验缺失报错证明不了卷算正确，AC#7 / #9 是正向数值 oracle。

## 价值待证

同 [epic-009](../../epics/epic-009-bom-domain-model.md#价值待证整个-epic)。

## 实现文件

- `packages/rxdb-plugin-bom/` — 待建；卷算引擎

## References

- [epic-009 BOM 领域模型](../../epics/epic-009-bom-domain-model.md)
- [US-511 展开数量正确性](US-511-bom-quantity-semantics.md) — 前置；共享第 2～6 步
- [US-512 替代组与替代策略](US-512-bom-substitute-group.md) — 前置；AC#2 的组与 `equiv_qty`
- [US-513 联产品与副产品](US-513-bom-coproduct-byproduct.md) — 前置；AC#5 的 `by_product`
- [US-520 工艺路线挂接与工序投料分摊](US-520-bom-routing-operation.md) — 前置；行到工序的挂接
- [US-524 工艺路线本体](US-524-routing-master-model.md) — 前置；工时、`time_basis` 与费率的来源
