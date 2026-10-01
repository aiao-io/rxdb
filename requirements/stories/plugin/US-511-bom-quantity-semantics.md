---
id: US-511
title: 展开数量正确性：用量语义、三类损耗、虚拟件穿透
status: Backlog
priority: Low
epic: epic-009-bom-domain-model
created: 2026-09-22
updated: 2026-10-01
tags: [plugin, bom, calculation]
---

# 用户故事：展开数量正确性：用量语义、三类损耗、虚拟件穿透

## 作为/我想要/以便

**作为** 计划员
**我想要** 定量用量、公式用量、三类损耗与虚拟件穿透都算对
**以便** MRP 毛需求与手算一致，不用在 Excel 里复核一遍

## 交付阶段

| 阶段 | 内容                                                                                                                                      | 状态 |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| A    | 用量语义：`qty` / `qty_formula` 二选一及公式语法版本、`is_fixed_qty`、`lotsize_from/to`、带单位的数量与单位换算                           | ⬜   |
| B1   | 装配损耗与组件损耗，各自 `scrap_convention` 区分加成制与良率制；固定损耗                                                                  | ⬜   |
| B2   | 工序损耗（第 5 步）；前置 [US-520](US-520-bom-routing-operation.md) 的 `operation_seq` 与 [US-524](US-524-routing-master-model.md) 阶段 D | ⬜   |
| C    | 虚拟件穿透：`COALESCE(occurrence.phantom_override, item_revision.default_phantom)`，进入子 BOM 前先归一单位                               | ⬜   |

## 范围边界

### In Scope

- 用量四态：标量、定量（不随父件缩放）、公式（参数化 BOM）、批量阶梯
- **数量带单位**：父计划量、行需求量、递归输入都是「值 + 单位」；进入子 BOM 前先转到其 `bom_header.base_uom`，
  缺换算率或量纲不兼容即拒绝，**不默认 1**
- 单位换算：行 UoM → 子件库存 UoM → 子 BOM 头基准 UoM，物料级换算率 + 行级覆盖
- 三类损耗各就其位：装配损耗在**头**、组件损耗在**行发生项**、工序损耗在**工序**；三处各自声明 `scrap_convention`
- 损耗记法两制并存：加成制 `x × (1+s)` 与良率制 `x ÷ (1−s)`；合法域加成制 `s ≥ 0`、良率制 `0 ≤ s < 1`，`s = 1` 拒绝
- 虚拟件穿透，且**行级标记覆盖修订级标记**
- 只有 `flow_direction = 'consume'` 的行进入需求展开（`flow_direction` 由 [US-513](US-513-bom-coproduct-byproduct.md) 引入；
  它落地前所有行都是 `consume`，本故事不因此阻塞）
- **精度与舍入**：内部全程十进制精确计算，只在最终需求行上按子件库存单位声明的小数位**向上取整**一次；虚拟件穿透的中间量不舍入
- 结果在 [US-508](US-508-bom-view-resolution.md) 的 manifest 上追加本次用到的换算率、公式参数、公式语法版本与算法版本
- 遇到 [US-510](US-510-bom-multilevel-explosion.md) 的 `truncated` 或 US-508 的 `unresolved` 结构，拒绝计算

### Out of Scope

- 工序损耗的工序序列本身（→ US-520 提供 `operation_seq` 与分摊）
- 替代组的需求分摊（→ US-512）
- 成本（→ US-514）
- 非 `consume` 行的数量语义（→ US-513）：`produce` / `by_product` 的产出量与 `scrap_out` 的废料量
  都不是「需求」，不进本故事的七步公式
- 通用表达式求值（任意 JS / SQL 表达式）——公式只接受本故事定义的受限语法

## 验收标准

