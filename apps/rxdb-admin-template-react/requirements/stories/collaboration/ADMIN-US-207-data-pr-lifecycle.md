---
id: ADMIN-US-207
title: 数据变更 PR 创建与生命周期
status: Backlog
priority: High
epic: ADMIN-EPIC-003
created: 2026-11-16
updated: 2026-11-16
tags: [admin, data-pr, branch, commit, collaboration]
dependsOn: [ADMIN-US-206]
capabilities: [rxdb:US-306]
---

# 用户故事：数据变更 PR 创建与生命周期

## 作为/我想要/以便

**作为** 任务作者
**我想要** 把任务分支提交成一个类似 GitHub PR 的数据变更请求
**以便** 指定目标共享分支、持续追加提交并经过团队审核后再合并数据。

## 范围边界

### In Scope

- 一个 PR 明确记录来源任务分支、目标共享分支、当前来源版本和目标版本。
- 支持草稿、请求审核、关闭、重新打开和合并状态。
- PR 在请求审核后仍可追加提交，不因第一次提交而冻结整个任务。
- PR 详情可让团队成员看到标题、说明、作者、当前版本和目标共享数据上下文。
- 关闭 PR 不改变共享数据，也不删除提交和讨论；合并后 PR 进入只读历史状态。

### Out of Scope

- 直接连接 GitHub 代码仓库、把数据 PR 当作代码 PR 或自动创建 GitHub issue。
- 首版拆分同一任务为多个可独立合并的记录级 PR。

## 验收标准

| # | 前置条件 | 操作 | 预期结果 | 状态 |
| --- | --- | --- | --- | --- |
| 1 | 任务草稿已有同步版本且作者有提交权限 | 创建数据 PR 并填写标题、说明和目标共享分支 | 创建 PR，记录来源任务、来源版本和目标版本；共享数据不改变 | ⬜ |
| 2 | PR 处于草稿状态 | 追加编辑并提交任务 | 同一 PR 更新来源当前版本和提交列表，不要求重新创建 PR | ⬜ |
| 3 | 作者准备请求审核 | 点击“请求审核” | PR 状态变为待审核；当前提交版本、目标分支和检查状态明确显示 | ⬜ |
| 4 | PR 已关闭 | 查看或重新打开 PR | 关闭期间不写共享数据，提交和讨论仍可查看；有权限的作者可以重新打开继续协作 | ⬜ |
| 5 | PR 已合并 | 尝试追加原 PR 提交或重新打开 | PR 保留只读历史；后续修改必须从新的任务草稿开始 | ⬜ |
| 6 | 多名成员同时打开同一 PR | 查看状态、提交和目标版本 | 生命周期变化可同步到其他客户端，显示的当前来源版本一致 | ⬜ |

验收证据：待实现后补充 PR 状态机、持续追加提交、关闭/重开和跨客户端状态同步用例。

## 技术笔记

PR 是应用层协作对象，不能只把 working tree 的某个 commit 映射成按钮。需要保存来源任务、来源提交、目标分支头、生命周期状态和幂等标识；来源分支继续追加提交后，审核和检查都绑定新的当前版本。

## 实现文件

- `apps/rxdb-admin-template-react/src/app/data-pr/` — PR 创建、列表和生命周期入口。
- `apps/rxdb-admin-template-angular/src/app/data-pr/`、`apps/rxdb-admin-template-vue/src/app/data-pr/` — 三端等价入口。
- `packages/rxdb-plugin-working-tree/`、`packages/rxdb-plugin-sync/` — 分支和提交接线。

## References

- [ADMIN-US-206](ADMIN-US-206-draft-sync-offline-recovery.md)
- [工作树与提交操作](../../../../../requirements/stories/collaboration/US-306-working-tree-commits.md)
- [ADMIN-EPIC-003](../../epics/ADMIN-EPIC-003.md)
