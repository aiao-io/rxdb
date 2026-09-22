---
id: US-515
title: 变更管理（ECN）驱动的生效期
status: Backlog
priority: Low
epic: epic-009-bom-domain-model
created: 2026-09-22
updated: 2026-09-22
tags: [plugin, bom, change-management]
---

# 用户故事：变更管理（ECN）驱动的生效期

## 作为/我想要/以便

**作为** 变更管理员
**我想要** 一个 ECN 同时改多张 BOM 的多行，且行的生效日由 ECN 派生
**以便** 回答「这次变更影响哪些整机」与「变更前后差异是什么」

## 范围边界

### In Scope

- `ecn` 实体：单号、状态、生效日、变更原因
- `bom_line.ecn_in_id` / `ecn_out_id` 记录「被哪次变更引入 / 失效」
- `valid_from` 从 `ecn.effective_date` **派生**，不手填
- 影响面查询（经 where-used）与变更前后行集差异

### Out of Scope

- 审批流与工作流引擎
- 变更对库存/在制订单的处置（属事务域）

## 验收标准

| #   | 前置条件                       | 操作     | 预期结果                                           | 状态 |
| --- | ------------------------------ | -------- | -------------------------------------------------- | ---- |
| 1   | 一个 ECN 改 3 张 BOM 的 5 行   | 查影响面 | 列出受影响整机（经 where-used 闭包）               | ⬜   |
| 2   | 同上                           | 查差异   | 返回变更前后行集对比：新增 / 删除 / 改量 / 改版    | ⬜   |
| 3   | ECN 改生效日                   | 保存     | 关联 5 行的 `valid_from` 级联更新                  | ⬜   |
| 4   | ECN 取消                       | 保存     | 关联行整体回退，不留半生效状态                     | ⬜   |
| 5   | 手填与 ECN 冲突的 `valid_from` | 保存     | 拒绝——生效日的真相源是 ECN                         | ⬜   |
| 6   | 两个 ECN 改同一行              | 先后生效 | 行按生效日形成不重叠的时间序列（配合 US-508 AC#2） | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 技术笔记

「BOM 头版本 + 行生效期」不等于变更管理：版本回答「这张 BOM 长什么样」，
ECN 回答「**这次改动**动了哪些 BOM 的哪些行」。没有 ECN 实体，AC#1 与 AC#2 都无从实现——
影响面与差异都是以「一次变更」为单位的查询，而那个单位在模型里必须有对应物。

AC#3 与 AC#5 合起来确立单一真相源：`ecn.effective_date` 是源，`bom_line.valid_from` 是派生冗余
（冗余存在的理由是让 US-508 的视图解析不必每次 join ECN）。冗余字段必须由源级联维护，
否则就是第二个真相源。

AC#4 的「不留半生效状态」需要事务保证：一次 ECN 取消可能涉及跨多张 BOM 的数十行。

## 价值待证

同 [epic-009](../../epics/epic-009-bom-domain-model.md#价值待证整个-epic)。

## 实现文件

- `packages/rxdb-plugin-bom/` — 待建；ECN 实体与派生生效期

## References

- [epic-009 BOM 领域模型](../../epics/epic-009-bom-domain-model.md)
- [US-508 BOM 视图解析](US-508-bom-view-resolution.md) — 前置
