---
id: RV-005
title: v1 状态模型表 IndexState / IndexEntry 行主键缺少 entry 维度
status: Open
created: 2026-08-22
updated: 2026-08-22
pr:
---

# Review：IndexState / IndexEntry 合并一行的主键粒度与 WorkingTreeEntry 行不一致

## 问题

[epic-006:72](../epics/epic-006-working-tree-commits.md:72) 把 `IndexState` / `IndexEntry` 合并成一行，
主键列只写「database + branch」。`IndexState` 是分支级单行水位，database + branch 正确；但 `IndexEntry`
是每分支多条目，主键显然还需要 entry 维度。同表 `WorkingTreeEntry` 行
（[epic-006:71](../epics/epic-006-working-tree-commits.md:71)）写的是「database + branch + unit」，
粒度是对的——两行格式不一致，plan 阶段无法直接从表推 IndexEntry 的唯一键。

## 根因

两个实体压在同一行节省表格空间，主键列只填了 IndexState 的部分。

## 修复方案

拆成两行：`IndexState` 主键 database + branch；`IndexEntry` 主键 database + branch + entry
（unit 维度，与 WorkingTreeEntry 同构）。

## 审查结论（2026-08-22 复核）

**成立。** 已核对 [data-model.md §5.2](../../specs/001-working-tree-commits/data-model.md)：`RxDBIndexEntry`
是**每个 staged 单元一行**，与 `RxDBWorkingTreeEntry` 同粒度。epic-006 的 v1 状态模型表把 `IndexState` 与
`IndexEntry` 挤在一行、主键只写到 database + branch，粒度与已冻结数据模型不一致。

**已修复**：epic-006 状态模型表拆成两行——`IndexState`（database + branch，`indexRevision` 做 CAS）与
`IndexEntry`（database + branch + **unit**，随 stage / unstage 原子增删，与 `WorkingTreeEntry` 同粒度）。

## 解决记录

- [x] 文档修复已落在工作区（见「审查结论」）
- [ ] 开 PR 修复（`pr` 字段记录链接）
- [ ] PR 合并，`status: Resolved`
