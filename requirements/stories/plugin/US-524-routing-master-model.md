---
id: US-524
title: 工艺路线本体：工序、工作中心、工时与费率
status: Backlog
priority: Low
epic: epic-009-bom-domain-model
created: 2026-09-22
updated: 2026-10-01
tags: [plugin, bom, routing, cost]
---

# 用户故事：工艺路线本体：工序、工作中心、工时与费率

## 作为/我想要/以便

**作为** 工艺工程师
**我想要** 工序、工作中心、作业类型与费率作为一等实体存在
**以便** BOM 行挂得到真实工序、成本卷算算得出加工费，而不是对着两个悬空的外键

## 交付阶段

| 阶段 | 内容                                                                                                     | 状态 |
| ---- | -------------------------------------------------------------------------------------------------------- | ---- |
| A    | `routing` + `routing_operation` + 最小 `work_center`（编码、组织）：工序序号、描述、所属工作中心、生效期 | ⬜   |
| B    | `activity_type` + `activity_rate`：费率带生效期与币种；`work_center` 补齐成本属性                        | ⬜   |
| C    | 工时模型：`setup_time` / `run_time` / `time_basis`（每件 / 每批 / 固定）                                 | ⬜   |
| D    | 工序损耗 `operation_scrap` 与**每道工序各自的** `scrap_convention`（与 US-511 同一记法）                 | ⬜   |

AC 的阶段归属：A 关闭 AC#1 / #2 / #7 / #8 / #10；B 关闭 AC#3 / #4；C 关闭 AC#5；D 关闭 AC#6 / #9。

## 范围边界

### In Scope

- `routing` 的唯一键与 BOM 头对齐：`(parent_revision_id, org_id, alternative_no)`
- `routing_operation` 的身份是 `(routing_id, operation_seq)`——这正是 US-520 引用完整性要指向的东西
- 费率按 `(work_center, activity_type, valid_from)` 取值，取不到就报错，不以 0 兜底；币种随费率存，卷算时与上下文币种比对（[US-514](US-514-bom-cost-rollup.md) AC#10）
- **路线一律落在本仓**：BOM 头的 `routing_id` 只能指向本仓 `routing`。不存在「路线由外部系统提供、本仓只存一个外部 ID」的半支持态；
  头可以不挂路线（`routing_id` 为 NULL，即无加工工序），但挂了就必须可解析
- 工时三种基数（每件 / 每批 / 固定）在展开与卷算里各自正确

### Out of Scope

- 排产、产能与有限能力计划——属事务域
- 车间报工与实际工时回写
- BOM 行到工序的挂接与分摊（→ [US-520](US-520-bom-routing-operation.md)，本故事只提供被挂接的那一端）
- 工序级投料的数量放大公式（→ [US-511](US-511-bom-quantity-semantics.md) 第 5 步）

## 验收标准

| #   | 前置条件                                     | 操作                        | 预期结果                                                     | 状态 |
| --- | -------------------------------------------- | --------------------------- | ------------------------------------------------------------ | ---- |
| 1   | 某修订的路线含工序 10/20/30                  | 查询                        | 按 `operation_seq` 有序返回，各带工作中心                    | ⬜   |
| 2   | 工序引用不存在的工作中心                     | 保存                        | 拒绝（引用完整性）                                           | ⬜   |
| 3   | 同一 `(work_center, activity_type)` 两段费率 | 按日期取值                  | 命中对应区间；区间重叠在存储层被拒                           | ⬜   |
| 4   | 某工作中心在卷算日期无生效费率               | 卷算                        | 明确报缺失项，**不以 0 兜底**                                | ⬜   |
| 5   | `time_basis = 每批`，批量 ×10                | 卷算                        | 该项工时不随批量线性放大                                     | ⬜   |
| 6   | 工序 20 声明 3% 损耗                         | 读工序                      | 损耗与 `scrap_convention` 可读，记法与 US-511 一致           | ⬜   |
| 7   | 路线整体停用                                 | 按停用后日期解析            | 该路线不入结果，已挂接的 BOM 行报未覆盖而非静默              | ⬜   |
| 8   | BOM 头 `routing_id` 指向本仓不存在的路线     | 保存头                      | 拒绝；不接受「外部路线 ID」                                  | ⬜   |
| 9   | 工序 10 加成制 2%、工序 20 良率制 3%         | 读工序并交给 US-511 第 5 步 | 两道工序各按自己的 convention 计算，不被统一成一种           | ⬜   |
| 10  | 头 `routing_id` 为 NULL                      | 卷算（US-514）              | 加工项为空且明细注明「无路线」；不是缺费率错误，也不是静默 0 | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 技术笔记

**本故事存在的理由是两条悬空引用。** [US-520](US-520-bom-routing-operation.md) 的 AC#5
要求 `operation_seq` 指向不存在的工序时拒绝——引用完整性要成立，被引用的那张表必须存在。
[US-514](US-514-bom-cost-rollup.md) 的加工费项 `(setup + run) × rate(activity, work_center)`
里，`setup` / `run` / `rate` 三个量没有一个在 BOM 侧。US-520 把路线本体列为 Out of Scope 是对的
（挂接点与本体是两件可独立交付的事），但「由外部提供」不是一个可核对的状态。

**唯一键与 BOM 头对齐不是巧合。** 路线随修订走：同一物料的 D 版与 E 版可以有不同工序序列。
键写成 `(parent_revision_id, org_id, alternative_no)` 与
[US-507](US-507-bom-graph-skeleton.md) 的 `bom_header` 同构，US-516 的 EBOM↔MBOM 重构
也因此能在两侧各带自己的路线。

**工序损耗的记法必须与 US-511 共用一套。** 加成制与良率制在 s = 5% 时相差 0.25%；
路线侧若自定一套记法，US-511 第 5 步的 `scrap(·, op.scrap, op.convention)` 就会对着一个语义不同的数计算。
convention 挂在**每道工序**上（AC#9）：同一条路线的工序可能来自不同来源系统。这里只声明字段与语义，累乘的位置仍归 US-511。

**工作中心为什么进阶段 A。** AC#1 要求工序「各带工作中心」、AC#2 要求工作中心引用完整性，若 `work_center` 到 B 才建，
A 就有两条 AC 关不掉。A 只建最小的工作中心（编码、组织），成本相关属性仍在 B。

**没有「外部提供」的半支持态（AC#8 / #10）。** 旧写法允许 US-520 与 US-514 先以「路线由外部系统提供」交付，
但那样 US-520 的引用完整性与 US-514 的加工费都对着一个本仓无法核对的 ID——要么静默接受、要么静默算 0。
所以挂接必须指向本仓路线；真没有路线的头显式为 NULL，卷算里明示「无路线」，与「有路线但缺费率」（AC#4）区分开。

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
- [US-520 工艺路线挂接与工序投料分摊](US-520-bom-routing-operation.md) — 消费 `(routing_id, operation_seq)` 的引用完整性
- [US-514 成本卷算](US-514-bom-cost-rollup.md) — 消费工时与费率
- [US-511 展开数量正确性](US-511-bom-quantity-semantics.md) — 工序损耗记法的共用来源
- [US-030 实体元数据层的声明式存储约束](../core/US-030-declarative-storage-constraints.md) — AC#3 的区间排他落点（阶段 C）
