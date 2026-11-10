---
id: RV-01a1bb3cfe4d78d6a427d6c7ecc1b48d
title: 'React 工作树换库再切回时旧请求覆盖新入口状态'
project: rxdb-plugin-working-tree-react
branch: refs/heads/codex/full-review-main-20261108
range: project
base_ref: null
review_scopes: []
scope_id: 'project:rxdb-plugin-working-tree-react'
status: Resolved
severity: P2
source_view: commit
source_snapshot: '0ffa3c419fcc59dc3e13d695ca4658116134bfa0'
base_sha: null
found_branch: refs/heads/codex/full-review-main-20261108
found_snapshot: '0ffa3c419fcc59dc3e13d695ca4658116134bfa0'
found_range: project
created: 2026-11-08
updated: 2026-11-09
anchors:
  - 'packages/rxdb-plugin-working-tree-react/src/use-working-tree.ts#useWorkingTree'
  - 'packages/rxdb-plugin-working-tree-react/src/use-worktrees.ts#useWorktrees'
affected_projects: []
related_findings: []
pr: null
---

# RV-01a1bb3cfe4d78d6a427d6c7ecc1b48d：React 工作树换库再切回时旧请求覆盖新入口状态

## 问题与影响

同一个组件把 Provider 从数据库对象 A 切到 B，再切回同一个 A 对象时，首次 A 入口尚未结束的查询会被重新接受。即使第二次 A 入口已完成更新的查询，首次 A 的迟到结果仍覆盖它。`useWorkingTree` 的十四格及 `useWorktrees` 的十格都受影响：面板可能重新显示已经失效的未提交状态、提交结果或检出位列表。边界是复用同一个数据库实例的往返切换，定为 P2；这次只证实 UI 状态回退，没有证明数据库写错。

## 证据与根因

冻结 SHA：`0ffa3c419fcc59dc3e13d695ca4658116134bfa0`。

`packages/rxdb-plugin-working-tree-react/src/use-working-tree.ts:96` 在 database 不同时重置 slot，但 `:104` 的 updater 只比 `current.database === database`，没有区分两次 A 入口。`packages/rxdb-plugin-working-tree-react/src/use-worktrees.ts:90` 起也有同一模式。

命令层每次 `useMemo` 重建时拥有一份新的请求代次 Map：`packages/rxdb-plugin-working-tree/src/working-tree/working-tree-commands.ts:136`、`packages/rxdb-plugin-working-tree/src/checkout/worktree-commands.ts:101`。因此新 A 的查询只会淘汰新 A 的旧请求，首次 A 闭包中的代次仍有效。数据库对象身份在 A→B→A 后重新相等，旧 updater 绕过归属检查。

现有 `packages/rxdb-plugin-working-tree-react/src/__tests__/provider-switch.spec.ts` 和 `packages/rxdb-plugin-working-tree-react/src/__tests__/use-worktrees.spec.tsx:126` 覆盖 A→B 丢弃迟到结果，没有覆盖重新进入同一个 A。

复现 `repro-working-tree-react-provider-aba.cjs` 使用实际 React 19.3.1、ReactDOM 和 HappyDOM，加载源 hook 与已构建的真实共享命令实现；仅把 `useRxDB` 注入接缝替换为随 render 指定的 A/B 对象。先在 A 发出未完成的 isEnabled/list；依次 render B、A；新 A 查询已完成为 `false` 与空列表后，释放首次 A 的 `true` 与旧列表。实际输出：

- 迟到前：isEnabled=`false`，list=`empty/[]`；
- 迟到后：isEnabled=`true`，list=`success/[stale-old-request]`。

两个查询都在新请求完成后回退，证明不是尚未刷新或单纯 idle 的表现。Angular/Vue 的入口按公开契约绑定创建时的库、换库重建组件，没有把此反例泛化成三端缺陷。

## 修复方向

状态归属同时包含当前入口的不可复用身份/代次，A→B→A 也必须产生新的身份；旧命令 closure 持有旧身份，写回时原样丢弃。保留 React 并发 render 被放弃时的正确行为，不用渲染期写 ref 记录最新库。给两种 hook 补往返换库、旧错误迟到、StrictMode 的回归。

## 处理记录

### EV-01a1bb3cfe7578b5b256dc1e7b538135：发现

- 时间：2026-11-08T20:59:03+08:00
- 操作：review/full（parallel-001/plugins）
- 执行者：ai；provider、model、version、session 均为 unknown
- 输入快照：`0ffa3c419fcc59dc3e13d695ca4658116134bfa0`
- 输出快照：`0ffa3c419fcc59dc3e13d695ca4658116134bfa0`（源码未改）
- 状态：未登记 → Open
- 结论：相同根因在 useWorkingTree 和 useWorktrees 两处复现，合并为一条 RV。
- 验证：`node /Users/jimmy/Documents/aiao/rxdb/.git/ai-review/v1/runs/full-main-20261108/parallel-001/plugins/repro-working-tree-react-provider-aba.cjs`，5 秒上限，全部断言通过。首次从仓库根 require 插件因根未声明该包失败，改从 React 包自己的合法依赖上下文加载后复现成功；没有改依赖配置。
- 剩余事项：补框架正式回归并修复入口归属判据，再 verify；未运行重型 Nx targets。

