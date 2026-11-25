---
id: RV-01a21194e68f7aacb5782c196d2ea870
title: '新客户端对旧服务端的 RPC 能力门控仍缺，pull 与状态查询整轮抛错'
project: 'rxdb-plugin-sync'
status: Open
severity: 'P1'
anchors:
  [
    'packages/rxdb-plugin-sync/src/pull.ts#findBucketedRepositories',
    'packages/rxdb-plugin-sync/src/check-repository-updates.ts#checkRepositoryUpdates'
  ]
affected_projects: ['rxdb-adapter-supabase']
related_findings: []
found_on_branch: 'refs/heads/supabase-log-access-baseline'
found_view: commit
found_snapshot: 'b739b164a7dec9093c2e27c124563fd99a250400'
found_range: project
found_base: null
created: 2026-11-25
updated: 2026-11-25
pr: null
---

# RV-01a21194e68f7aacb5782c196d2ea870：新客户端对旧服务端的 RPC 能力门控仍缺，pull 与状态查询整轮抛错

## 问题与影响

客户端已加了 `typeof` 能力探测（2026-11-23 评审第 4 条的修复部分），但探测通过之后的调用没有错误处理：
旧服务端缺 `rxdb_entity_sync_info` 时，PostgREST 返回 404 → `assert_postgrest_ok` 抛出 → `findBucketedRepositories` 不捕获 →
`pull()` 整轮失败，连非分区实体也拉不了；`checkRepositoryUpdates` 的分区分支同样裸调
`getEntitySyncInfo` / `getCallerBuckets` / `getBucketSnapshotPoint`，状态只读 API 在旧服务端与「桶刚被撤销」的 42501 竞态下
从返回计数变成抛异常。滚动升级（客户端先于服务端 SQL）窗口与桶撤销竞态是常见条件。

定 P1：迁移窗口下主流程（拉取）与状态面板整体不可用；2026-11-23 评审即定 HIGH，此轮确认修复部分（typeof 探测）后残留。

## 证据与根因

快照 `b739b164a7dec9093c2e27c124563fd99a250400`：

- `packages/rxdb-plugin-sync/src/pull.ts:87-107`：`findBucketedRepositories` 对 `getEntitySyncInfo.call(...)` 的 `Promise.all` 无 try/catch——任一实体抛错即整轮失败。
- `packages/rxdb-plugin-sync/src/check-repository-updates.ts:127-173`：分区分支的 `getEntitySyncInfo` / `getCallerBuckets` / `getBucketSnapshotPoint` 均无错误处理。
- 触发：升级 `@aiao/rxdb-adapter-supabase` 但未跑升级 SQL → 首次 `pull()` 在第一个实体上抛 `SupabaseDataError`，整轮失败；状态面板查询同样抛错。

## 修复方向

能力探测从「函数是否存在」升级为「按实体缓存的服务端能力」：第一次 404（或结构错误）把该实体标记为非分区、后续轮次跳过，
直到探测过期重试；`checkRepositoryUpdates` 的分区分支包错误处理（降级为未分区口径或抛出结构化错误），不让状态只读 API 因 42501 竞态崩溃。

## 处理记录

### EV-01a21194e79f72a0950530f368080520：发现

- 时间：2026-11-25T15:19:59+0800
- 操作：review/independent
- 执行者：ai；anthropic/claude-fable-5；会话 5812bc94-4aee-477d-b7b0-036b9c8fbed8
- 输入快照：`b739b164a7dec9093c2e27c124563fd99a250400`
- 输出快照：同输入
- 状态：未登记 → Open
- 结论：部分修复。源头是 2026-11-23 深度评审（随 WIP 提交删除）的第 4 条——「sync 关闭的实体不再被探测」已落实、逐仓失败会结构化进 failures；
  残留为旧服务端 404 令 `pull()` 整轮抛错、状态查询分区分支无错误处理。
- 验证：4 个独立验证 agent 在 HEAD 上对抗性核对（工作流 wf_fbd47c66-d14），主会话对 `pull.ts:87-107` 与 `check-repository-updates.ts:127-173` 做行级复核；未运行测试与真栈回归，结论基于静态证据。
- 剩余事项：owner 排期；与迁移文档「升级顺序」口径一起核对。
