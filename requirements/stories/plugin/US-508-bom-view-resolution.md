---
id: US-508
title: BOM 视图解析：类型/组织/修订/生效期过滤
status: Backlog
priority: Low
epic: epic-009-bom-domain-model
created: 2026-09-22
updated: 2026-10-01
tags: [plugin, bom, query]
---

# 用户故事：BOM 视图解析：类型/组织/修订/生效期过滤

## 作为/我想要/以便

**作为** BOM 工程师
**我想要** 按一个显式的解析上下文 `ResolutionContext` 解析出唯一一份有效行集
**以便** 同一物料在不同工厂、不同时点看到正确的结构，且同一上下文永远得到同一结果

## 范围边界

### In Scope

- **`ResolutionContext`**：`bom_type`、`org_id`、`as_of_date`、父修订选择、`alternative_no` 选择策略；
  [US-517](US-517-configurable-sales-bom.md) 的配置与 [US-518](US-518-bom-unit-lot-effectivity.md) 的序列/批次在各自阶段扩入同一上下文，
  不另开第二套入参。`as_of_date` **必填**，缺失即拒绝，不读系统时钟、不默认今天
- 修订选择：precise 行锁版；imprecise 行取 `state = 'released'` 且 `effective_from ≤ as_of_date` 的修订中 `effective_from` 最大者。
  同一物料两个已发布修订的 `effective_from` 相同属非法态，在发布时拒绝，所以「最新」唯一
- **禁止追溯生效**：修订发布、头发布与 ECN 发布时，`effective_from` 不得早于发布当日。由此「对过去日期的结构解析」
  不会被之后的发布改写——这是本故事提供的历史保证，见技术笔记「历史查询的边界」
- 日期区间有效性：行发生项（[US-507](US-507-bom-graph-skeleton.md)）的 `[effective_from, effective_to)` 半开区间
- 区间排他作用域是**同一逻辑行的发生项**（`bom_line_id`），声明式约束而非应用层校验
- 多个 `alternative_no` 并存不被重叠约束误拒——备选 BOM 本该同时有效
- `alternative_no` 的选择规则放**策略层**（按批量区间 / 按工厂优先 / 手动指定），不写进 SQL；策略选不出唯一备选时，
  结果标 `unresolved` 并列出候选，交给调用方，不擅自挑一个
- 解析结果附带 **resolution manifest**：命中的头、修订、行发生项 ID 与上下文，供下游审计与比对

### Out of Scope

- 序列与批次有效性（→ US-518）
- 跨 `bom_type` 的解析——EBOM→MBOM **不是视图**，是重构（→ US-516）
- ECN 派生生效日（→ US-515）
- 换算率、公式参数、费率的时间版本化与「精确重放当年计算」——manifest 只记录结构依据，见技术笔记

## 验收标准

| #   | 前置条件                                           | 操作                                        | 预期结果                                         | 状态 |
| --- | -------------------------------------------------- | ------------------------------------------- | ------------------------------------------------ | ---- |
| 1   | 同一父件在两个 org 各有 BOM                        | 按 org 解析                                 | 各自返回自己的行集，互不串                       | ⬜   |
| 2   | 同一逻辑行已有一段有效期发生项                     | 插入重叠区间的发生项（子件同或不同）        | 存储层拒绝，错误指出冲突区间                     | ⬜   |
| 3   | 同一父件有 3 个 `alternative_no`                   | 解析                                        | 三者均可有效，不被重叠约束误拒                   | ⬜   |
| 4   | 逻辑行发生项在 2026-01-01 失效、新发生项同日生效   | 按该日解析                                  | 只返回新发生项，无空窗也无重叠                   | ⬜   |
| 5   | `bom_header.state = 'draft'`                       | 解析                                        | 草稿头不入结果                                   | ⬜   |
| 6   | 父件有 D / E 两个已发布修订                        | 按时点解析                                  | 命中该时点生效的修订，头随修订走，无第二条版本轴 | ⬜   |
| 7   | 任意数据                                           | 不传 `as_of_date` 解析                      | 拒绝，错误点名缺失的上下文字段                   | ⬜   |
| 8   | 同一数据集                                         | 改系统时钟后按同一 `as_of_date` 再解析      | 结果与 manifest 完全相同                         | ⬜   |
| 9   | 2026-10-01 按 2026-09-30 解析得结果 R              | 发布 `effective_from = 2026-09-15` 的新修订 | 发布被拒（追溯生效）；按 2026-09-30 再解析仍得 R | ⬜   |
| 10  | 同一物料已发布修订 D `effective_from = 2026-11-01` | 发布同为 2026-11-01 的修订 E                | 拒绝：「最新修订」不唯一                         | ⬜   |
| 11  | 同一父件两个备选、策略为「手动」但未指定           | 解析                                        | 结果标 `unresolved` 并列出两个候选；不擅自挑一个 | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 技术笔记

