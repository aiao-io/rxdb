---
id: MEDIA-US-306
title: 后台服务 RxDB 双向同步
status: Backlog
priority: High
epic: MEDIA-EPIC-004
created: 2026-11-15
updated: 2026-11-15
dependsOn: [MEDIA-US-302, MEDIA-US-303, MEDIA-US-208]
tags: [rxdb, sync, backend, supabase, realtime, rls]
---

# 用户故事：后台服务 RxDB 双向同步

## 作为/我想要/以便

**作为** 后台配置服务

**我想要** 使用与前端一致的 RxDB 实体、同步和冲突处理能力

**以便** 后台可以在本地可靠处理配置，并在网络恢复后与 Supabase 和前端收敛到同一份业务数据

## 范围边界

### In Scope

- Node 后台服务运行本地 RxDB，使用 PGlite、SQLite 或已验证的本地 adapter。
- 接入 `@aiao/rxdb-adapter-supabase`、`@aiao/rxdb-plugin-sync`，并按需接入 history 与 working-tree。
- 后台使用专用 Supabase Auth 身份或普通 JWT 同步，不把 service role 当作普通同步身份。
- 启动时执行远端 backend identity、RLS、schema 和同步游标检查。
- 支持业务实体的 pull、push、批量变更、断线重试、Realtime 通知和进程重启恢复。
- 业务变更遵守 revision/CAS、删除传播、幂等和审计规则。
- Auth Admin、封禁、绕过 RLS 和其他特权动作调用 Edge Function。

### Out of Scope

- 将 RxDB 内部系统表全部暴露为公共 Supabase 表。
- 完整 RxDB commit graph 同步；该范围由 MEDIA-US-308 负责。
- PGMQ 消费者本身；队列 PoC 由 MEDIA-US-110 负责。
- 使用后台进程绕过 RLS 读取全库数据。

## 验收标准

| # | 前置条件 | 操作 | 预期结果 | 状态 |
| --- | --- | --- | --- | --- |
| 1 | 后台服务配置有效普通 JWT 和本地数据库 | 启动服务并连接 Supabase | 本地 RxDB、Supabase adapter、同步插件和 Realtime 正常初始化；RLS 检查通过 | ⬜ |
| 2 | 前端已创建或修改共享业务实体 | 后台服务执行 pull/sync | 后台本地 RxDB 收到同一实体和 revision，字段不丢失 | ⬜ |
| 3 | 后台修改允许写入的业务实体 | 执行 push/sync | Supabase 业务表和 `rxdb_change` 收到变更；前端后续可以拉取 | ⬜ |
| 4 | 后台进程同步到一半退出或网络断开 | 重启服务并重新同步 | 游标和未确认变更可恢复，不重复应用已确认变更，不丢失本地变更 | ⬜ |
| 5 | 两个客户端同时修改同一实体 | 同步并产生 revision 冲突 | 按实体冲突策略返回可观察结果；不能静默覆盖另一方数据 | ⬜ |
| 6 | 后台使用错误 workspace、过期身份或普通用户身份 | 读取或写入不属于自己的数据 | RLS/RPC 拒绝请求，本地保留数据并暂停对应远程写入 | ⬜ |
| 7 | 后台需要读取 Auth 用户或封禁账号 | 执行特权动作 | 服务调用 Edge Function；同步连接本身没有 service role 权限 | ⬜ |
| 8 | Supabase 远端重建或 `rxdb_change` 被重置 | 后台再次连接 | 检测到 remote backend identity 不一致，停止危险同步并给出可恢复错误 | ⬜ |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过。

## 交付阶段

| 阶段 | 范围 | 关闭条件 |
| --- | --- | --- |
| A | 后台 RxDB 与 Supabase adapter 接线 | AC1、AC8 通过 |
| B | 业务实体双向同步 | AC2–5 通过 |
| C | 权限和特权边界 | AC6–7 通过；普通同步身份不具备 service role |

## 技术笔记

仓库已有 [Supabase RxDB 适配器](../../../../packages/rxdb-adapter-supabase/README.md) 和 [同步插件](../../../../packages/rxdb-plugin-sync/README.md)，支持 `pullChanges`、`mergeChanges`、`pullChangesBatch`、Realtime、`syncManager.sync()` 和 `syncManager.syncBranches()`。该故事只同步业务实体和分支元数据，不把 `Commit`、`CommitChangeSet` 等系统实体直接加入普通同步。

后台服务使用普通 JWT 是安全边界：RLS 仍然生效，审计记录有明确服务账号，错误配置不会直接拥有全库读写权限。

## 实现文件

- `packages/rxdb-adapter-supabase/` — Supabase remote adapter。
- `packages/rxdb-plugin-sync/` — RxDB 双向同步和分支同步。
- `aiao-media/apps/api/` — 后台服务和当前任务服务接线。
- `aiao-media/infra/supabase/migrations/` — 业务实体、RLS、`rxdb_change` 和分支表。

## References

- [架构评审](../../plans/supabase-first-architecture-review-20261115.md#6-后台服务必须使用-rxdb-同步)
- [MEDIA-US-302 多端草稿同步与冲突处理](MEDIA-US-302-draft-sync.md)
- [MEDIA-US-303 平台账号与同步管理](MEDIA-US-303-sync-targets.md)
- [需求约定](../../CONVENTIONS.md)
