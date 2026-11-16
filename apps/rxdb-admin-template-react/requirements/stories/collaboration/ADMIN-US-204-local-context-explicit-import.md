---
id: ADMIN-US-204
title: 本地数据上下文隔离与显式导入
status: Backlog
priority: High
epic: ADMIN-EPIC-002
created: 2026-11-16
updated: 2026-11-16
tags: [admin, local-first, import, isolation, collaboration]
dependsOn: [ADMIN-US-201, ADMIN-US-202, ADMIN-US-203]
capabilities: [rxdb:US-203]
---

# 用户故事：本地数据上下文隔离与显式导入

## 作为/我想要/以便

**作为** 已登录的 Admin 使用者
**我想要** 明确选择团队并决定是否导入已有本机数据
**以便** 保留 local-first 使用习惯，同时避免登录后把匿名数据、样例数据或其他团队数据意外上传。

## 范围边界

### In Scope

- 以用户、团队、应用和当前数据上下文隔离本地库、缓存、查询、草稿与同步队列。
- 首次接入团队时明确提供“使用空的团队数据”与“预览后导入已有本机数据”等选择。
- 导入前显示记录数量、实体范围和潜在冲突；确认后导入为待审核的本地变更或任务草稿。
- 账户、团队或会话切换后恢复对应上下文；会话失效不清理本机内容。

### Out of Scope

- 自动合并匿名库与团队共享数据、跨团队导入和字段级迁移向导。
- 直接把导入内容写入共享数据；导入后的合并由数据 PR 故事验收。

## 验收标准

| # | 前置条件 | 操作 | 预期结果 | 状态 |
| --- | --- | --- | --- | --- |
| 1 | 本机已有匿名数据，用户首次登录并选择团队 | 进入工作台 | 不自动上传、删除或合并旧数据；先要求用户选择当前数据上下文 | ⬜ |
| 2 | 用户选择导入已有本机数据 | 查看预览并确认导入 | 显示记录数量、实体范围和冲突提示；确认后数据进入当前团队的任务草稿或待提交变更，不改变共享数据 | ⬜ |
| 3 | 用户在两个团队之间切换 | 查看列表、搜索、草稿和同步状态 | 只读当前团队上下文；切回原团队后能恢复原数据，两个团队之间没有缓存、查询或草稿串线 | ⬜ |
| 4 | 用户退出或会话失效 | 重新打开本机 | 本地保存和待同步草稿仍可恢复；云端查询、推送和合并暂停，重新认证后才能继续 | ⬜ |
| 5 | 当前上下文被刷新或另一个标签页打开 | 执行查询、保存或同步 | 所有入口使用同一上下文键；不会使用上一次登录用户或团队的残留状态 | ⬜ |
| 6 | Angular、React、Vue 使用相同账户和团队 | 执行首次接入、切换和导入 | 导入确认语义、隔离边界和共享数据结果一致 | ⬜ |

验收证据：待实现后补充匿名库接入、双团队切换、导入预览和会话失效的三端浏览器用例。

## 技术笔记

本故事要求把“本地保存”“云端同步”“合并到共享数据”分成不同状态和命令。上下文键必须进入数据库名、偏好键、同步过滤条件和本地缓存索引；不能只用 React、Angular 或 Vue 的内存状态隔离。导入操作应产生可审查的任务变更，而不是静默调用共享表写入。

## 实现文件

- `apps/rxdb-admin-template-react/src/app/rxdb/` — 本地库和上下文键接线。
- `apps/rxdb-admin-template-react/src/app/import/` — 导入预览与确认流程。
- `apps/rxdb-admin-template-angular/src/app/`、`apps/rxdb-admin-template-vue/src/app/` — 三端等价入口。

## References

- [ADMIN-US-201](ADMIN-US-201-supabase-email-otp-session.md)
- [ADMIN-US-202](ADMIN-US-202-team-membership-workspace.md)
- [ADMIN-US-203](ADMIN-US-203-permission-server-isolation.md)
- [Supabase 远程适配器](../../../../../requirements/stories/adapter/US-203-supabase-adapter.md)
- [ADMIN-EPIC-002](../../epics/ADMIN-EPIC-002.md)
