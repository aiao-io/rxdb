---
id: US-524
title: 工艺路线本体：工序、工作中心、工时与费率
status: Backlog
priority: Low
epic: epic-009-bom-domain-model
created: 2026-09-22
updated: 2026-10-09
tags: [domain, bom, routing, cost]
---

# 用户故事：工艺路线本体：工序、工作中心、工时与费率

## 作为/我想要/以便

**作为** 工艺工程师
**我想要** 工序、工作中心、作业类型与费率作为一等实体存在
**以便** BOM 行挂得到真实工序、成本卷算算得出加工费，而不是对着两个悬空的外键

## 交付阶段

| 阶段 | 内容                                                                                                      | 状态 |
| ---- | --------------------------------------------------------------------------------------------------------- | ---- |
| A    | `routing` + `routing_operation` + 最小 `work_center`（编码、组织）：工序序号、描述、所属工作中心、生效期  | ⬜   |
| B    | `activity_type` + `activity_rate`：费率带生效期、币种与计费单位 `rate_uom`；`work_center` 补齐成本属性    | ⬜   |
| C    | 工时模型：`setup_time`（每批）/ `run_time`（每件）/ `fixed_time`（固定），共用工序上的时间单位 `time_uom` | ⬜   |
| D    | 工序损耗 `operation_scrap` 与**每道工序各自的** `scrap_convention`（与 US-511 同一记法）                  | ⬜   |

AC 的阶段归属：A 关闭 AC#1 / #2 / #7 / #8 / #10 / #11；B 关闭 AC#3 / #4；C 关闭 AC#5；D 关闭 AC#6 / #9。

## 范围边界

### In Scope

- `routing` 的唯一键与 BOM 头逐列对齐：`(parent_revision_id, bom_type, org_id, alternative_no)`，同 [US-507](US-507-bom-graph-skeleton.md) 的 `bom_header` 唯一键（AC#11）
- `routing_operation` 的身份是 `(routing_id, operation_seq)`——这正是 US-520 引用完整性要指向的东西
- 费率按 `(work_center, activity_type, valid_from)` 取值，取不到就报错，不以 0 兜底；币种与计费单位 `rate_uom` 随费率存，卷算时币种与上下文币种比对（[US-514](US-514-bom-cost-rollup.md) AC#10）、工时先换到计费单位再乘费率（US-514 AC#19）
- **路线一律落在本仓**：BOM 头的 `routing_id` 只能指向本仓 `routing`。不存在「路线由外部系统提供、本仓只存一个外部 ID」的半支持态；
  头可以不挂路线（`routing_id` 为 NULL，即无加工工序），但挂了就必须可解析
- 三个工时量各按自己的基数在卷算里正确：`setup_time`（每批）与 `fixed_time`（固定）一批一次，不随批量与加工量缩放；`run_time`（每件）乘的是工序加工量（[US-514](US-514-bom-cost-rollup.md) 的 `W_op`），不是无损耗的父计划量；
  三者以同一个 `time_uom` 计，求和后换算一次到费率的 `rate_uom`（US-514 AC#18 / #19）
