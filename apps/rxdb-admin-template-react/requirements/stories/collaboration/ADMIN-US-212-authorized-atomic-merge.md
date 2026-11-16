---
id: ADMIN-US-212
title: 有权限合并与原子提交
status: Backlog
priority: High
epic: ADMIN-EPIC-003
created: 2026-11-16
updated: 2026-11-16
tags: [admin, data-pr, merge, audit, transaction, collaboration]
dependsOn: [ADMIN-US-203, ADMIN-US-209, ADMIN-US-211]
capabilities: [rxdb:US-203, rxdb:US-218, rxdb:US-224]
---

# 用户故事：有权限合并与原子提交

## 作为/我想要/以便

**作为** 具有目标分支合并权的团队成员
**我想要** 在所有条件满足后把数据 PR 合并到共享数据
**以便** 让团队获得一个可追溯、不可部分成功的共享数据版本。

## 范围边界

### In Scope

- 合并按钮和服务端操作同时检查目标分支合并权、PR 状态、来源当前版本、目标头版本、检查、冲突、必须处理的讨论和团队审批规则。
- 服务端在最终操作时重新验证会话、权限、来源提交和目标共享头版本。
- 业务数据、PR 状态、合并提交和审计记录在一个原子事务中完成。
- 成功后目标共享版本递增，其他设备通过同步获得变更；失败、超时和重复点击不产生部分合并。
- 合并规则支持“至少一人批准”或“有合并权者可直接合并”两种首版模式。

### Out of Scope

- 自动合并多个 PR、定时合并、回滚已发布版本的快捷按钮和跨团队合并。
- 把离线保存或草稿同步状态当作合并授权。

## 验收标准

| # | 前置条件 | 操作 | 预期结果 | 状态 |
| --- | --- | --- | --- | --- |
| 1 | 用户有目标分支合并权，PR 已请求审核且当前版本检查通过 | 点击合并 | 服务端重新校验会话、权限、来源头、目标头、审批和线程状态；所有条件通过才执行合并 | ⬜ |
| 2 | PR 是草稿、已关闭、来源版本过期、目标头变化、有冲突、检查失败或缺少必需批准 | 尝试合并 | UI 明确显示阻塞原因；服务端拒绝请求，共享数据和 PR 状态保持不变 | ⬜ |
| 3 | 团队配置为至少一人批准 | 当前版本没有有效批准 | 即使用户具有合并权，也不能绕过批准规则；批准必须覆盖当前来源版本 | ⬜ |
| 4 | 团队配置为合并者可免审批，且用户有目标分支合并权 | 合并通过检查的 PR | 按团队规则允许合并，并在审计记录中保存使用的规则和合并人 | ⬜ |
| 5 | 合并事务中业务数据、PR 状态或审计写入任一步失败 | 等待请求返回 | 整个事务回滚；不存在业务数据已变但 PR 仍可合并或审计缺失的部分成功状态 | ⬜ |
| 6 | 用户重复点击合并或客户端在超时后重试 | 提交相同幂等请求 | 最多产生一个目标版本和一条合并审计记录，客户端能查询最终结果 | ⬜ |
| 7 | 合并成功 | 在另一台设备同步并查看 PR | 共享数据出现合并结果，PR 变为只读已合并状态，来源/目标版本和合并人可追溯 | ⬜ |
| 8 | 设备离线或会话已失效 | 尝试合并 | 合并被暂停或拒绝；重新认证和恢复在线后必须重新校验，不能使用旧授权直接提交 | ⬜ |

验收证据：待实现后补充 RLS/RPC 原子事务、并发目标头、重复请求、失败回滚和跨设备同步测试。

## 技术笔记

合并应由服务端 RPC 或事务入口完成，不能让客户端按“写业务表、改 PR、写日志”三步独立请求。目标头版本使用乐观并发控制；幂等键需要与 PR 当前来源版本关联。审计记录应保留实际服务端身份、规则快照和最终版本。

## 实现文件

- `apps/rxdb-admin-template-react/src/app/data-pr/merge/` — 合并条件摘要和结果状态。
- `apps/rxdb-admin-template-angular/src/app/data-pr/`、`apps/rxdb-admin-template-vue/src/app/data-pr/` — 三端等价入口。
- `packages/rxdb-adapter-supabase/` — 事务/RPC 调用与回执处理。
- `supabase/` — 原子合并函数、RLS、幂等约束和审计表。

## References

- [ADMIN-US-203](ADMIN-US-203-permission-server-isolation.md)
- [ADMIN-US-209](ADMIN-US-209-review-approval.md)
- [ADMIN-US-210](ADMIN-US-210-diff-checks.md)
- [ADMIN-US-211](ADMIN-US-211-three-way-conflict-preview.md)
- [Supabase 级联删除变更日志](../../../../../requirements/stories/adapter/US-224-supabase-cascade-delete-change-log.md)
- [ADMIN-EPIC-003](../../epics/ADMIN-EPIC-003.md)
