---
id: US-511
title: 展开数量正确性：用量语义、三类损耗、虚拟件穿透
status: Backlog
priority: Low
epic: epic-009-bom-domain-model
created: 2026-09-22
updated: 2026-09-22
tags: [plugin, bom, calculation]
---

# 用户故事：展开数量正确性：用量语义、三类损耗、虚拟件穿透

## 作为/我想要/以便

**作为** 计划员
**我想要** 定量用量、公式用量、三类损耗与虚拟件穿透都算对
**以便** MRP 毛需求与手算一致，不用在 Excel 里复核一遍

## 交付阶段

| 阶段 | 内容                                                                                | 状态 |
| ---- | ----------------------------------------------------------------------------------- | ---- |
| A    | 用量语义：`qty` / `qty_formula` 二选一、`is_fixed_qty`、`lotsize_from/to`、单位换算 | ⬜   |
| B    | 三类损耗按正确顺序；`scrap_convention` 区分加成制与良率制                           | ⬜   |
| C    | 虚拟件穿透：`COALESCE(line.phantom_override, item_revision.default_phantom)`        | ⬜   |

## 范围边界

### In Scope

- 用量四态：标量、定量（不随父件缩放）、公式（参数化 BOM）、批量阶梯
- 单位换算：行 UoM → 子件库存 UoM，物料级换算率 + 行级覆盖
- 三类损耗各就其位：装配损耗在**头**、组件损耗在**行**、工序损耗在**工序**
- 损耗记法两制并存：加成制 `qty × (1+s)` 与良率制 `qty ÷ (1−s)`
- 虚拟件穿透，且**行级标记覆盖修订级标记**
- 只有 `flow_direction = 'consume'` 的行进入需求展开

### Out of Scope

- 工序损耗的工序序列本身（→ US-520 提供 `operation_seq` 与分摊）
- 替代组的需求分摊（→ US-512）
- 成本（→ US-514）
- 非 `consume` 行的数量语义（→ US-513）：`produce` / `by_product` 的产出量与 `scrap_out` 的废料量
  都不是「需求」，不进本故事的七步公式

## 验收标准

| #   | 前置条件                             | 操作            | 预期结果                                                | 状态 |
| --- | ------------------------------------ | --------------- | ------------------------------------------------------- | ---- |
| 1   | 装配 5% + 组件 3% + 工序 2% 同时存在 | 展开            | 等于手算；加成制与良率制两种 convention 各自正确        | ⬜   |
| 2   | 定量用量行                           | 父件数量 ×10    | 该行用量不变                                            | ⬜   |
| 3   | `qty_formula = 长×宽×厚×密度`        | 改参数          | 展开量随之变化；公式可持久化、可审计                    | ⬜   |
| 4   | 子件 A 在装配 X 下 phantom、Y 下不是 | 分别展开 X 与 Y | X 穿透到 A 的子件且不产生 A 的需求行；Y 产生 A 的需求行 | ⬜   |
| 5   | 行 UoM=米、子件库存 UoM=千克         | 展开            | 按换算率转为库存单位                                    | ⬜   |
| 6   | `lotsize_from/to` 分段的两行         | 按不同批量展开  | 命中对应区间的那一行                                    | ⬜   |
| 7   | 同时给 `qty` 与 `qty_formula`        | 保存            | CHECK 拒绝（二选一）                                    | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 技术笔记

**顺序不可颠倒**，这是 MRP 与成本算错最常见的根因：

```
1. 父件计划量                P
2. 装配损耗（头级）          P' = P × (1 + h.assembly_scrap)      -- 加成制
                             P' = P ÷ (1 − h.assembly_scrap)      -- 良率制
3. 组件毛需求                G  = is_fixed ? qty : qty × P' / h.base_qty
4. 组件损耗（行级）          G' = G × (1 + l.component_scrap) + l.component_scrap_fixed
5. 工序损耗（工序级）        G'' = G' × Π(1 + op.scrap)，从 l.operation_seq 起累乘至末工序
6. 虚拟件穿透                COALESCE(l.phantom_override, r.default_phantom) 为真时
                             不产生需求行，G'' 作为其子件的 P 继续下钻
7. 单位换算                  l.uom → child.base_uom
```

**三类损耗不能合成一个字段**——它们在公式里的位置不同：装配损耗级联到所有组件**和工序**，
组件损耗只放大本行，工序损耗从投料工序起逐工序累乘。

**两种损耗记法必须显式记录。** s = 5% 时加成制与良率制相差 0.25%，批量大时是实质差异；
不记 `scrap_convention`，与 ERP 对接会出现无人能解释的小数差。内部可统一存良率因子，
但**入口必须能声明来源制**。

**AC#4 是最易漏的一条**：同一物料在不同装配下 phantom 与否不同，
所以标记要能同时挂节点与边，且**边覆盖节点**。只在物料主数据上放一个布尔值是不够的。

节点侧的那个布尔值挂 `item_revision` 而不是 `item`（[US-507](US-507-bom-graph-skeleton.md) 阶段 A）：
虚拟与否是**设计决定**，同一物料的 D 版可以是虚拟件、E 版改成实体件。挂在 `item` 上则改一次
会追溯性地改掉所有历史修订的展开结果，而历史展开本该可复算。

**七步公式只认 `qty`。** 位号数不是第二个数量来源——一致性由
[US-507](US-507-bom-graph-skeleton.md) AC#5 在写入期保证，展开期不做推导也不做校正。

## 价值待证

同 [epic-009](../../epics/epic-009-bom-domain-model.md#价值待证整个-epic)。

## 实现文件

- `packages/rxdb-plugin-bom/` — 待建；数量展开计算

## References

- [epic-009 BOM 领域模型](../../epics/epic-009-bom-domain-model.md)
- [US-510 多级展开与 where-used 反查](US-510-bom-multilevel-explosion.md) — 前置
