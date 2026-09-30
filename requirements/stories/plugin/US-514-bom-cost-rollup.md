---
id: US-514
title: 成本卷算
status: Backlog
priority: Low
epic: epic-009-bom-domain-model
created: 2026-09-22
updated: 2026-09-22
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
- 四项构成：材料（`consume` 行 × 子件成本）、加工（工序工时 × 费率）、制费、副产抵减
- 逐层成本明细可展开审计
- 环存在时报错而非死循环

### Out of Scope

- 费率与作业类型的主数据维护（→ [US-524](US-524-routing-master-model.md)）
- 实际成本与差异分析（属事务域）
- 副产品成本分配方法学的选择（只消费给定的 `credit_price`）

## 验收标准

| #   | 前置条件                     | 操作 | 预期结果                               | 状态 |
| --- | ---------------------------- | ---- | -------------------------------------- | ---- |
| 1   | 5 层 BOM + 工艺路线          | 卷算 | 叶→根单遍完成，逐层成本可展开审计      | ⬜   |
| 2   | 替代组 strategy=proportional | 卷算 | 按 `usage_probability` 加权            | ⬜   |
| 3   | 含虚拟件                     | 卷算 | 虚拟件无自身成本，透传其子件成本       | ⬜   |
| 4   | 人为构造环（绕过 US-509）    | 卷算 | 检出并报错，不死循环、不返回部分结果   | ⬜   |
| 5   | 含副产品                     | 卷算 | 按 `credit_price` 抵减，明细中该项可见 | ⬜   |
| 6   | 某子件缺成本                 | 卷算 | 明确报缺失项，**不以 0 兜底**          | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 技术笔记

```
cost(item) = Σ_{consume 行}  qty_eff × cost(child)                       -- 材料
           + Σ_{工序}        (setup + run) × rate(activity, work_center)  -- 加工
           + overhead(item)                                               -- 制费
           − Σ_{by_product}  qty × credit_price                          -- 副产抵减
```

`qty_eff` 取 [US-511](US-511-bom-quantity-semantics.md) 的展开结果，含三类损耗——
**卷算不重新实现数量逻辑**，否则两处会漂。

加工项的 `setup` / `run` / `rate` 三个量一个都不在 BOM 侧，它们来自
[US-524](US-524-routing-master-model.md) 的路线本体；
[US-520](US-520-bom-routing-operation.md) 只提供「哪一行归哪道工序」的挂接。
两条都是本故事的前置，缺任一条则加工项无从计算。

**拓扑逆序单遍是 DAG 约束存在的唯一实质理由**：没有环才能保证每个节点在其所有子件算完后恰好算一次。
AC#4 要求卷算自身也能检出环，而不是依赖 US-509 —— 写入期约束可能因迁移或直连被绕过，
计算期不做防御就会变成死循环而非报错。

AC#6 遵守本仓「无 fallback 兜底」铁律：缺成本以 0 计会产出一个看起来正常的错误数字，
这比报错难发现得多。

## 价值待证

同 [epic-009](../../epics/epic-009-bom-domain-model.md#价值待证整个-epic)。

## 实现文件

- `packages/rxdb-plugin-bom/` — 待建；卷算引擎

## References

- [epic-009 BOM 领域模型](../../epics/epic-009-bom-domain-model.md)
- [US-511 展开数量正确性](US-511-bom-quantity-semantics.md) — 前置
- [US-520 工艺路线挂接与工序投料分摊](US-520-bom-routing-operation.md) — 前置；行到工序的挂接
- [US-524 工艺路线本体](US-524-routing-master-model.md) — 前置；工时与费率的来源
