---
id: RV-003
title: 写入口矩阵「只更新 remoteId」行自相矛盾：「只更新」与「不改变业务表」冲突
status: Open
created: 2026-08-22
updated: 2026-08-22
pr:
---

# Review：写入口矩阵 remoteId 行「不改变业务表」措辞与自身矛盾

## 问题

[epic-006:173](../epics/epic-006-working-tree-commits.md:173) 写「只更新 remoteId、同步水位或审计时间 →
**不改变业务表**，不创建工作树单元，不递增 working-tree revision」。

remoteId 回填本身就是对实体行的 UPDATE，行的前半句（「只更新 remoteId」）与后半句（「不改变业务表」）
字面冲突。plan 阶段可能被误读为「表有写就必须记工作树单元」，把纯回填路径强行计入工作树。

## 根因

想表达的是「不构成**业务实体净变化**」，但写成了「不改变业务表」。同一口径在
[US-306 US2-AC18](../stories/collaboration/US-306-working-tree-index.md:176) 的表述是对的
（「没有业务实体变化」），Epic 矩阵在转述时丢了「净」字。

## 修复方案

把该行改为「不构成业务实体净变化，不创建工作树单元，不递增 working-tree revision」，与 US2-AC18 口径对齐。

## 审查结论（2026-08-22 复核）

**成立（措辞缺陷）。** remoteId 回填在物理上就是对实体行的 UPDATE，原文「不改变业务表」与之直接矛盾，
按字面实现会得出「该 UPDATE 必须被门禁拦下」的错误结论。

**已修复**：epic-006 写入口矩阵该行改为「**不构成业务实体净变化**（remoteId 回填本身是对实体行的
UPDATE），不创建工作树单元，不递增 working-tree revision」，与 US-305 US2-AC18 口径一致。

## 解决记录

- [x] 文档修复已落在工作区（见「审查结论」）
- [ ] 开 PR 修复（`pr` 字段记录链接）
- [ ] PR 合并，`status: Resolved`
