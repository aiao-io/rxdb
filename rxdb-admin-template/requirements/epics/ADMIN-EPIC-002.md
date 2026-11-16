---
id: ADMIN-EPIC-002
status: Backlog
startDate: 2026-11-16
targetDate: TBD
owner: jimmy
---

# 认证与团队工作区

## 愿景

让 Admin 在 Supabase 真实身份和团队边界内保留 local-first 工作方式，用户明确知道当前在哪个团队、哪份本机数据和哪种同步状态中工作。

## 目标

- [ ] 邮箱验证码登录、离线冷热启动和退出锁定（[ADMIN-US-201](../stories/collaboration/ADMIN-US-201-supabase-email-otp-session.md)）。
- [ ] 可信团队初始化、绑定邮箱的原子邀请、成员管理和工作区选择（[ADMIN-US-202](../stories/collaboration/ADMIN-US-202-team-membership-workspace.md)）。
- [ ] 独立操作权限、团队隔离及共享表直写禁令（[ADMIN-US-203](../stories/collaboration/ADMIN-US-203-permission-server-isolation.md)）。
- [ ] 本地库上下文隔离与显式导入（[ADMIN-US-204](../stories/collaboration/ADMIN-US-204-local-context-explicit-import.md)）。
- [ ] 任务工作树、编辑器输入及整单提交边界（[ADMIN-US-205](../stories/collaboration/ADMIN-US-205-task-draft-continuous-editing.md)）。
- [ ] 带预期远端头的提交图同步、双设备分叉另存和离线恢复（[ADMIN-US-206](../stories/collaboration/ADMIN-US-206-draft-sync-offline-recovery.md)）。

共享规则见 [协作首版共享契约](../collaboration-contract.md) C01～C03；首个团队由可信服务端初始化，不依赖尚不存在的管理员邀请入口。

## 故事

本清单只列范围，状态见 [status-overview](../status-overview.md)。

- [ADMIN-US-201 Supabase 邮箱验证码登录与会话恢复](../stories/collaboration/ADMIN-US-201-supabase-email-otp-session.md) (High)
- [ADMIN-US-202 团队邀请、成员与工作区选择](../stories/collaboration/ADMIN-US-202-team-membership-workspace.md) (High)
- [ADMIN-US-203 团队操作权限与服务端隔离](../stories/collaboration/ADMIN-US-203-permission-server-isolation.md) (High)
- [ADMIN-US-204 本地数据上下文隔离与显式导入](../stories/collaboration/ADMIN-US-204-local-context-explicit-import.md) (High)
- [ADMIN-US-205 任务草稿与连续编辑](../stories/collaboration/ADMIN-US-205-task-draft-continuous-editing.md) (High)
- [ADMIN-US-206 草稿云同步、跨设备续作与离线恢复](../stories/collaboration/ADMIN-US-206-draft-sync-offline-recovery.md) (High)

## 非目标

- 本 Epic 不实施 OAuth、企业 SSO、组织计费、跨团队共享和独立部署。
- 不把登录、同步或导入自动等同于合并到共享数据；数据 PR 和合并由 [ADMIN-EPIC-003](ADMIN-EPIC-003.md) 管理。