| #   | 前置条件                                                                  | 操作                       | 预期结果                                                                | 状态 |
| --- | ------------------------------------------------------------------------- | -------------------------- | ----------------------------------------------------------------------- | ---- |
| 1   | 装配 5% + 组件 3% + 工序 2% 同时存在                                      | 展开                       | 等于手算 golden；三处各按自己的 convention 计算                         | ⬜   |
| 2   | 定量用量行                                                                | 父件数量 ×10               | 该行用量不变                                                            | ⬜   |
| 3   | `qty_formula = 长×宽×厚×密度`                                             | 改参数                     | 展开量随之变化；公式与语法版本可持久化、可审计                          | ⬜   |
| 4   | 子件 A 在装配 X 下 phantom、Y 下不是                                      | 分别展开 X 与 Y            | X 穿透到 A 的子件且不产生 A 的需求行；Y 产生 A 的需求行                 | ⬜   |
| 5   | 行 UoM=米、子件库存 UoM=千克                                              | 展开                       | 按换算率转为库存单位                                                    | ⬜   |
| 6   | 同一头同一子件两条阶梯行 `[0, 100)` / `[100, +∞)`                         | 父计划量 99 / 100 / 101    | 各恰好命中一行；阶梯按**损耗前**父计划量 P 选择                         | ⬜   |
| 7   | 同时给 `qty` 与 `qty_formula`，或两者都不给                               | 保存                       | CHECK 拒绝（恰好一项）                                                  | ⬜   |
| 8   | A 需 1000 g phantom B；B 头 `base_qty = 1 kg`，每 kg B 用 2 件 C          | 展开 A                     | 恰好 2 件 C（不是 2000）                                                | ⬜   |
| 9   | 同 #8，但 B 头 `base_qty = 0.5 kg`、每 0.5 kg 用 2 件 C；再加一层 phantom | 展开 A                     | 多层归一后等于手算；行级换算覆盖生效                                    | ⬜   |
| 10  | B 头基准 UoM 与 B 库存 UoM 不同且缺换算率；或 g → 件 量纲不兼容           | 展开                       | 拒绝，错误点名路径与缺失换算，不默认 1                                  | ⬜   |
| 11  | 组件需求 100，组件损耗 20%                                                | 加成制 / 良率制分别展开    | 120 / 125                                                               | ⬜   |
| 12  | 同 #11 但良率制 `s = 1`                                                   | 保存                       | 拒绝：良率制损耗必须 < 1                                                | ⬜   |
| 13  | 工序 10→20→30，只有 20 损耗 3%，三道工序各投料 100（阶段 B2）             | 展开，两种 convention 各一 | 加成制：工序 10 投料 103、20 投料 103、30 投料 100；良率制对应 100/0.97 | ⬜   |
| 14  | `qty_formula` 引用未提供参数 / 语法错误 / 除零 / 结果非有限或为负         | 展开                       | 整次展开拒绝，错误含路径、公式与参数名；不跳过该行、不部分产出          | ⬜   |
| 15  | 定量行 qty=5，其父子装配经两条路径出现                                    | 展开整机                   | 每条路径各计 5（共 10）：定量按「每条路径的每个父批次」计，不跨路径合并 | ⬜   |
| 16  | 需求 10.0001 件，库存单位小数位 0                                         | 展开                       | 需求行 11；中间量不舍入                                                 | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 技术笔记

**顺序不可颠倒**，这是 MRP 与成本算错最常见的根因。下式里 `conv(·)` 表示按单位换算，`scrap(x, s, convention)`
加成制为 `x × (1+s)`、良率制为 `x ÷ (1−s)`：

```
1. 父件计划量                P            单位 = h.base_uom（已由上一层归一）
2. 装配损耗（头级）          P' = scrap(P, h.assembly_scrap, h.assembly_scrap_convention)
3. 组件毛需求                q  = 本发生项的 qty，或按语法版本求值 qty_formula；阶梯按 P 选行
                             G  = is_fixed ? q : q × P' / h.base_qty                 单位 = l.uom
4. 组件损耗（行级）          G' = scrap(G, l.component_scrap, l.component_scrap_convention)
                                  + l.component_scrap_fixed                         单位 = l.uom
5. 工序损耗（工序级）        G'' = G' 依次过 scrap(·, op.scrap, op.convention)，
                             op 从 l.operation_seq（含）起至末工序                  -- 阶段 B2
6. 单位换算                  D  = conv(G'', l.uom → child.stock_uom)
7. 虚拟件穿透 / 产出需求行   phantom = COALESCE(l.phantom_override, r.default_phantom)
                             phantom 为真：conv(D, child.stock_uom → child_header.base_uom)
                                           作为子 BOM 的 P 回到第 1 步，不产生需求行、不舍入
                             phantom 为假：按 child.stock_uom 小数位向上取整，产出需求行
```

**单位换算在穿透之前，不在之后。** 旧写法把第 6 步「`G''` 作为子件的 P 下钻」放在第 7 步「单位换算」之前：
A 需要 1000 g 的 phantom B，B 的头以 1 kg 为基准、每 kg 用 2 件 C，正确是 `1000 × 0.001 × 2 = 2` 件 C，
直接把 1000 当 B 的 `P` 得 2000 件，**错 1000 倍**（Decimal 探针复现）。数量只有数值没有单位才会犯这种错，
所以第 1、3、6、7 步都显式写出单位。非 phantom 的下层展开同样从第 1 步进入子 BOM，同样先归一。

