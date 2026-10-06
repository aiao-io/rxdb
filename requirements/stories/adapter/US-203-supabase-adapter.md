---
id: US-203
title: Supabase 远程适配器
status: Done
priority: High
epic: epic-002-data-sync
created: 2025-12-08
updated: 2026-10-06
tags: [adapter, supabase, sync]
---

# 用户故事：Supabase 远程适配器

## 作为/我想要/以便

**作为** 需要云同步的开发者
**我想要** 将本地数据同步到 Supabase 云端
**以便** 实现多设备数据一致性和云端备份

## 验收标准

| #   | 前置条件                        | 操作            | 预期结果                                             | 状态 |
| --- | ------------------------------- | --------------- | ---------------------------------------------------- | ---- |
| 1   | 配置 Supabase 适配器            | 连接            | 通过 PostgREST 执行远程查询                          | ✅   |
| 2   | 本地有新变更                    | 执行 push       | 变更压缩后通过 `rxdb_mutations` RPC 上传，逐实体回执 | ✅   |
| 3   | 远程有新变更                    | 执行 pull       | 增量拉取并合并到本地                                 | ✅   |
| 4   | 本地和远程有冲突                | 发现冲突        | 通过 LWW 或自定义 `ConflictResolver` 解决            | ✅   |
| 5   | 配置 Realtime channel           | 远程数据变更    | 自动通过 Realtime 订阅接收通知                       | ✅   |
| 6   | 同步模式 full/filter/querycache | 选择 querycache | 仅同步查询缓存命中的数据                             | ✅   |
| 7   | PostgREST filter builder        | 执行远程查询    | RuleGroup DSL 正确转换为 PostgREST 参数              | ✅   |

## 技术笔记

- 基类：`RxDBAdapterRemoteBase`
- RPC 推送：`rxdb_mutations` 函数批量推送，一次调用内每个实体组在子事务里落库并返回逐实体回执（被 RLS 拒绝的实体标 rejected，其余照常生效，见 [US-218](US-218-supabase-rls-push-integrity.md)）；本地 UPDATE 按普通 UPDATE 落库，只改载荷里的列（见 [US-220](US-220-supabase-update-push-semantics.md)）
- PostgREST 查询：Filter builder 将 `RuleGroup` 转换为 PostgREST 查询参数
- Realtime 订阅：通过 Supabase Realtime channel 订阅变更通知
- 同步策略：支持 full（全量）、filter（过滤）、QueryCache（SWR 增量）三种模式（`SyncType`）

## 实现文件

- `packages/rxdb-adapter-supabase/` — Supabase 适配器完整实现
- `apps/dev-rxdb-supabase/` — Supabase 演示应用

## 参考

- [文档: Supabase 适配器](../../../website/docs/adapters/supabase.md)
