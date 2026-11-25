---
id: RV-01a2118227d9715ab33e8ef2556bb4b6
title: '未声明身份时同步过的库，首次以另一身份声明打开会被核心就地补绑，原身份被锁在库外'
project: 'rxdb'
status: Fixed
severity: 'P2'
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

# RV-01a2118227d9715ab33e8ef2556bb4b6：未声明身份时同步过的库，首次以另一身份声明打开会被核心就地补绑，原身份被锁在库外

## 问题与影响

（2026-11-25 复核修正了原标题与触发链，见 `EV-01a21224d44f7abfb0b84a78510e0117`：原文「先会话同步、后声明身份，两套绑定互斥、同步永久停摆」
只在前后是两个不同身份时成立，而那时拒绝同步正是守卫的本职。）

本分支有两处身份绑定：核心在 `rxdb_migration` 的水位行记「这个库属于谁」，声明了 `RxDBOptions.identity` 时打开即核对；
同步插件在单行实体 `RxDBSyncIdentityBinding` 记第一次同步时的会话身份，每次同步核对。两者是同一个算法、同一个适配器报告值，
同一个用户从「不声明」升级到「声明」时两边的键相等，不冲突。

残留路径：应用用固定库名、不声明身份，以 Y 同步过（插件绑 Y，核心没有绑定）；之后应用改为声明身份打开同一个库，
而第一次声明打开时声明的是另一个身份 X（换了账号，或启动时会话过期成 anon）。核心看不到插件那一行，按「本功能之前建的库」就地补绑 X：
X 读得到 Y 留下的本地数据（声明身份要防的正是这件事），同步又被插件以 Y ≠ X 拒绝；Y 之后以自己的身份打开，被核心以「库属于 X」拒绝连接，
Y 尚未推送的变更困在库里，没有改绑入口。

定 P2：少见路径（固定库名 + 未声明期同步过 + 首次声明打开时换了身份），后果是声明身份的承诺在这条路径上失效、原主人被锁在库外，数据仍在库里；
不定 P1：常见路径（同一个用户升级、按身份算库名）都不触发。

## 证据与根因

快照 `45114a4aa36d2649ce281855e4beac56c6d7000c`（与发现快照 `b739b164` 相同）：

- 同一身份不冲突：插件指纹 `packages/rxdb-plugin-sync/src/scoped-sync.ts:158-161` 与核心身份键 `packages/rxdb/src/system/identity-binding.ts:113-116` 同一编码；
  插件取的是 `syncIdentity()`，Supabase 实现即 `callerIdentity()`（`packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts:634-635`）。
- 核心就地补绑只读 `rxdb_migration`：`packages/rxdb/src/RxDB.ts:1285` 在既有库、声明了身份、库里没有核心绑定时调 `#recordIdentityBinding`，
  事务体 `#writeIdentityBinding`（`:2417`）只看迁移表的行名，看不到插件的 `RxDBSyncIdentityBinding`。
- 插件只写自己那一行：`packages/rxdb-plugin-sync/src/remote-backend.ts:135-160` 的 `bindScopedIdentity` 在首次绑定事务里只建插件绑定行（`:159`）。
- 触发链：固定库名、未声明，会话 Y 首次同步（只有插件绑 Y）→ 应用改为声明身份，首次以 X 打开 → 核心看不到绑定、就地补绑 X →
  X 读到 Y 的本地数据，同步被插件拒绝 → Y 回来以自己的身份打开，核心拒绝连接。

## 修复方向

插件第一次按会话绑定时，同一个事务里先写核心的身份水位（与打开既有库时的就地绑定同一份写法），再写插件自己的绑定行；
库已绑定别的身份时两行都不写、报身份不匹配。绑定的事实落在核心的 `rxdb_migration` 上，核心不感知插件实体。

不采用原方向「以核心为权威把插件绑定行重建为 X / 提供显式改绑 API」：那等于把 Y 的数据交给 X，
与 US-035「不提供自动改绑」（`packages/rxdb/src/system/identity-binding.ts:13-14`）相悖。

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

### EV-01a21224d44f7abfb0b84a78510e0117：复核（修正触发链与定级）

