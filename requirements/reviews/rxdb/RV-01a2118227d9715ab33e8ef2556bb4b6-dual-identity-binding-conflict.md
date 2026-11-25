---
id: RV-01a2118227d9715ab33e8ef2556bb4b6
title: '先会话同步后声明身份：核心与插件两套绑定互斥且无改绑，同步永久停摆'
project: 'rxdb'
status: Open
severity: 'P1'
anchors:
  [
    'packages/rxdb/src/RxDB.ts#recordIdentityBinding',
    'packages/rxdb-plugin-sync/src/remote-backend.ts#bindScopedIdentity',
    'packages/rxdb-plugin-sync/src/scoped-sync.entity.ts#RxDBSyncIdentityBinding'
  ]
affected_projects: ['rxdb-plugin-sync', 'rxdb-adapter-supabase']
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

# RV-01a2118227d9715ab33e8ef2556bb4b6：先会话同步后声明身份：核心与插件两套绑定互斥且无改绑，同步永久停摆

## 问题与影响

本分支并存两套身份绑定：核心在 `rxdb_migration` 水位行记录「这个库属于谁」（声明 `RxDBOptions.identity` 时权威），
同步插件在单行实体 `RxDBSyncIdentityBinding` 记录「首次同步时的会话身份」（未声明身份时的兜底）。
残留矛盾路径：应用**先不声明** identity、用会话 Y 完成首次同步（插件绑 Y）；之后应用升级为声明 identity X（US-035 的推荐路径）——
核心对既有库就地补绑 X（`RxDB.ts:1285-1290`），插件每次核对发现 Y ≠ X 抛 `IdentityMismatchError`，
且两处都没有改绑 API。库同时持两条互相矛盾的绑定，同步永久停摆，只能删库重建。

定 P1：从「不声明/匿名」演进到「声明身份」是真实的产品路径（US-035 才引入声明语义，存量应用必然经过这个过渡），
一旦发生主流程永久不可用；不定 P0 是因为数据不丢（守卫停摆而非错混），触发需要「先会话同步、后补声明」两步。

## 证据与根因

快照 `b739b164a7dec9093c2e27c124563fd99a250400`：

- 核心绑：`packages/rxdb/src/RxDB.ts:1285-1290`——既有库 `existed && identityKey !== undefined && !identityBound` 时经 `#recordIdentityBinding` 就地补绑，无「已有插件绑定」的核对。
- 插件绑：`packages/rxdb-plugin-sync/src/remote-backend.ts:135-161`——`bindScopedIdentity` 先核对声明身份、已有绑定时只断言不写（错误会话路径已修，见 2026-11-23 评审第 3 条），但未声明身份时绑定的是会话身份。
- 无改绑：`packages/rxdb-plugin-sync/src/scoped-sync.entity.ts:126-129` 注释「没有改绑」；核心侧同样只有拒绝（`RxDBIdentityMismatchError`）没有改绑入口。
- 触发链：会话 Y 首次同步（绑 Y）→ 应用补声明 identity X → 核心补绑 X → 插件核对 Y≠X 抛错 → 停摆。

## 修复方向

声明身份 X 时，若插件已绑定不同身份：以核心为权威，在同一迁移路径里把插件绑定行重建为 X（事务内二次核对），
或提供显式改绑 API 由应用在升级时调用；补「先未声明后声明」的演进回归测试。
与 2026-11-23 评审第 3 条的残余（插件绑定无解绑路径）同源，一并核对。

## 处理记录

### EV-01a21194e75273efbb89c5dc71d8e936：发现

- 时间：2026-11-25T15:19:59+0800
- 操作：review/independent
- 执行者：ai；anthropic/claude-fable-5；会话 5812bc94-4aee-477d-b7b0-036b9c8fbed8
- 输入快照：`b739b164a7dec9093c2e27c124563fd99a250400`
- 输出快照：同输入
- 状态：未登记 → Open
- 结论：成立。两套绑定并存属实且有分工（声明身份时核心权威、未声明时插件兜底），但「先兜底后声明」的演进路径两者互不承认且都无改绑，同步永久停摆。
- 验证：4 个独立验证 agent 在 HEAD 上对抗性核对（工作流 wf_fbd47c66-d14），主会话对 `RxDB.ts:1275-1295` 与 `scoped-sync.entity.ts:120-135` 做行级复核；未运行测试与真栈回归，结论基于静态证据。
- 剩余事项：owner 决定演进路径的处置（重建插件绑定 vs 显式改绑 API）。
