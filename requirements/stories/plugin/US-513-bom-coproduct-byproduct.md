---
id: US-513
title: 联产品与副产品：多输出物料流
status: Backlog
priority: Low
epic: epic-009-bom-domain-model
created: 2026-09-22
updated: 2026-09-22
tags: [plugin, bom, process-industry]
---

# 用户故事：联产品与副产品：多输出物料流

## 作为/我想要/以便

**作为** 流程行业工艺员
**我想要** 一次反应产出主产品与副产品，且副产品可作为另一工艺的投入
**以便** 回流料与联产不被 DAG 约束误判成环

## 范围边界

### In Scope

- `bom_line.flow_direction`：`consume` / `produce` / `by_product` / `scrap_out`
- 只有 `consume` 边进入结构闭包与环检测
- 展开与卷算时 `produce` / `by_product` 作为反向物料流处理
- 四个方向**各自**的下游消费方明确，没有一个是只声明不消费的枚举值

### Out of Scope

- 副产品定价与成本分配方法学（→ US-514 只消费 `credit_price`）
- 工艺配方的批次放大规则

## 验收标准

| #   | 前置条件                                             | 操作 | 预期结果                                       | 状态 |
| --- | ---------------------------------------------------- | ---- | ---------------------------------------------- | ---- |
| 1   | 工艺 P 产出主品 M 与副品 S；S 投入工艺 Q，Q 也产出 M | 保存 | **不报环**（`produce` 边不入闭包）             | ⬜   |
| 2   | 含副产的 BOM                                         | 卷算 | 副产按 `credit_price` 抵减成本                 | ⬜   |
| 3   | 混合方向的边集                                       | 下钻 | 只有 `consume` 边构成层级                      | ⬜   |
| 4   | 只有 `produce` 边、无 `consume` 边的头               | 展开 | 明确报「无投入」，不返回空结果当成功           | ⬜   |
| 5   | `consume` 边给负用量                                 | 保存 | CHECK 拒绝（负用量应改用 `produce`）           | ⬜   |
| 6   | `scrap_out` 边                                       | 展开 | 不产生需求行，但在展开结果中可见、可按工序归集 | ⬜   |
| 7   | `scrap_out` 边                                       | 卷算 | 不计入成本也不抵减——处置收益属事务域           | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 技术笔记

纯 DAG 表达不了流程行业的真实物料流：钢厂废钢回炉、化工 recycle stream、联产品互为投入。
解法不是放弃 DAG，而是**把 DAG 约束的作用域缩到 `consume` 子图**——
结构层级与拓扑排序仍在 DAG 上进行（US-514 的卷算依赖这一点），反向流走另一类边。

这条与 [US-509](US-509-bom-dag-cycle-detection.md) AC#4 互为对偶：US-509 负责「非 consume 边不参与检测」，
本故事负责「这些边有明确语义并被展开与卷算正确消费」。

**四个方向必须各自有消费方**，否则枚举里会留下只能写进去、没人读出来的值：

| `flow_direction` | 进环检测与闭包 | 数量语义                                            | 成本语义                                      |
| ---------------- | -------------- | --------------------------------------------------- | --------------------------------------------- |
| `consume`        | 是（US-509）   | [US-511](US-511-bom-quantity-semantics.md) 七步公式 | 材料项（[US-514](US-514-bom-cost-rollup.md)） |
| `produce`        | 否             | 产出量，本故事 AC#1 / AC#4                          | 主产品成本即卷算结果本身                      |
| `by_product`     | 否             | 产出量，本故事 AC#2                                 | 按 `credit_price` 抵减（US-514 AC#5）         |
| `scrap_out`      | 否             | 废料量，本故事 AC#6                                 | 不计不抵（本故事 AC#7）                       |

US-511 的七步公式**只认 `consume`**，其余三种不进那条链路——这是分工，不是遗漏。

AC#5 的理由：允许 `consume` 边带负用量等于给同一件事留了两种表达，
两种表达的系统最终会两种都出现在数据里。

## 价值待证

同 [epic-009](../../epics/epic-009-bom-domain-model.md#价值待证整个-epic)。

## 实现文件

- `packages/rxdb-plugin-bom/` — 待建；`flow_direction` 语义与反向流处理

## References

- [epic-009 BOM 领域模型](../../epics/epic-009-bom-domain-model.md)
- [US-509 DAG 约束与环路检测](US-509-bom-dag-cycle-detection.md) — 对偶约束
