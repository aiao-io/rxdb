---
id: RV-01a21194e6687a51ad13aabb42f40a66
title: 'callerIdentity 契约「只读本地会话状态」与 Supabase 实现的令牌刷新行为冲突'
project: 'rxdb-adapter-supabase'
status: Open
severity: 'P2'
anchors:
  [
    'packages/rxdb/src/rxdb-adapter.ts#callerIdentity',
    'packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts#callerIdentity'
  ]
affected_projects: ['rxdb']
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

# RV-01a21194e6687a51ad13aabb42f40a66：callerIdentity 契约「只读本地会话状态」与 Supabase 实现的令牌刷新行为冲突

## 问题与影响

核心契约（`rxdb-adapter.ts:970-971`）要求 `callerIdentity()` 实现「只读本地已有的会话状态，不要为它单独发网络请求」；
Supabase 实现每次调用 `await realtime.setAuth()`（`RxDBAdapterSupabase.ts:249-254`），其内部 `getSession()` 在令牌临期或
`autoRefreshToken` 关闭时会触发网络刷新（auth-js 源码注释点名 realtime-js 正是这类急切调用者）；
accessToken 模式则每次都调用应用提供的 accessToken 回调，成本不受适配器控制。适配器 244 行注释自称「只读本地已有的会话状态，不发网络请求」，
在这两种情况下不成立且未修正。后果：每轮同步的每个入口/每页都可能附加一次令牌刷新往返，令牌服务慢或挂时同步被拖慢或卡住。

定 P2：契约与性能问题，非行为错误；默认 session 模式且令牌健康时确实是本地缓存读。

## 证据与根因

快照 `b739b164a7dec9093c2e27c124563fd99a250400`：

- `packages/rxdb/src/rxdb-adapter.ts:970-971`：契约文本「实现应当只读本地已有的会话状态，不要为它单独发网络请求」。
- `packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts:244`：注释自称「只读本地已有的会话状态，不发网络请求」；`:249-254`：每次 `await realtime.setAuth()`。
- supabase-js `_getAccessToken` → `auth.getSession()`；auth-js `GoTrueClient.getSession` 在令牌临期或 `autoRefreshToken` 关闭时走网络刷新路径（node_modules 源码，诊断性引用）。
- 触发：`autoRefreshToken: false` 或令牌临期 + 同步轮询 → 每次核对都触发令牌刷新请求。

## 修复方向

契约措辞放宽为「应当只读本地会话状态；实现若会触发令牌刷新或外部回调，必须注明成本」，适配器侧把「缓存到令牌过期时间」的
身份读取作为默认（仅在临期时允许刷新），并修正 244 行注释；accessToken 模式在注释与文档中写明每次回调的成本语义。

## 处理记录

### EV-01a21194e778794a95f1a23872214091：发现

- 时间：2026-11-25T15:19:59+0800
- 操作：review/independent
- 执行者：ai；anthropic/claude-fable-5；会话 5812bc94-4aee-477d-b7b0-036b9c8fbed8
- 输入快照：`b739b164a7dec9093c2e27c124563fd99a250400`
- 输出快照：同输入
- 状态：未登记 → Open
- 结论：成立。契约与实现注释一致，但与实现行为（setAuth → getSession 可能的网络刷新、accessToken 每次回调）冲突；「每次问远端身份」的设计（identity-binding.ts:239-252）把这个成本放大到每个入口/每页。
- 验证：4 个独立验证 agent 在 HEAD 上对抗性核对（工作流 wf_fbd47c66-d14），主会话对 `rxdb-adapter.ts:970-971` 与 `RxDBAdapterSupabase.ts:244-254` 做行级复核；未运行测试与真栈回归，结论基于静态证据。
- 剩余事项：owner 决定契约措辞与适配器缓存策略。