**工序损耗的方向：从投料工序（含）到末工序。** 物料在工序 10 投入，就要经过 20、30；20 的报废会吃掉 10 投入的料，
所以 10 投料的需求要被 20 的损耗放大；30 投入的料不经过 20，不受影响。10→20→30、只有 20 损耗 3% 时，
加成制下投料基数 100 的需求是 10:103、20:103、30:100（AC#13）。
[US-520](US-520-bom-routing-operation.md) AC#3 与 [US-525](US-525-bom-end-to-end-demo.md) AC#9 已按此方向改写。

**三类损耗不能合成一个字段**——它们在公式里的位置不同：装配损耗级联到所有组件**和工序**，
组件损耗只放大本行，工序损耗从投料工序起逐工序累乘。

**两种损耗记法必须显式记录，且每一处各记各的。** s = 5% 时加成制与良率制相差 0.25%，s = 20% 时是 120 对 125；
不记 `scrap_convention`，与 ERP 对接会出现无人能解释的差。内部可统一存良率因子，但**入口必须能声明来源制**，
头、行发生项、工序（[US-524](US-524-routing-master-model.md) 阶段 D）三处各有自己的 convention 字段。
固定损耗 `component_scrap_fixed` 以**行 UoM** 计，粒度与定量用量相同（每条路径的每个父批次一次），不随父件缩放、不再被良率放大。

**用量四态的边界：**

- `qty` 与 `qty_formula` 恰好一项非空（单行 CHECK，落点 [US-030](../core/US-030-declarative-storage-constraints.md) 阶段 A）；
- 公式只接受受限语法：十进制字面量、`+ − × ÷`、括号、命名参数；持久化时同时记 `formula_grammar_version`，
  语法升级不改旧公式的含义；缺参、语法错、除零、非有限值、负值都拒绝整次展开（AC#14），不以 0 或跳过兜底；
- 定量用量与固定损耗的粒度是「每条路径的每个父批次」：同一子装配经两条路径出现，就是两个装配批次，各计一次（AC#15）；
- 阶梯按**损耗前**父计划量 P 选：阶梯是对订单批量的约定，用损耗后的量会让同一订单因损耗率变化而跳档；
  同一头同一子件的阶梯行区间为半开 `[lotsize_from, lotsize_to)`，重叠在头发布时拒绝（[US-507](US-507-bom-graph-skeleton.md) 发布边界）。

**舍入只发生一次。** 每一步都舍入会让多层结构的误差逐层累积，而且依赖舍入位置的结果无法与手算对账。
内部全程十进制精确，只在产出需求行时按库存单位小数位向上取整（AC#16）——向上是因为毛需求取整向下会造成缺料。

**AC#4 是最易漏的一条**：同一物料在不同装配下 phantom 与否不同，
所以标记要能同时挂节点与边，且**边覆盖节点**。只在物料主数据上放一个布尔值是不够的。

节点侧的那个布尔值挂 `item_revision` 而不是 `item`（[US-507](US-507-bom-graph-skeleton.md) 阶段 A）：
虚拟与否是**设计决定**，同一物料的 D 版可以是虚拟件、E 版改成实体件。挂在 `item` 上则改一次
会追溯性地改掉所有历史修订的展开结果，而历史结构解析本该稳定（[US-508](US-508-bom-view-resolution.md)「历史查询的边界」）。

**七步公式只认 `qty`。** 位号数不是第二个数量来源——一致性由
[US-507](US-507-bom-graph-skeleton.md) AC#5 在发布转移上保证，展开期不做推导也不做校正。

**阶段 B 拆成 B1 / B2 是因为前置不同。** 装配与组件损耗只需要本故事自己的字段；工序损耗要 US-520 的
`operation_seq` 与 US-524 阶段 D 的 `operation_scrap`。B2 之前，模型里根本没有工序损耗字段，不存在「接受后静默忽略」。

## 价值待证

同 [epic-009](../../epics/epic-009-bom-domain-model.md#价值待证整个-epic)。

## 实现文件

- `packages/rxdb-plugin-bom/` — 待建；数量展开计算

## References

- [epic-009 BOM 领域模型](../../epics/epic-009-bom-domain-model.md)
- [US-510 多级展开与 where-used 反查](US-510-bom-multilevel-explosion.md) — 前置
- [US-508 BOM 视图解析](US-508-bom-view-resolution.md) — 前置；`ResolutionContext` 与 manifest
- [US-520 工艺路线挂接与工序投料分摊](US-520-bom-routing-operation.md) — 阶段 B2 的前置；`operation_seq`
- [US-524 工艺路线本体](US-524-routing-master-model.md) — 阶段 B2 的前置；阶段 D 的工序损耗与 convention
- [US-513 联产品与副产品](US-513-bom-coproduct-byproduct.md) — `flow_direction` 的来源
- [US-030 实体元数据层的声明式存储约束](../core/US-030-declarative-storage-constraints.md) — AC#7 / #12 的单行 CHECK 落点
