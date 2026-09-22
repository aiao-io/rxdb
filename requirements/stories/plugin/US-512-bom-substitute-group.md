---
id: US-512
title: 替代组与替代策略
status: Backlog
priority: Low
epic: epic-009-bom-domain-model
created: 2026-09-22
updated: 2026-09-22
tags: [plugin, bom, schema]
---

# 用户故事：替代组与替代策略

## 作为/我想要/以便

**作为** BOM 工程师
**我想要** 替代关系作为「组」存在、策略挂在组上
**以便** MRP 能按概率分摊需求，且单向可替代不被误当成双向

## 范围边界

### In Scope

- `bom_substitute_group` 作为一等实体：`strategy`（priority / proportional / manual）、`allow_mix`
- 行侧：`substitute_group_id`、`substitute_priority`、`usage_probability`
- 组内偏序：A 可用 B 代、B 不可用 A 代
- 展开时按策略分摊或择一

### Out of Scope

- 临时代用（带审批与限量的例外流程）——属事务域，不进 BOM 主数据
- 替代件的采购/库存联动

## 验收标准

| #   | 前置条件                                       | 操作           | 预期结果                               | 状态 |
| --- | ---------------------------------------------- | -------------- | -------------------------------------- | ---- |
| 1   | 组 strategy=proportional，三行概率 0.5/0.3/0.2 | 展开           | 需求按比例分摊，合计等于总需求         | ⬜   |
| 2   | 同组改为 strategy=priority                     | 展开           | 只取 `substitute_priority` 最高的行    | ⬜   |
| 3   | A 可用 B 代、B 不可用 A 代                     | 反向替代校验   | 组内偏序生效，反向被拒                 | ⬜   |
| 4   | `allow_mix = false`                            | 混用两个替代件 | 拒绝                                   | ⬜   |
| 5   | strategy=proportional，概率合计 ≠ 1            | 保存           | 拒绝或归一化，行为在契约里明确且不静默 | ⬜   |
| 6   | 组内某行失效（US-508 有效期）                  | 展开           | 该行退出分摊，剩余行按策略重新分配     | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 技术笔记

**替代料不能用「平行边 + 行属性」表达**，三条理由：

1. `strategy` 与 `allow_mix` 是**组的属性**，不是行的属性——放在行上就会出现同组各行策略不一致的非法态；
2. 单向可替代是**组内偏序**，边上放不下；
3. `usage_probability` 的归一化约束（AC#5）需要一个能承载「组」这个整体的实体。

`bom_substitute_group` 的唯一键是 `(bom_header_id, code)`——替代组隶属于某张 BOM，不跨 BOM 复用。
跨 BOM 复用的互换关系属于物料主数据的互换组，是另一个概念，不在本故事。

## 价值待证

同 [epic-009](../../epics/epic-009-bom-domain-model.md#价值待证整个-epic)。

## 实现文件

- `packages/rxdb-plugin-bom/` — 待建；替代组实体与分摊计算

## References

- [epic-009 BOM 领域模型](../../epics/epic-009-bom-domain-model.md)
- [US-511 展开数量正确性](US-511-bom-quantity-semantics.md) — 前置