- 工时、费率与工序损耗率按 [US-511 十进制值合同](US-511-bom-quantity-semantics.md#技术笔记)存取

### Out of Scope

- 排产、产能与有限能力计划——属事务域
- 车间报工与实际工时回写
- BOM 行到工序的挂接与分摊（→ [US-520](US-520-bom-routing-operation.md)，本故事只提供被挂接的那一端）
- 工序级投料的数量放大公式（→ [US-511](US-511-bom-quantity-semantics.md) 第 5 步）

## 验收标准

| #   | 前置条件                                                                | 操作                                                                                   | 预期结果                                                     | 状态 |
| --- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ---- |
| 1   | 某修订的路线含工序 10/20/30                                             | 查询                                                                                   | 按 `operation_seq` 有序返回，各带工作中心                    | ⬜   |
| 2   | 工序引用不存在的工作中心                                                | 保存                                                                                   | 拒绝（引用完整性）                                           | ⬜   |
| 3   | 同一 `(work_center, activity_type)` 两段费率                            | 按日期取值                                                                             | 命中对应区间；区间重叠在存储层被拒                           | ⬜   |
| 4   | 某工作中心在卷算日期无生效费率                                          | 卷算                                                                                   | 明确报缺失项，**不以 0 兜底**                                | ⬜   |
| 5   | 工序 `setup_time = 2 h`、`fixed_time = 3 h`、`run_time = 0`，费率 1 / h | 批量 ×10 卷算加工项（US-514）                                                          | 加工项恒为 5，不随批量放大                                   | ⬜   |
| 6   | 工序 20 声明 3% 损耗                                                    | 读工序                                                                                 | 损耗与 `scrap_convention` 可读，记法与 US-511 一致           | ⬜   |
| 7   | 路线整体停用                                                            | 按停用后日期解析                                                                       | 该路线不入结果，已挂接的 BOM 行报未覆盖而非静默              | ⬜   |
| 8   | BOM 头 `routing_id` 指向本仓不存在的路线                                | 保存头                                                                                 | 拒绝；不接受「外部路线 ID」                                  | ⬜   |
| 9   | 工序 10 加成制 2%、工序 20 良率制 3%                                    | 读工序并交给 US-511 第 5 步                                                            | 两道工序各按自己的 convention 计算，不被统一成一种           | ⬜   |
| 10  | 头 `routing_id` 为 NULL                                                 | 卷算（US-514）                                                                         | 加工项为空且明细注明「无路线」；不是缺费率错误，也不是静默 0 | ⬜   |
| 11  | 路线的 `parent_revision_id`、`org_id`、`alternative_no` 取值都相同      | 先后保存 `bom_type = EBOM` 与 `bom_type = MBOM` 各一条，再保存第二条 `bom_type = MBOM` | 前两条并存、互不占位；第三条被唯一键拒绝                     | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 技术笔记

**本故事存在的理由是两条悬空引用。** [US-520](US-520-bom-routing-operation.md) 的 AC#5
要求 `operation_seq` 指向不存在的工序时拒绝——引用完整性要成立，被引用的那张表必须存在。
[US-514](US-514-bom-cost-rollup.md) 的加工费项 `hours(op, L) × rate(activity, work_center)`
里，`setup` / `run` / `fixed` / `rate` 与它们的单位没有一个在 BOM 侧。US-520 把路线本体列为 Out of Scope 是对的
（挂接点与本体是两件可独立交付的事），但「由外部提供」不是一个可核对的状态。

**唯一键与 BOM 头逐列对齐，不是巧合。** 路线随修订走：同一物料的 D 版与 E 版可以有不同工序序列。
键写成 `(parent_revision_id, bom_type, org_id, alternative_no)`，与 [US-507](US-507-bom-graph-skeleton.md) 的 `bom_header` 唯一键逐列相同。
EBOM 头与 MBOM 头是两张独立的头（[US-516](US-516-ebom-mbom-mapping.md)），父修订可以不同，也可以相同（US-516 的变换范围只要求两侧父件是同一物料，不要求修订不同）；
相同时键里的 `bom_type` 让两头各有自己的路线位置，不会被迫共用一条（AC#11）。US-516 对路线没有需求（全文只在 Out of Scope 提到「工艺路线生成」），
这里只是不让键把这种可能堵死。

**工序损耗的记法必须与 US-511 共用一套。** 加成制与良率制在 s = 5% 时相差 0.25%；
路线侧若自定一套记法，US-511 第 5 步的 `scrap(·, op.scrap, op.convention)` 就会对着一个语义不同的数计算。
convention 挂在**每道工序**上（AC#9）：同一条路线的工序可能来自不同来源系统。这里只声明字段与语义，累乘的位置仍归 US-511。

**工作中心为什么进阶段 A。** AC#1 要求工序「各带工作中心」、AC#2 要求工作中心引用完整性，若 `work_center` 到 B 才建，
A 就有两条 AC 关不掉。A 只建最小的工作中心（编码、组织），成本相关属性仍在 B。

**没有「外部提供」的半支持态（AC#8 / #10）。** 路线若由外部系统提供，US-520 的引用完整性与 US-514 的加工费
就都对着一个本仓无法核对的 ID——要么静默接受、要么静默算 0。
所以挂接必须指向本仓路线；真没有路线的头显式为 NULL，卷算里明示「无路线」，与「有路线但缺费率」（AC#4）区分开。

**三个工时量各有固有基数。** 同一道工序可以同时有准备、加工与固定工时
（[US-514](US-514-bom-cost-rollup.md) AC#15 的工序同时带 `setup = 2 h` 与 `run = 1 h/件`），所以基数跟着字段走：
`setup_time` 每批一次、`fixed_time` 与批量和加工量都无关、`run_time` 每件乘工序加工量 `W_op`。
`setup_time` 与 `fixed_time` 在 `batch_cost(n, L)` 里算法相同（都只计一次、不随损耗缩放），分字段存取，卷算明细里分列（US-514 AC#18）。

**加工费有两个单位。** 工时以 `time_uom` 计、费率按 `rate_uom` 计，两者可以不同（分钟 / 小时）。卷算先在 `time_uom` 下把三个工时量求和，
再换算一次到 `rate_uom`；同为时间量纲才换算，缺换算或量纲不兼容即拒绝，不默认 1（US-514 AC#19）。

**AC#4 遵守本仓「无 fallback 兜底」铁律**，与 US-514 AC#6 同源：缺费率以 0 计会产出一个
看起来正常的成本数字。

## 价值待证

本故事与 [epic-009](../../epics/epic-009-bom-domain-model.md#价值待证整个-epic) 其余各条同标
**价值待证**：新增 `routing` / `work_center` / `activity_rate` 等抽象，对应零个已知病灶。

**解锁顺序跟着消费方走**：阶段 A 是 [US-520](US-520-bom-routing-operation.md) 引用完整性的前置，A～C 是 US-514 加工项的前置，
D 是 [US-511](US-511-bom-quantity-semantics.md) 阶段 B2 的前置。不需要工序挂接与加工成本的驱动场景，本故事不开工。

## 实现文件

- `packages/rxdb-plugin-bom/` — 待建；路线、工作中心与费率实体

## References

- [epic-009 BOM 领域模型](../../epics/epic-009-bom-domain-model.md)
- [US-507 BOM 图骨架](US-507-bom-graph-skeleton.md) — `bom_header` 唯一键 `(parent_revision_id, bom_type, org_id, alternative_no)` 的来源；`routing` 键与之逐列对齐（本故事 AC#11）
- [US-516 EBOM ↔ MBOM 映射与差异对比](US-516-ebom-mbom-mapping.md) — EBOM / MBOM 是两张独立的头，共用父修订时各占一个路线位置；对路线没有需求
- [US-520 工艺路线挂接与工序投料分摊](US-520-bom-routing-operation.md) — 消费 `(routing_id, operation_seq)` 的引用完整性
- [US-514 成本卷算](US-514-bom-cost-rollup.md) — 消费三类工时、`time_uom`、费率与 `rate_uom`（其 AC#18 / #19）
- [US-511 展开数量正确性](US-511-bom-quantity-semantics.md) — 工序损耗记法的共用来源
- [US-030 实体元数据层的声明式存储约束](../core/US-030-declarative-storage-constraints.md) — AC#3 的区间排他落点（阶段 C）
