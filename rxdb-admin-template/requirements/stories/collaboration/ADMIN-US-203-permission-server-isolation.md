---
id: ADMIN-US-203
title: 团队操作权限与服务端隔离
status: Backlog
priority: High
epic: ADMIN-EPIC-002
created: 2026-11-16
updated: 2026-11-16
tags: [admin, permission, rls, security, collaboration]
dependsOn: [ADMIN-US-201, ADMIN-US-202]
capabilities: [rxdb:US-027, rxdb:US-029]
---

# 用户故事：团队操作权限与服务端隔离

## 作为/我想要/以便

**作为** 团队管理员、编辑者、审核者或合并者
**我想要** 分别授予查看、编辑提交、评论、审核、合并和成员管理权限
**以便** 团队可以按职责协作，且任何客户端都不能绕过服务端规则写入数据。

## 范围边界

### In Scope

- 在团队和目标分支范围内授予查看、编辑/提交、评论、审核、合并、成员管理六类操作权限。
- 评论权、审核权和合并权可以独立授予并叠加；被指定为审核人不自动获得合并权。
- UI 的可见性和服务端授权使用同一权限结果；服务端重新校验每个真实操作。
- 业务表、变更日志、任务分支、提交、PR 和 Realtime 频道按团队及可见范围隔离。
- 共享分支直接写入和 PR 合并遵守相同的目标分支权限与业务约束。

### Out of Scope

- 字段级脱敏、复杂 ABAC、外部身份目录和跨团队委托。
- 将权限判断交给前端缓存、角色名称或可伪造的 `userId`。

## 验收标准

| #   | 前置条件                                     | 操作                                     | 预期结果                                                                            | 状态 |
| --- | -------------------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------- | ---- |
| 1   | 团队管理员为成员分别配置评论、审核和合并权限 | 查看权限矩阵并执行对应操作               | 每项权限独立生效，可叠加；未授予的操作不会因拥有其他权限而放行                      | ⬜   |
| 2   | 成员被指定为某个 PR 的审核人但没有合并权     | 审核并尝试合并该 PR                      | 可以按授权审核，但合并入口不可用；直接调用服务端合并接口也被拒绝                    | ⬜   |
| 3   | 用户没有目标团队或目标分支的操作权           | 通过 UI、网络请求或伪造上下文发起读写    | UI 给出无权提示，服务端返回明确拒绝，业务数据、PR、日志和本地同步状态不发生越权变化 | ⬜   |
| 4   | 用户切换团队或目标分支                       | 查询业务表、提交、PR、讨论和变更日志     | 只能看到当前团队及被授予范围内的数据；Realtime 只订阅允许的频道                     | ⬜   |
| 5   | 用户尝试绕过 PR 直接写共享分支               | 执行插入、更新或删除                     | 服务端按相同目标分支和业务规则校验；无权或违反规则时整次写入失败                    | ⬜   |
| 6   | 团队成员被移除或权限被收回                   | 刷新页面并重试已有操作                   | 新操作立即按服务端最新权限判断；旧页面缓存不能继续授权                              | ⬜   |
| 7   | 三端以相同成员和权限配置运行                 | 分别操作查看、编辑、评论、审核和合并入口 | Angular、React、Vue 的入口状态、拒绝语义和实际服务端结果一致                        | ⬜   |

验收证据：待实现后补充 Supabase RLS、RPC 负例、Realtime 订阅隔离和三端权限矩阵浏览器用例。

## 技术笔记

权限是服务端事实。建议将团队成员、操作授权、目标分支策略和可见范围建模为独立数据，并在 RLS、RPC 和 Realtime 入口重复校验；客户端只负责展示能力结果。审计日志不能因为业务行不可见就自动继承错误的可见范围，必须明确设计日志策略。

## 实现文件

- `rxdb-admin-template/apps/react/src/app/permissions/` — 权限矩阵、守卫和入口状态。
- `rxdb-admin-template/apps/angular/src/app/permissions/` — Angular 等价入口。
- `rxdb-admin-template/apps/vue/src/app/permissions/` — Vue 等价入口。
- `packages/rxdb-adapter-supabase/` — RLS、RPC 和 Realtime 授权接线。
- `supabase/` — 团队、权限、分支和日志策略迁移。

## References

- [ADMIN-US-201](ADMIN-US-201-supabase-email-otp-session.md)
- [ADMIN-US-202](ADMIN-US-202-team-membership-workspace.md)
- [实体操作权限模型](../../../../requirements/stories/core/US-027-entity-permission-model.md)
- [多用户 RBAC](../../../../requirements/stories/core/US-029-rbac-owner-role-permission.md)
- [ADMIN-EPIC-002](../../epics/ADMIN-EPIC-002.md)
