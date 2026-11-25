---
id: RV-01a21182277b752b859ed1effe55f063
title: '身份 scope 原始串严格比较，尾斜杠或带路径的 URL 被判成换身份令同步全挂'
project: 'rxdb'
status: Open
severity: 'P2'
anchors:
  [
    'packages/rxdb/src/system/identity-binding.ts#assertCallerIdentity',
    'apps/dev-rxdb-supabase/src/app/runtime-config.ts#originOf'
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

# RV-01a21182277b752b859ed1effe55f063：身份 scope 原始串严格比较，尾斜杠或带路径的 URL 被判成换身份令同步全挂

## 问题与影响

核心守卫 `assertCallerIdentity` 对 `scope` 用严格 `===` 比较声明身份与适配器报告的调用者身份，不做任何归一化；
Supabase 适配器报告的是 `new URL(...).origin` 归一化值；核心文档示例（`packages/rxdb/src/system/identity-binding.ts:131`）却教用户把原始 `supabaseUrl` 原样声明为 `identity.scope`。
URL 带尾斜杠、路径段、显式端口或大小写差异时，同一个后端会被判成「换了身份」，pull / push / QueryCache 全部抛 `RxDBIdentityMismatchError('remote')`，同步整体停摆；
错误信息只给身份键摘要，不提示两侧是格式差异。demo 侧已修（`runtime-config.ts` 声明 origin），任何按核心文档示例配置的第三方应用仍会踩。

定 P2：触发条件是配置错误路径（Supabase 控制台默认 URL 无尾斜杠），报错响亮、无数据丢失；不定 P1 是不构成默认路径下的常见条件。

## 证据与根因

快照 `b739b164a7dec9093c2e27c124563fd99a250400`：

- `packages/rxdb/src/system/identity-binding.ts:252`：`if (reported.scope === identity.scope && reported.subject === identity.subject) return;`——无归一化、无两侧原文提示。
- `packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts:1486-1491`：`normalizeSupabaseScope` 返回 `new URL(...).origin`，适配器报告值必然与「带尾斜杠/路径的原始串」不等。
- `packages/rxdb/src/system/identity-binding.ts:131`：文档示例 `scope: supabaseUrl` 原文传参，与上一条组合出必然失败的配置。
- `apps/dev-rxdb-supabase/src/app/runtime-config.ts:73`：demo 已改为 `originOf`；`runtime-config.spec.ts:17-29` 明言「尾斜杠、路径段都会被判成换了身份」——demo 规避了，核心没有。

触发：第三方应用按文档示例声明 `identity.scope = 'https://project.supabase.co/'` → 每次远端交换前 `callerIdentity()` 报告 `'https://project.supabase.co'` → 严格比较失败 → 同步全挂。

## 修复方向

比较前对两侧 scope 统一归一化（可解析的 URL 取 origin，解析失败保留原始串），或至少在校对失败的错误信息里给出两侧原始值；
核心文档示例改为声明 origin。需要一起核对：三框架 demo 的 scope 声明方式、`getRxDBIdentityDatabaseName` 对 scope 的哈希口径（归一化后库名不应漂移）、以及本地适配器路径是否消费 scope。

## 处理记录

### EV-01a21194e704773e9590745183187b91：发现

- 时间：2026-11-25T15:19:59+0800
- 操作：review/independent
- 执行者：ai；anthropic/claude-fable-5；会话 5812bc94-4aee-477d-b7b0-036b9c8fbed8
- 输入快照：`b739b164a7dec9093c2e27c124563fd99a250400`
- 输出快照：同输入
- 状态：未登记 → Open
- 结论：成立。源头是 2026-11-23 深度评审（随 WIP 提交删除）的第 8 条，当时标注「修复：比较前统一归一化并补尾斜杠回归」；当前 HEAD 上 demo 侧已规避、核心比较逻辑未动，按文档示例配置的第三方应用仍会踩。
- 验证：4 个独立验证 agent 在 HEAD 上对抗性核对（工作流 wf_fbd47c66-d14），主会话对 `identity-binding.ts:252` 与 `RxDBAdapterSupabase.ts:1486-1491` 做行级复核；未运行测试与真栈回归，结论基于静态证据。
- 剩余事项：owner 决定归一化口径（核心归一化 vs 文档要求传 origin）；补尾斜杠/路径段回归。
