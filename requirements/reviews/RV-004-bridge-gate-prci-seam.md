---
id: RV-004
title: bridge 血统门禁的「进 PR CI」接线在 epic-006 与 epic-007 之间无人认领
status: Open
created: 2026-08-22
updated: 2026-08-22
pr:
---

# Review：bridge 门禁逻辑归 US-305，PR CI 接线归谁两个 Epic 都没写清

## 问题

本 Epic 的发布门禁 1（[epic-006:374](../epics/epic-006-working-tree-commits.md:374)）与
[US-305 AC US2-14](../stories/collaboration/US-305-commit-graph-head.md:133) 依赖的 bridge 血统门禁，
其门禁**逻辑**由 US-305 自己落地（US-305 测试要求写了「桥接血统门禁需独立用例」，见
[US-305:226](../stories/collaboration/US-305-commit-graph-head.md:226)）。

但「三个 git 钩子（`bridgeTagExists` / `bridgeTagIsAncestor` / `bridgeTagSupportsProtocol`）进入 PR CI，
而不只在打 tag 时跑」是 [epic-007:31](../epics/epic-007-public-api-gates.md:31) 的目标之一，且明写
「**尚无故事认领**」。epic-006 的边界表（[epic-006:400](../epics/epic-006-working-tree-commits.md:400)）
只声明「不扩大 epic-007 覆盖面、不改其检查项与阈值」，没有划「钩子接线」这条接缝。

风险：AC US2-14 的门禁只存在于打 tag 的发布流程、PR CI 里不跑；或 US-305 与 epic-007 的认领故事
两边重复实现同一套钩子。

## 根因

同一个门禁的「逻辑实现」与「CI 接线」分属两个 Epic 的两个目标，而边界表只处理了覆盖面重叠，
没处理交付物接缝。

## 修复方案

在 epic-006 边界表或依赖顺序中补一句接缝归属，例如：门禁逻辑归 US-305（FR-030 / AC US2-14）；
钩子进 PR CI 的接线按 epic-007 的认领故事执行，若 epic-007 未认领，US-305 至少保证发布门禁 1
在发布流程可执行——两边都不得在对方未落地的假设上开工。

## 审查结论（2026-08-22 复核）

**成立。** 已核对 [epic-007:31-33](../epics/epic-007-public-api-gates.md)：三个 git 钩子进 PR CI 的事项
在 epic-007 里明确写着「**尚无故事认领**」，而 epic-006 又把「门禁进 PR CI」当成既定接线。接缝两侧都没有
owner，双方都可能默认对方会做。

**已修复**：epic-006 新增「### bridge 血统门禁的接缝（发布门禁 1）」小节，逐条写明——门禁**逻辑**归
US-305（FR-030 / AC US2-14）且 MUST 在**发布流程**中可执行；**钩子接进 PR CI** 归 epic-007 且当前无人认领、
**不属本 Epic 交付范围**；两边都不得在对方未落地的假设上开工。

## 解决记录

- [x] 文档修复已落在工作区（见「审查结论」）
- [ ] 开 PR 修复（`pr` 字段记录链接）
- [ ] PR 合并，`status: Resolved`
