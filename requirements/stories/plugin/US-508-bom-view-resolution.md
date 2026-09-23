---
id: US-508
title: BOM 视图解析：类型/组织/修订/生效期过滤
status: Backlog
priority: Low
epic: epic-009-bom-domain-model
created: 2026-09-22
updated: 2026-09-22
tags: [plugin, bom, query]
---

# 用户故事：BOM 视图解析：类型/组织/修订/生效期过滤

## 作为/我想要/以便

**作为** BOM 工程师
**我想要** 按 `(bom_type, org_id, as_of_date, state)` 解析出唯一一份有效行集
**以便** 同一物料在不同工厂、不同时点看到正确的结构

## 范围边界

### In Scope

- 修订选择：precise 行锁版、imprecise 行跟随该时点的最新发布修订（`state = 'released'`）
- 日期区间有效性：`valid_from` / `valid_to` 与派生的 `effective_range`
- 同一 `(header, line_no, child_item)` 的有效期**不得重叠**，声明式约束而非应用层校验
- 多个 `alternative_no` 并存不被重叠约束误拒——备选 BOM 本该同时有效
- `alternative_no` 的选择规则放**策略层**（按批量区间 / 按工厂优先 / 手动指定），不写进 SQL

### Out of Scope

- 序列与批次有效性（→ US-518）
- 跨 `bom_type` 的解析——EBOM→MBOM **不是视图**，是重构（→ US-516）
- ECN 派生生效日（→ US-515）

## 验收标准

| #   | 前置条件                            | 操作             | 预期结果                                         | 状态 |
| --- | ----------------------------------- | ---------------- | ------------------------------------------------ | ---- |
| 1   | 同一父件在两个 org 各有 BOM         | 按 org 解析      | 各自返回自己的行集，互不串                       | ⬜   |
| 2   | 同一 line_no 同一子件已有一段有效期 | 插入重叠区间     | 存储层拒绝，错误指出冲突区间                     | ⬜   |
| 3   | 同一父件有 3 个 `alternative_no`    | 解析             | 三者均可有效，不被重叠约束误拒                   | ⬜   |
| 4   | 行在 2026-01-01 失效、新行同日生效  | 按该日解析       | 只返回新行，无空窗也无重叠                       | ⬜   |
| 5   | `bom_header.state = 'draft'`        | 按 released 解析 | 草稿头不入结果                                   | ⬜   |
| 6   | 父件有 D / E 两个已发布修订         | 按时点解析       | 命中该时点生效的修订，头随修订走，无第二条版本轴 | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 技术笔记

重叠约束的作用域**必须精确到 `(bom_header_id, line_no, child_item_id)`**，不能对整表施加：
多个 `alternative_no` 与多个替代行（US-512）本来就该并存，全局禁重叠会把正常数据拒掉。
PGlite 侧可用 `daterange` + GiST `EXCLUDE`；SQLite 侧无此能力，退回触发器等价物，
两侧的**错误语义必须一致**（见 US-521 AC#2 的逐行报错要求）。这两项声明能力本仓当前都没有，
落点是 [US-030](../core/US-030-declarative-storage-constraints.md) 阶段 B 与 C。

**「版本」在本故事里只有一个意思：修订。** `bom_header` 挂 `parent_revision_id`
（[US-507](US-507-bom-graph-skeleton.md)），所以视图的四个轴是类型、组织、修订与时点；
`alternative_no` 是并行备选（AC#3），不是版本轴，这正是 AC#2 的重叠约束不能覆盖它的原因。

## 价值待证

同 [epic-009](../../epics/epic-009-bom-domain-model.md#价值待证整个-epic)。

## 实现文件

- `packages/rxdb-plugin-bom/` — 待建；视图解析查询与有效期约束

## References

- [epic-009 BOM 领域模型](../../epics/epic-009-bom-domain-model.md)
- [US-507 BOM 图骨架](US-507-bom-graph-skeleton.md) — 前置；`bom_header` 的修订归属
- [US-030 实体元数据层的声明式存储约束](../core/US-030-declarative-storage-constraints.md) — AC#2 的区间排他落点
