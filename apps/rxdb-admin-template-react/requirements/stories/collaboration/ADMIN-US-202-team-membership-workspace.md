---
id: ADMIN-US-202
title: 团队邀请、成员与工作区选择
status: Backlog
priority: High
epic: ADMIN-EPIC-002
created: 2026-11-16
updated: 2026-11-16
tags: [admin, team, workspace, invitation, collaboration]
dependsOn: [ADMIN-US-201]
capabilities: []
---

# 用户故事：团队邀请、成员与工作区选择

## 作为/我想要/以便

**作为** 团队成员或团队管理员
**我想要** 通过邀请加入团队、查看成员并选择当前工作区
**以便** 在明确的团队边界内协作，而不是把个人、样例和其他团队的数据混在一起。

## 范围边界

### In Scope

- 通过邮箱邀请、接受邀请、撤销未接受邀请和处理过期邀请。
- 登录后展示用户有权限访问的团队，并要求选择当前团队。
- 显示当前团队、当前用户和成员角色；管理员可进行成员管理。
- 切换团队时切换本地库、缓存、草稿、查询和同步作用域。

### Out of Scope

- 组织层级、跨团队共享、账单、配额、域名验证和企业目录同步。
- 成员的细粒度操作授权；操作授权由 [ADMIN-US-203](ADMIN-US-203-permission-server-isolation.md) 验收。

## 验收标准

| # | 前置条件 | 操作 | 预期结果 | 状态 |
| --- | --- | --- | --- | --- |
| 1 | 管理员输入成员邮箱 | 发送、撤销或重新发送邀请 | 邀请具有待接受、已接受、已撤销或已过期状态；状态变化可被团队成员看到 | ⬜ |
| 2 | 用户已登录且属于一个或多个团队 | 打开应用 | 显示可访问团队；没有可访问团队时说明需要邀请，不进入任何团队业务数据 | ⬜ |
| 3 | 用户有多个团队成员关系 | 选择团队或切换团队 | 顶栏、查询、同步和后续任务草稿都明确使用当前团队；切换不会把前一团队数据混入当前视图 | ⬜ |
| 4 | 邀请已过期、已撤销或成员已被移除 | 打开邀请或刷新工作区 | 拒绝进入对应团队并显示原因；其他仍有效的团队访问不受影响，本机草稿不被删除 | ⬜ |
| 5 | 当前用户具有成员管理权限 | 查看成员、撤销邀请或移除成员 | 操作成功后服务端更新成员关系；无权限用户不能仅靠隐藏按钮绕过限制 | ⬜ |
| 6 | Angular、React、Vue 任一模板运行 | 完成邀请接受、团队选择和切换 | 三端显示的身份、团队边界、状态和操作结果一致，业务状态契约不因框架改变 | ⬜ |

验收证据：待实现后补充邀请生命周期、双团队隔离和成员撤销的 Supabase 集成及三端浏览器用例。

## 技术笔记

当前工作区上下文至少包含用户、团队和应用标识；分支与任务上下文由后续故事继续扩展。团队选择结果不能只存在于 UI 状态，所有读写、Realtime 频道和本地数据库命名空间都必须使用同一上下文。邀请链接只能建立待确认关系，不能直接授予未配置的操作权限。

## 实现文件

- `apps/rxdb-admin-template-react/src/app/workspace/` — 团队选择、成员列表和邀请入口。
- `apps/rxdb-admin-template-angular/src/app/workspace/` — Angular 等价入口。
- `apps/rxdb-admin-template-vue/src/app/workspace/` — Vue 等价入口。
- `packages/rxdb-adapter-supabase/` — 团队关系查询与服务端请求接线。

## References

- [ADMIN-US-201](ADMIN-US-201-supabase-email-otp-session.md)
- [ADMIN-US-203](ADMIN-US-203-permission-server-isolation.md)
- [ADMIN-EPIC-002](../../epics/ADMIN-EPIC-002.md)
