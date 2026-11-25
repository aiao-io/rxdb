---
id: RV-01a21182277b752b859ed1effe55f063
title: '身份 scope 原始串严格比较，尾斜杠或带路径的 URL 被判成换身份令同步全挂'
project: 'rxdb'
status: Fixed
severity: 'P3'
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

### EV-01a21224d428706d9157cfd9ab947e19：修复

- 时间：2026-11-25T18:02:16+0800
- 操作：fix
- 执行者：ai；anthropic/claude-opus-5-5；会话 8b131c28-0801-4140-925f-c944249ee3cf
- 输入快照：`45114a4aa36d2649ce281855e4beac56c6d7000c`（提交视图；相关代码与发现快照 `b739b164` 相同）
- 输出快照：工作区树 `00a3a6eab9aa449d8b213f7ee822858bc8048fab`（`ai-review snapshot --worktree`，基于 `b1fcba9b`：会话中途外部以「123123」提交了大部分改动）；本记录不在该树内。
- 状态：Open → Fixed；定级 P2 → P3
- 结论：事实成立，修法取原记录的备选方向（文档 + 报错），不在核心归一化。核心归一化行不通：`RxDBIdentity.scope` 是不透明的后端标识，身份键、库名与插件指纹都按 scope 原文取摘要（`packages/rxdb/src/system/identity-binding.ts:113-116`、`packages/rxdb-plugin-sync/src/scoped-sync.ts:158-161`），只在比较那一步归一化，打开时的绑定照样对不上；全链路归一化又会让已有库名漂移。触发要求应用自己写错 scope，失败是响亮的拒绝、不丢数据，属于「误导性示例让调用方传错参数」，按评审标准降为 P3。网站的 Supabase 适配器文档本来就写对了（`website/docs/adapters/supabase.md:276` 的 `new URL(supabaseUrl).origin`），写错的只有核心 TSDoc 示例与由它生成的 API 文档。
- 改动：
  - `packages/rxdb/src/system/identity-binding.ts:136`：`getRxDBIdentityDatabaseName` 的示例改为 `scope: new URL(supabaseUrl).origin`；`RxDBIdentity.scope`（`:35`）写明必须与适配器报告的值逐字相同、核对不做归一化、Supabase 报告项目 URL 的 origin；
  - `RxDBIdentityMismatchError` 新增可选的 `scopes: { client, remote }`（`:203`，构造参数在末位，原有三参调用不变）；`assertCallerIdentity`（`:284`）在 scope 不同时带上两边原文，文案改为「远端报告了不同的后端 scope：本客户端声明 "…"，远端报告 "…"」，并指出 scope 必须与远端适配器报告的逐字相同。scope 是后端地址、不含用户信息，subject 仍只出现摘要；scope 相同、只有 subject 不同时字段与文案不变；
  - 公开面不变：类型内联在字段上，没有新增导出名，不需要扩 `corePrefixExceptions`。
- 验证（Node 26，均 `--skip-nx-cache`）：
  - 修复前红：`pnpm nx test rxdb -- src/__tests__/system/identity-binding.spec.ts --coverage.enabled=false`，新增「声明的 scope 与远端报告的只差格式（尾斜杠 / 带路径段 / 大写主机名）：仍拒绝，报错写出两边的 scope 原文」3 条失败（没有 `scopes`，文案不含 scope）；守卫「scope 相同、subject 不同：报错不带 scope 字段，文案仍不含用户 id 原文」为绿；
  - 修复后：`identity-binding.spec.ts` 与 `identity-binding.connect.spec.ts` 通过；全量与检查同 `EV-01a21224d400724e88d6d117cb7421a3`（rxdb 2923 条通过，lint / typecheck / api-surface 通过）；
  - 一起核对：三框架 demo 里只有 `apps/dev-rxdb-supabase` 声明身份，已按 origin 声明（`apps/dev-rxdb-supabase/src/app/runtime-config.ts:73`）；本地适配器不消费 scope；`getRxDBIdentityDatabaseName` 的取摘要口径没变，库名不漂移；
  - 未跑真栈 `identity-guard.spec.ts`：它声明的 scope 就是 `SUPABASE_URL`，与适配器报告值相同，走的是不变的分支。
- 剩余事项：复核（verify）。
