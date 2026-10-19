---
id: US-531
title: 三框架看板视图与交互
status: Backlog
priority: Low
epic: epic-010-task-board-domain-model
created: 2026-10-19
updated: 2026-10-19
tags: [domain, board, angular, react, vue, ui]
---

# 用户故事：三框架看板视图与交互

## 作为/我想要/以便

**作为** 三端 demo 的维护者与看板模型的接入者
**我想要** Angular / React / Vue 三端各有一份功能相同的看板视图——板 / 列 / 卡片、拖拽、详情
对话框、搜索框、备份入口
**以便** 看板领域模型一次定义、三端一致消费，单端缺失不算完成

## 范围边界

### In Scope

- **看板视图**：列横向排列、任务卡片纵向堆叠、卡片显示标题与标签（颜色条）；三端同功能同 API
  （铁律：Angular / React / Vue 同功能同 API，单端缺失 = 未完成）
- **真实拖拽**：三端 Playwright 用真实拖拽验收（US-028 阶段 B 先例），拖动落点判定三端共用
  同一张判定表（[US-527](US-527-cross-column-move-ordering.md) 技术笔记）
- **详情对话框**：复用三端 rxdb-model `EntityDetail`，任务字段接线随
  [US-528](US-528-task-detail-editing.md)
- **搜索框**：三端 `useSearch()` 接线随 [US-530](US-530-board-task-search.md)（阶段 B 起）
- **备份入口**：导出 / 恢复按钮与四态反馈随 [US-529](US-529-board-backup-restore.md)
- **权限派生**：按 `deriveEntityCapabilities()` 派生入口（US-027 阶段 C 已交付的派生模式），
  只读上下文下拖拽与编辑入口关闭
- **无障碍**：三端 e2e 各带 axe 用例（rxdb-model 先例：三端 a11y e2e）

### Out of Scope

- 单端 demo 应用（→ [US-532](US-532-board-end-to-end-demo.md)：`apps/dev-rxdb-board` 单端即可，
  先例 US-525 / US-214）
- 团队同步 UI（→ [US-533](US-533-board-team-sync.md)）
- 通用可复用组件库——本故事交付**看板的**三端视图，不是第四个通用实体 UI 库

## 验收标准

| #   | 前置条件                       | 操作                                              | 预期结果                                                                            | 状态 |
| --- | ------------------------------ | ------------------------------------------------- | ----------------------------------------------------------------------------------- | ---- |
| 1   | 三端各有一个看板页，同一份种子 | 打开三端页面                                      | 三端渲染同一份板 / 列 / 卡片（结构快照一致，归一化后逐项相同——T049 对拍的同款口径） | ⬜   |
| 2   | 三端各执行同一组拖拽操作       | Playwright 真实拖拽：跨列两邻之间、空列、同列改序 | 三端拖拽后 DB 重查结果一致（US-028 AC#18 先例）；三端落点判定表同一张               | ⬜   |
| 3   | 单端打开任务详情               | 改标题并保存                                      | 三端详情对话框功能一致（rxdb-model `EntityDetail` 复用，无第二套详情 UI）           | ⬜   |
| 4   | 三端各执行导出 → 清库 → 恢复   | 走备份入口                                        | 三端备份入口行为一致（US-529 AC 语义，含不支持连接形态的如实提示）                  | ⬜   |
| 5   | 搜索框（阶段 B 起）            | 三端各搜同一关键词                                | 结果一致（US-530 语义）                                                             | ⬜   |
| 6   | 只读上下文                     | 打开看板页                                        | 三端拖拽与编辑入口一致关闭（`deriveEntityCapabilities()` 派生）                     | ⬜   |
| 7   | 三端页面                       | 跑 axe 用例                                       | 三端无障碍通过（拖拽手柄可键盘操作或提供等价键盘路径）                              | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 技术笔记

**三框架对称是铁律，不是目标。** 本故事的关闭条件是「三端同功能同 API」，任何单端先行的
交付都不算完成（AGENTS.md 铁律：单框架实现禁止）。对称的判据沿用仓库已有机器：跨框架对拍
（`modules/e2e-parity/entity-model-parity.mjs` 的归一化快照口径，T049 已落地）与
`tri-framework-check`（`.claude/skills/tri-framework-check`，T050 用它修复过 7 处不对称）。

**落点判定表三端同一张，是 US-031 教训的直接复用。** 三端 demo 曾在「懒加载拖进未展开节点
算出 a0 撞键」这类落点语义上分叉（US-031 症状），最终以「三端同一张落点判定表与三等分落点
区间」收口。看板从第一天就用同一张表（[US-527](US-527-cross-column-move-ordering.md) 已把落点
换算定为领域服务），三端 UI 不各自算落点。

**保留的端差异要有设计理由。** React `*Props` 接口、Vue `defineExpose` 守卫、Angular input
别名这类端差异是 rxdb-model 三包已复核过的设计选择（T050），看板视图沿用同款边界：差异写进
源文件注释互相声明等价，不靠口头约定。

**落点：`packages/rxdb-plugin-board`** 的三框架绑定（BOM 先例：US-522 的绑定在
`packages/rxdb-plugin-bom`），三端 demo 各自消费。

**关闭条件**：三端看板页结构快照一致；真实拖拽后 DB 重查一致且落点判定表同一张；详情 /
备份 / 搜索三端行为一致；权限派生一致；axe 通过。

## 价值待证

本故事已随 [epic-010 解锁记录](../../epics/epic-010-task-board-domain-model.md#价值待证整个-epic)
解锁（2026-10-19，owner 决定）：三端看板视图对应零个已知病灶，「病灶数 ≥ 抽象数」按 owner
决定豁免（演示价值入场），依据与边界见 epic。

## 实现文件

- `packages/rxdb-plugin-board/` — 待建；三框架绑定（board 视图、拖拽、详情 / 搜索 / 备份接线）

## References

- [epic-010 任务看板领域模型](../../epics/epic-010-task-board-domain-model.md)
- [US-526](US-526-board-column-task-skeleton.md) / [US-527](US-527-cross-column-move-ordering.md) / [US-528](US-528-task-detail-editing.md) / [US-529](US-529-board-backup-restore.md) / [US-530](US-530-board-task-search.md) — 前置语义
- [US-031 树形实体迁移到排序模块](../core/US-031-tree-sortable-migration.md) — 三端落点判定表先例
- [US-028 可排序实体](../core/US-028-sortable-entity.md) — 三端 Playwright 真实拖拽验收先例（阶段 B）
- [US-027 实体操作权限模型](../core/US-027-entity-permission-model.md) — `deriveEntityCapabilities()` 派生
- [US-522 BOM 三框架 UI](US-522-bom-tri-framework-ui.md) — 领域三框架绑定的同型故事
- [roadmap 零散收尾项](../../roadmap.md#零散收尾项不成故事随手可带) — T049 / T050 对拍口径