区间排他的作用域**必须精确到同一逻辑行 `bom_line_id`**，不能对整表施加：
多个 `alternative_no` 与多个替代行（US-512）本来就该并存，全局禁重叠会把正常数据拒掉。
也不能是 `(bom_header_id, line_no, child_item_id)`：那样同一逻辑行同一时段换成另一子件就能两条都生效，
等于一行同时是两种东西。PGlite 侧可用 `daterange` + GiST `EXCLUDE`；SQLite 侧无此能力，退回触发器等价物，
两侧的**错误语义必须一致**（见 US-521 AC#2 的逐行报错要求）。这两项声明能力本仓当前都没有，
落点是 [US-030](../core/US-030-declarative-storage-constraints.md) 阶段 B 与 C。

**「版本」在本故事里只有一个意思：修订。** `bom_header` 挂 `parent_revision_id`
（[US-507](US-507-bom-graph-skeleton.md)），所以视图的四个轴是类型、组织、修订与时点；
`alternative_no` 是并行备选（AC#3），不是版本轴，这正是 AC#2 的重叠约束不能覆盖它的原因。

**历史查询的边界。** 「按当前知识查询过去适用的结构」与「重放当年那次计算」是两种能力，本故事只承诺前者，
并用一条规则让前者足够稳定：**任何发布都不得追溯生效**（AC#9）。修订、头与行发生项一经发布不可改写
（[US-507](US-507-bom-graph-skeleton.md) AC#10），ECN 已生效后不可取消或提前（[US-515](US-515-bom-change-management.md)），
于是对过去日期的结构解析只依赖当时已发布的数据，之后的发布改不了它。

结构之外的输入——单位换算率、`qty_formula` 参数、费率——本 Epic 不做时间版本化，它们变了，旧日期的数量与成本会跟着变。
manifest 记录结构依据（头、修订、发生项 ID），[US-511](US-511-bom-quantity-semantics.md) 与 [US-514](US-514-bom-cost-rollup.md)
再把各自用到的换算率、参数与费率值追加进去，下游可以比对两次 manifest 判断差异来自哪一层；但 manifest 不是重放引擎，
「拿旧 manifest 重新算出当年数字」需要真实驱动场景再立项。

**`unresolved` 不是错误，也不是结果。** 探索性浏览（[US-522](US-522-bom-tri-framework-ui.md)）可以展示候选集；
需要完整结构的消费方——[US-514](US-514-bom-cost-rollup.md) 卷算、[US-521](US-521-bom-erp-mrp-integration.md) 导出——遇到 `unresolved` 一律拒绝，
不能把候选集当作已选结构。

## 价值待证

同 [epic-009](../../epics/epic-009-bom-domain-model.md#价值待证整个-epic)。

## 实现文件

- `packages/rxdb-plugin-bom/` — 待建；视图解析查询与有效期约束

## References

- [epic-009 BOM 领域模型](../../epics/epic-009-bom-domain-model.md)
- [US-507 BOM 图骨架](US-507-bom-graph-skeleton.md) — 前置；`bom_header` 的修订归属与两层行身份
- [US-030 实体元数据层的声明式存储约束](../core/US-030-declarative-storage-constraints.md) — AC#2 的区间排他落点