- 时间：2026-11-25T18:02:16+0800
- 操作：review/independent
- 执行者：ai；anthropic/claude-opus-5-5；会话 8b131c28-0801-4140-925f-c944249ee3cf
- 输入快照：`45114a4aa36d2649ce281855e4beac56c6d7000c`
- 输出快照：同输入（只改评审记录）
- 状态：Open（不变）；定级 P1 → P2
- 结论：原触发链不成立，残留是一条更窄的路径；已改写标题、「问题与影响」「证据与根因」「修复方向」：
  - 插件指纹与核心身份键同一编码（`packages/rxdb-plugin-sync/src/scoped-sync.ts:158-161`、`packages/rxdb/src/system/identity-binding.ts:113-116`），取的都是适配器报告的会话身份；声明了身份时 `bindScopedIdentity` 先过核心的会话核对（`packages/rxdb-plugin-sync/src/remote-backend.ts:135-140`），写下的插件指纹就是声明身份的键。同一个用户从不声明升级到声明，两边的键相等。US-035 AC#3 的证据测的正是这条路径（`requirements/stories/core/US-035-evidence.md:9`，真栈 `packages/rxdb-adapter-supabase/src/__tests__/identity-guard.spec.ts:205-228`：插件绑定 A 一条、以 A 的键结尾的水位行一条）；
  - 只有 X ≠ Y（真换了人）时才停，拒绝同步是守卫的本职。原修复方向「把插件绑定行重建为 X / 显式改绑」等于把 Y 的数据交给 X，与 `identity-binding.ts:13-14`「不提供自动改绑」相悖，不采用；
  - 真实残留：核心就地补绑（`packages/rxdb/src/RxDB.ts:1285`，事务体 `:2417`）只读 `rxdb_migration`，看不到插件已有的绑定行。固定库名、未声明期以 Y 同步过、首次声明打开时是 X（换号或会话过期成 anon）时，核心把装着 Y 数据的库补绑给 X：X 读得到 Y 的本地数据，之后 Y 打开被核心拒绝，Y 的待推变更困在库里。US-035 AC#8「本功能之前建的库首次带身份打开就地绑定」覆盖的是没有任何绑定证据的旧库，不覆盖这条已有插件绑定的路径。
- 验证：静态阅读上述行号，核对 US-035 AC#3 / AC#8 的证据；复现见下一个修复事件的红灯用例。
- 剩余事项：修复（同会话接着做，见下一事件）。

### EV-01a21224d476752fb257e720eb821fef：修复

- 时间：2026-11-25T18:02:16+0800
- 操作：fix
- 执行者：ai；anthropic/claude-opus-5-5；会话 8b131c28-0801-4140-925f-c944249ee3cf
- 输入快照：`45114a4aa36d2649ce281855e4beac56c6d7000c`（提交视图）
- 输出快照：工作区树 `00a3a6eab9aa449d8b213f7ee822858bc8048fab`（`ai-review snapshot --worktree`，基于 `b1fcba9b`：会话中途外部以「123123」提交了大部分改动）；本记录不在该树内。
- 状态：Open → Fixed
- 结论：插件第一次按会话绑定时，在同一个事务里先写核心的身份水位，再写插件绑定行；之后带声明打开由核心的打开守卫按这个会话的身份核对。绑定的事实落在核心的 `rxdb_migration` 上，核心不感知插件实体。
- 改动：
  - `packages/rxdb/src/RxDB.ts:745` 新增 `@internal` 的 `bindIdentity(executor, identity)`：校验身份形状之后复用 `#writeIdentityBinding`，与打开既有库时的就地绑定同一份写法：库已绑定本身份不写，否则写竞争行与绑定行；库已绑定别的身份抛 `RxDBIdentityMismatchError('database')`，一行不写；
  - `packages/rxdb-plugin-sync/src/remote-backend.ts:165`：`bindScopedIdentity` 的首次绑定事务先调 `sm.rxdb.bindIdentity(executor, identity)`，再写插件绑定行；身份不匹配写进 `SyncState.lastError` 再抛，两行都不写。「只有身份不匹配才写进面板」提为 `reportingIdentityMismatch`（`:100`），会话核对与这里共用一份；
  - 行为变化：曾以身份 A 声明打开过的库，之后不声明身份、以会话 B 第一次同步，改为拒绝（此前插件会写下 B 的绑定，B 照常同步，把 A 留下的待推变更推出去）。声明了身份的库首次同步时核心水位已在，`bindIdentity` 不写，以该身份键结尾的水位行仍只有一条（AC#3 不变）；
  - TSDoc：`RxDBSyncIdentityBinding`、`IdentityMismatchError`、`bindScopedIdentity` 写明这次绑定；文档 `website/docs/adapters/supabase.md:294` 补「这份绑定同时记进库的身份绑定，之后改为声明身份打开时按它核对」。
