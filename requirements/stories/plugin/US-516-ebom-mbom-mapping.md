---
id: US-516
title: EBOM ↔ MBOM 映射与差异对比
status: Backlog
priority: Low
epic: epic-009-bom-domain-model
created: 2026-09-22
updated: 2026-09-22
tags: [plugin, bom, integration]
---

# 用户故事：EBOM ↔ MBOM 映射与差异对比

## 作为/我想要/以便

**作为** 工艺工程师
**我想要** EBOM 与 MBOM 各自是独立的图，由 `bom_map` 关联
**以便** 制造侧能自由新增、拆分、合并与重新分层，而设计变更仍能追到对应的制造行

## 范围边界

### In Scope

- `bom_map`：`source_line_id` ↔ `target_line_id`，多对多，带 `relation`
- `relation` 六态：`one_to_one` / `split` / `merge` / `added` / `removed` / `resequenced`
- `added` / `removed` 允许单边为 NULL
- 同步缺口查询：EBOM 某行变更后，列出需跟进的 MBOM 行

### Out of Scope

- 自动生成 MBOM（转换规则引擎）——本故事只记录人工或外部工具产生的映射
- 工艺路线生成

## 验收标准

| #   | 前置条件                             | 操作                       | 预期结果                               | 状态 |
| --- | ------------------------------------ | -------------------------- | -------------------------------------- | ---- |
| 1   | EBOM 一个钣金件                      | MBOM 拆成板材 + 2 个工序件 | `relation = 'split'`，双向可追溯       | ⬜   |
| 2   | MBOM 含 EBOM 不存在的包装材料        | 建映射                     | `relation = 'added'`，source 侧为 NULL | ⬜   |
| 3   | 多个功能件在制造上一次注塑           | 建映射                     | `relation = 'merge'`                   | ⬜   |
| 4   | EBOM 改一行用量                      | 查同步缺口                 | 列出需跟进的 MBOM 行                   | ⬜   |
| 5   | EBOM 按功能分层、MBOM 按装配顺序分层 | 两侧各自展开               | 层级结构不同且各自自洽，不互相污染     | ⬜   |
| 6   | 某 EBOM 行无任何映射                 | 查覆盖率                   | 报为未覆盖，不静默视作 `removed`       | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 技术笔记

**本故事的关闭条件是「明确不用视图实现」。**

「不同 BOM 类型只是同一张图的不同视图」这个假设在 EBOM→MBOM 上不成立：视图只能做**行的子集**，
而制造侧要做的是**结构重构**——新增 EBOM 里不存在的节点（包装、工装、工序件 WIP）、
把一个零件拆成多个制造步骤、把多个零件合成一次工序、以及按装配顺序整体重新分层（AC#5）。
这四种变换没有一种是子集。

因此 EBOM 与 MBOM 是两张独立的 `bom_header` + `bom_line`，`bom_map` 是它们之间的第三张表。
这张表是 PLM↔ERP 集成的核心资产，不是可选的便利设施——AC#4 的同步缺口查询完全依赖它。

两张头各自挂自己的 `parent_revision_id`（[US-507](US-507-bom-graph-skeleton.md)）：制造侧的分层
与设计侧的修订不同步推进，共用一个修订会让 MBOM 的每次工艺调整都伪装成一次设计变更。
`bom_map` 连的是**行**而非头，两侧修订各走各的不影响映射。

视图过滤仍然适用于**同一 `bom_type` 内**的修订、生效期、组织差异，那部分在
[US-508](US-508-bom-view-resolution.md)。两者的分界就是本故事与 US-508 的分界。

## 价值待证

同 [epic-009](../../epics/epic-009-bom-domain-model.md#价值待证整个-epic)。

## 实现文件

- `packages/rxdb-plugin-bom/` — 待建；`bom_map` 与差异查询

## References

- [epic-009 BOM 领域模型](../../epics/epic-009-bom-domain-model.md)
- [US-508 BOM 视图解析](US-508-bom-view-resolution.md) — 视图与重构的分界
