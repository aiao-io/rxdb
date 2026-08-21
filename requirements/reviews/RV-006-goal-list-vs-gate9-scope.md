---
id: RV-006
title: 目标清单口径与发布门禁 9 / 性能预算节不一致
status: Open
created: 2026-08-22
updated: 2026-08-22
pr:
---

# Review：目标清单第 8 条漏项、缺性能预算条目

## 问题

两处口径不一致：

1. 目标清单第 8 条（[epic-006:30](../epics/epic-006-working-tree-commits.md:30)）只列 5 项文档内容
   （启用方式、与草稿缓存的区别、恢复语义、历史保留旧值风险、加密边界），而它指向的发布门禁 9
   （[epic-006:387](../epics/epic-006-working-tree-commits.md:387)）是 6 项（另有「不改写历史的承诺」），
   承接场景 [US-306 US5-AC8](../stories/collaboration/US-306-working-tree-index.md:218) 还要求明示
   `origin=remote_sync` 会弄脏工作树。
2. 目标清单没有性能预算条目。性能预算节（[epic-006:346](../epics/epic-006-working-tree-commits.md:346)）
   有明确归属（status/diff/stage → US-306 阶段 C，restore → US-307），不算「无主缺口」；但 Epic 自己
   声明目标是「用户视角的最终能力、没有归属的条目就是缺口」，却让一个有发布门禁（门禁 7）的能力
   在目标清单里缺席，读者无法从目标清单反查到它。

## 根因

目标清单在文档演进中落后于门禁与性能预算两节。

## 修复方案

1. 目标第 8 条补「不改写历史的承诺」与 remote_sync 说明，与门禁 9 / US5-AC8 对齐。
2. 目标清单补一行性能预算条目，归属 US-306 阶段 C 与 US-307。

## 审查结论（2026-08-22 复核）

**成立（轻微）。** 目标清单第 8 条比发布门禁 9 少一项——门禁 9 要求文档明示远端同步会产生
`origin=remote_sync` 的未提交变化（US-306 US4-AC8），目标清单没写；性能预算在门禁 7 与「性能预算的口径」
一节里有要求，目标清单同样没有对应条目。

**已修复**：epic-006 目标清单第 8 条补上 `origin=remote_sync` 明示义务，并新增一条性能预算目标
（status / diff / stage / restore 可被冻结基准复核，环境不匹配不产出绿色发布结论），归属 US-306 阶段 C 与 US-307。
门禁 9 同步改为「这 6 项」并显式点名 remote_sync。

## 解决记录

- [x] 文档修复已落在工作区（见「审查结论」）
- [ ] 开 PR 修复（`pr` 字段记录链接）
- [ ] PR 合并，`status: Resolved`
