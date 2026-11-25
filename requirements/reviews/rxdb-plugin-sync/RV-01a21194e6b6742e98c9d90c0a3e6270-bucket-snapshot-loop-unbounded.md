---
id: RV-01a21194e6b6742e98c9d90c0a3e6270
title: '分桶快照循环不受 fetchAll 与中断约束，limit=0 会死循环'
project: 'rxdb-plugin-sync'
status: Open
severity: 'P2'
anchors: ['packages/rxdb-plugin-sync/src/bucketed-pull.ts#pullBucketScope']
affected_projects: []
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

# RV-01a21194e6b6742e98c9d90c0a3e6270：分桶快照循环不受 fetchAll 与中断约束，limit=0 会死循环

## 问题与影响

`pullBucketScope` 的快照循环 `while (!progress.snapshotComplete)` 只以「本页行数 < limit」为退出条件，完全不读 `options.fetchAll`，
也没有任何 AbortSignal/取消通道。对照同一文件的增量循环有 `while (hasMore && options.fetchAll)` 约束（`:349`），两侧不对称：
`fetchAll=false` 时大分区仍会翻页直到整个快照读完（快照可能比增量大几个数量级），拉取期间无法协作中断。
边界条件：`limit=0` 时 `rows.length < 0` 恒假，快照页永远「不完整」，死循环（公开 API 未挡 0）。

定 P2：大分区首拉的资源与响应性问题、公开参数边界死循环；不丢数据，不定 P1。

## 证据与根因

快照 `b739b164a7dec9093c2e27c124563fd99a250400`：

- `packages/rxdb-plugin-sync/src/bucketed-pull.ts:278-294`：`while (!progress.snapshotComplete)`；`:290` `const snapshotComplete = rows.length < (options.limit ?? 1000);`——唯一正常退出条件。
- `packages/rxdb-plugin-sync/src/bucketed-pull.ts:349`：增量循环 `while (hasMore && options.fetchAll)` 的对照。
- `packages/rxdb/src/sync-contract/VersionManager.interface.ts:155-186`：`PullOptions` / `PullRepositoryOptions` 无 signal/abort 字段。
- 触发：`fetchAll=false` + 2 万行分区首拉 → 仍翻完 20 页；`limit=0` → 死循环。

## 修复方向

快照循环与增量同口径地受 `fetchAll` 约束（或提供取消通道），`limit` 入参校验 ≥ 1；
大分区下把快照拆成多轮同步返回，让调用方能推进进度与中断。

## 处理记录

### EV-01a211955e9f7a4192fe37de279bfd5d：发现

- 时间：2026-11-25T15:19:59+0800
- 操作：review/independent
- 执行者：ai；anthropic/claude-fable-5；会话 5812bc94-4aee-477d-b7b0-036b9c8fbed8
- 输入快照：`b739b164a7dec9093c2e27c124563fd99a250400`
- 输出快照：同输入
- 状态：未登记 → Open
- 结论：成立。快照循环不受 fetchAll/中断约束，与增量不对称；limit=0 死循环边界存在。
- 验证：4 个独立验证 agent 在 HEAD 上对抗性核对（工作流 wf_fbd47c66-d14），主会话对 `bucketed-pull.ts:276-296` 做行级复核；未运行测试与真栈回归，结论基于静态证据。
- 剩余事项：owner 决定中断语义（fetchAll 对齐 vs 取消通道）。