### EV-01a1bb4218667cc1b8dadc7f2970b45b：证据行号核验

- 时间：2026-11-08T21:03:53+08:00
- 操作：review/full（证据定位校准）
- 执行者：ai；provider、model、version、session 均为 unknown
- 输入快照：`0ffa3c419fcc59dc3e13d695ca4658116134bfa0`
- 输出快照：同输入（源码未改）
- 状态：Open → Open
- 结论：逐项读取冻结源码实际行号，校准最初记录中指向相邻注释/空行的定位；问题、根因与复现结论不变，既有事件保持原样。
- 验证：写前两次 git hash-object 一致；首次摘要 `c809f1a7cbe95d0a8ada739c18a5275ef59845d0`。证据使用实际代码行。
- 剩余事项：原记录所列修复与正式回归。

### EV-01a1c05cef347fa1b7b905941b49745e：修复

- 时间：2026-11-09T20:51:18+08:00
- 操作：fix
- 执行者：ai；anthropic/claude-opus-5-5；会话 aa117580-681a-4540-85b2-3c61967b2092（Claude Code 并行子 agent G08）
- 输入快照：`1b5fb4e43f449bace1d6f67df78e55a129863f50`（提交视图）
- 输出快照：工作区树 `d60ea42302e76908ddc1302dd6c243e290ce9e26`（`ai-review snapshot --worktree`，基于 `bad25587`（外部自动提交，含各组 WIP））
- 状态：Open → Fixed
- 结论：成立，P2 维持。`useWorkingTree` 与 `useWorktrees` 的 slot 以库对象作归属，A→B→A 回到同一个库对象后身份重新相等，首次 A 入口的命令闭包写回能通过 `current.database === database`，覆盖第二次 A 入口已完成的查询；命令层每次重建各有一份请求代次，挡不住跨入口的旧闭包。Angular / Vue 的入口绑定创建时的库、换库重建组件，不受影响（与原记录一致）。修法：slot 增加只在建 slot 时新建一次的 `entry` 对象作入口身份，`patch` 按 `entry` 比对归属；仍用渲染期调整状态复位，不在渲染期写 ref。
- 改动：`packages/rxdb-plugin-working-tree-react/src/use-working-tree.ts`、`packages/rxdb-plugin-working-tree-react/src/use-worktrees.ts`（`openSlot()`、`entry`、`patch` 依赖 `[entry]`）；回归 `packages/rxdb-plugin-working-tree-react/src/__tests__/provider-switch.spec.ts` 新增两条（A→B→A 后首次 A 入口迟到的 `isEnabled` 成功与 `status` 失败都不覆盖第二次入口；StrictMode 下同样丢弃），`packages/rxdb-plugin-working-tree-react/src/__tests__/use-worktrees.spec.tsx` 新增一条（迟到的 `list()` 结果不覆盖第二次入口的空列表）。
- 验证：修复前红：`npx vitest run --coverage.enabled=false src/__tests__/provider-switch.spec.ts src/__tests__/use-worktrees.spec.tsx` 3 条失败——`isEnabledState` 被改回 `{ phase: 'success', value: true }`、`listState.phase` 被改回 `success`。修复后绿：该包 4 个文件 70 条全部通过（含原有「一次命令都没发起过就换库，不触发多余的状态写入」与 StrictMode 用例）；`npx tsc -p tsconfig.lib.json --noEmit` / `tsconfig.spec.json --noEmit` 无错误，改动文件 eslint（max-warnings 0）通过。
- 剩余事项：无；收尾复核。

### EV-01a1c08283ac7960bcb71f15ab921b45：复核

- 时间：2026-11-09T21:32:21+08:00
- 操作：verify
- 执行者：ai；anthropic/claude-opus-5-5；会话 aa117580-681a-4540-85b2-3c61967b2092（Claude Code 并行子 agent G08，复核角色）
- 输入快照：工作区树 `d60ea42302e76908ddc1302dd6c243e290ce9e26`（修复事件的输出快照）
- 输出快照：工作区树 `bc1f2a85f04d66d2fe1d923c2cba3c8237b435c5`（`ai-review snapshot --worktree`，基于 `74da4983`（外部自动提交，含各组 WIP））
- 状态：Fixed → Resolved
- 结论：修复有效。两个 hook 的写回只认建 slot 时生成的 `entry`，A→B→A 每次进入都是新入口；渲染期调整状态的复位方式与「不在渲染期写 ref」的约束保持不变，普通换库、StrictMode、从未发命令就换库的既有用例照绿。Angular / Vue 入口绑定创建时的库，无对应路径。消费者 `dev-rxdb-react` 经源码使用两个 hook，相关单测通过。
- 验证：`pnpm nx run rxdb-plugin-working-tree-react:test --exclude-task-dependencies --skip-nx-cache`：5 个文件 71 条通过；整包 eslint（max-warnings 0）通过；`apps/dev-rxdb-react` 下 `npx vitest run src/app/components/AppBranchManager.spec.tsx src/app/pages/working-tree/working-tree.compare.spec.tsx --coverage.enabled=false`：9 条通过。
- 剩余事项：无。
