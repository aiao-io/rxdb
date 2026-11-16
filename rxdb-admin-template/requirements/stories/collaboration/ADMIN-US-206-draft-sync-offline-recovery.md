---
id: ADMIN-US-206
title: 草稿云同步、跨设备续作与离线恢复
status: Backlog
priority: High
epic: ADMIN-EPIC-002
created: 2026-11-16
updated: 2026-11-16
tags: [admin, sync, offline, realtime, collaboration]
dependsOn: [ADMIN-US-205]
capabilities: [rxdb:US-203, rxdb:US-218]
---

# 用户故事：草稿云同步、跨设备续作与离线恢复

## 作为/我想要/以便

**作为** 任务作者
**我想要** 把任务草稿同步到 Supabase，并在另一台设备继续工作
**以便** 获得跨设备协作能力，同时保证草稿同步不会直接改变团队共享数据。

## 范围边界

### In Scope

- 明确区分本地保存、草稿上传/拉取和合并到共享数据三个动作及状态。
- 已认证任务作者可以同步任务分支和提交；另一台设备可以拉取并继续同一任务。
- 离线时允许本地保存，网络恢复后重试待同步操作。
- 使用 Realtime 或增量拉取提示远端草稿变化；同步作用域受团队、用户和任务权限限制。
- 会话失效、权限变化或服务端拒绝时暂停并提供可恢复状态。

### Out of Scope

- 离线直接合并共享数据、无网络时通过前端伪造成功回执。
- 本故事不决定冲突的最终值；冲突处理由 [ADMIN-US-211](ADMIN-US-211-three-way-conflict-preview.md) 验收。

## 验收标准

| #   | 前置条件                                         | 操作                         | 预期结果                                                                       | 状态 |
| --- | ------------------------------------------------ | ---------------------------- | ------------------------------------------------------------------------------ | ---- |
| 1   | 用户有可保存的任务草稿且会话有效                 | 执行同步                     | 任务提交上传到当前团队的任务分支；其他设备可拉取，团队共享数据不改变           | ⬜   |
| 2   | 同一用户在第二台设备登录并有任务权限             | 打开或拉取任务               | 能看到任务名称、提交版本和草稿内容，可继续编辑；重复拉取不会重复创建记录或提交 | ⬜   |
| 3   | 设备处于离线状态                                 | 编辑并保存草稿               | 本地保存成功，状态显示离线或待同步；不会把网络失败误报为共享数据已更新         | ⬜   |
| 4   | 网络恢复且会话仍有效                             | 重试待同步操作               | 按提交版本继续同步，成功后状态可确认；重复重试不会产生重复提交                 | ⬜   |
| 5   | 同步过程中会话过期、权限被收回或服务端拒绝       | 执行同步或自动重试           | 暂停云端操作并说明原因；本地草稿和待同步内容保留，不能以其他用户身份继续       | ⬜   |
| 6   | 远端任务提交或共享数据发生变化，当前设备仍有输入 | 接收通知并继续编辑           | 保留当前输入，提示远端变化并要求在提交或合并前处理版本关系                     | ⬜   |
| 7   | 多个团队或任务同时存在                           | 查看同步状态和 Realtime 通知 | 只显示当前上下文可见的状态；不会把其他团队或任务的通知注入当前草稿             | ⬜   |

验收证据：待实现后补充 Supabase 隔离环境下的双设备、离线重连、会话失效和重复重试测试。

## 技术笔记

同步状态机必须把 `saved locally`、`sync pending`、`synced to task branch` 和 `merged to shared data` 作为不同状态。Supabase 适配器现有 push/pull/Realtime 是底层积木，团队隔离、任务权限和重复提交语义仍需应用层与服务端共同定义。所有重试都应携带提交版本或幂等键。

## 实现文件

- `rxdb-admin-template/apps/react/src/app/sync/` — 同步状态、离线队列和恢复入口。
- `rxdb-admin-template/apps/angular/src/app/sync/`、`rxdb-admin-template/apps/vue/src/app/sync/` — 三端等价入口。
- `packages/rxdb-adapter-supabase/`、`packages/rxdb-plugin-sync/` — Supabase push/pull 与通知接线。

## References

- [ADMIN-US-205](ADMIN-US-205-task-draft-continuous-editing.md)
- [Supabase 远程适配器](../../../../requirements/stories/adapter/US-203-supabase-adapter.md)
- [Supabase RLS 推送完整性](../../../../requirements/stories/adapter/US-218-supabase-rls-push-integrity.md)
- [ADMIN-EPIC-002](../../epics/ADMIN-EPIC-002.md)