- 验证（Node 26，均 `--skip-nx-cache`）：
  - 修复前红：核心 `packages/rxdb/src/__tests__/system/identity-binding.connect.spec.ts`「没声明身份时按会话写下的绑定（bindIdentity）」4 条失败（入口不存在）；插件 `packages/rxdb-plugin-sync/src/__tests__/scoped-sync.spec.ts` 3 条失败：「第一次按会话绑定：核心的身份水位与插件绑定行写在同一个事务里，核心那一行先写」（核心入口一次都没被调用）、「库已绑定别的身份（曾以别的身份声明打开）：拒绝并写入同步错误，插件绑定一行不写」（插件照写了 B 的绑定）、「核心写水位时的其他错误原样抛出，不写进同步面板」；
  - 修复后：核心两个 identity-binding spec 58 条通过，其中端到端用例「之后以别的身份声明打开被拒，以这个身份声明打开照常连接」：不声明打开、按 A 写下绑定 → 以 B 声明打开被拒 → 以 A 声明打开照常连接；插件 `scoped-sync` / `remote-identity` / `remote-backend` 三个 spec 34 条通过；全量与检查同 `RV-01a21194e6b6742e98c9d90c0a3e6270` 的修复事件（rxdb 2923 条、rxdb-plugin-sync 619 条通过，lint / typecheck / api-surface 通过）；
  - 未跑：真栈 `identity-guard.spec.ts`。它的用例全部声明了身份，`bindIdentity` 对它们是空写；AC#3 的「以 A 的键结尾的水位行只有一条」由幂等写保证。
- 剩余事项：
  - 复核（verify）；
  - 本修复之前已写下插件绑定、缺核心水位的库不回填：两处绑定都没进 `main`，只存在于本分支的开发库。插件对已有绑定只核对、不碰核心水位（`scoped-sync.spec.ts`「同一用户刷新令牌后继续使用原库」钉住）；需要时删开发库重建；
  - 两个标签页真正并发地首次绑定、撞上竞争行唯一键时，这一轮同步失败、下一轮即按已写下的绑定核对，与插件绑定行原有的竞争口径一致，没有另加重试。

### EV-01a212fb699e71ea9d0a1933db2516fb：修复（补真栈回归）

- 时间：2026-11-25T21:53:16+0800
- 操作：fix
- 执行者：ai；anthropic/claude-opus-5-5；会话 8b131c28-0801-4140-925f-c944249ee3cf
- 输入快照：`2b12192f5f7ad2bc9004f90014a9f2de7ee01b4f`（提交视图，已含上一修复事件的改动）
- 输出快照：工作区树 `10dff253d738defe79f10c55809862563ff88081`（`ai-review snapshot --worktree`，基于 `2b12192f`）；本记录不在该树内。
- 状态：Fixed（不变）
- 结论：上一修复事件的单测都用替身，没有覆盖「连接之后在普通事务里写 `rxdb_migration`」在真实本地适配器上的表现。补一条真栈端到端回归，真实 wa-sqlite（`IDBBatchAtomicVFS` 持久化）加真实 Supabase，照原记录的触发链走一遍，通过。
- 改动：`packages/rxdb-adapter-supabase/src/__tests__/identity-guard.spec.ts:268` 新增「没声明身份时以 A 同步过的库：之后以 B 声明打开被拒，以 A 声明打开照常同步」：不声明身份，以 A 推一条、再留一条待推，销毁实例 → 以 B 声明打开同一个库名，`connect()` 抛 `RxDBIdentityMismatchError`、仓储读不到行 → 以 A 声明打开照常连接，未声明期留下的待推变更推得出去，远端两条都在。`openDatabase` / `createClient` 的 `declared` 改为可传 `null`（不声明身份），其余用例不变。
- 验证：`pnpm nx test rxdb-adapter-supabase --skip-nx-cache -- src/__tests__/identity-guard.spec.ts src/__tests__/caller-identity.spec.ts --coverage.enabled=false`，2 个文件 27 条通过（新用例 855ms）。只跑这两个 spec：它们只删自己建的 todo 与日志行（`identity-guard.spec.ts` 的 `afterAll` 按 `todoIds` 删），不碰 dev demo 共用的数据；`test-env` 重跑的初始化 SQL 幂等。修复前的红灯没有在真栈上实跑：那要临时回退已提交的 `remote-backend.ts`，按代码推演修复前 B 的声明打开会被就地补绑、`connect()` 成功，这条必红；缺陷本身已由上一事件的核心与插件单测红过。
- 剩余事项：复核（verify）。
