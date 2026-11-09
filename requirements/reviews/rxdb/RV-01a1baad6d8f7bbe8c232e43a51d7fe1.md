---
id: RV-01a1baad6d8f7bbe8c232e43a51d7fe1
title: '旧 disconnect 收尾删除新连接缓存并泄漏已连接适配器'
project: rxdb
branch: refs/heads/codex/full-review-main-20261108
range: project
base_ref: null
review_scopes: []
scope_id: 'project:rxdb'
status: Resolved
severity: P2
source_view: commit
source_snapshot: '0ffa3c419fcc59dc3e13d695ca4658116134bfa0'
base_sha: null
found_branch: refs/heads/codex/full-review-main-20261108
found_snapshot: '0ffa3c419fcc59dc3e13d695ca4658116134bfa0'
found_range: project
created: 2026-11-08
updated: 2026-11-10
anchors:
  - 'packages/rxdb/src/RxDB.ts#disconnect'
affected_projects: []
related_findings:
  - RV-01a1ba3ae17c7e2eb56b5e4fd2c4e08f
pr: null
---

# RV-01a1baad6d8f7bbe8c232e43a51d7fe1：旧 disconnect 收尾删除新连接缓存并泄漏已连接适配器

## 问题与影响

本地与远程适配器均已连接，本地插件的旧 install 还在等待时，单点 disconnect(local) 会停在调度等待。另一条 disconnectAll() 可以完成全局停机并允许新连接成功建立；旧 install 随后结算，旧 disconnect 的 finally 却无条件删除同名适配器缓存、清空适配器流名字并复位表集。已连接实例表仍指向新适配器，缓存表却丢了它，后续 getAdapter 又造出另一份未连接实例；最终 destroy 也不关闭真正连接着的那一份。需要并发拆卸与迟到安装的组合，定为 P2。

## 证据与根因

证据快照：`0ffa3c419fcc59dc3e13d695ca4658116134bfa0`。

`packages/rxdb/src/RxDB.ts:1324` 至 `packages/rxdb/src/RxDB.ts:1336` 的收尾按名字直接删除 Map 项并撤回名字，没有比较 await 之前捕获的 Promise / 实例或连接纪元。旧异步调用可在新纪元建立之后才运行到这里。

公共 RxDB 入口、隔离适配器替身复现：

1. 连接 local 与 remote；安装只 inject adapter:local 的 scoped 插件，首次 install 等手动 Promise，后续安装立即完成。
2. 启动 disconnect(local)，不等待；随后 await disconnectAll()。
3. await connect(local) 得到 fresh，再连接 remote。新连接已经成功。
4. 结算旧插件 install，等待第一步的旧 disconnect 收尾，再调用 getAdapter(local)。

实际结果：getAdapter 返回值与 fresh 不同，localAdapterSync 仍等于 fresh，本地工厂累计调用 3 次。调用 destroy() 后，fresh 的 disconnect 仍未被调用。两个状态来源相互矛盾并留下未关闭连接，复现没有使用 provider/consumer 插件链。

相关记录 RV-01a1ba3ae17c7e2eb56b5e4fd2c4e08f 关注 connect 在拆卸窗口直接返回旧适配器；本记录关注已经成功建立的新连接被旧 finally 清掉，修复需要旧收尾的身份守卫。

## 修复方向

对 await 后的断连收尾加实例 / Promise / 纪元所有权校验；旧调用只能清理自己所属那代缓存、名字与表集。协调局部和全局实际关闭的所有权，避免重复关闭；保留全局停机不等待无限挂起 install 的既有契约。回归必须断言缓存与 localAdapterSync 指向同一新实例，且最终销毁确实关闭它。

## 处理记录

### EV-01a1baad6dbb77daba82e38db4055030：发现

- 时间：2026-11-08T18:21:30+08:00
- 操作：review/full（承接已覆盖文件，补充并发清理发现）
- 执行者：ai；provider、model、version、session 均为 unknown
- 输入快照：`0ffa3c419fcc59dc3e13d695ca4658116134bfa0`
- 输出快照：`0ffa3c419fcc59dc3e13d695ca4658116134bfa0`（仅写评审记录）
- 状态：未登记 → Open
- 结论：旧收尾删除新缓存，真实已连接实例最终未被关闭。
- 验证：公共入口复现输出 same=false、localAdapterSyncIsFresh=true、factories=3、freshClosedAfterDestroy=false。核心既有完整测试为 154 文件通过、2,717 用例通过、1 个跳过，未包含此场景。
- 剩余事项：补回归并修复后 verify；未改实现，未将本次补充计为重新全读 RxDB.ts。

### EV-01a1c0410e2d7a2b8e20e9477abd8219：修复

- 时间：2026-11-09T20:20:51+08:00
- 操作：fix
- 执行者：ai；anthropic/claude-opus-5-5；会话 aa117580-681a-4540-85b2-3c61967b2092（Claude Code 并行子 agent G03）
- 输入快照：`1b5fb4e43f449bace1d6f67df78e55a129863f50`（提交视图，修复起点）
- 输出快照：工作区树 `2fd7ea2d2bcbd101339003bd55cc144fa886b6b7`（`ai-review snapshot --worktree`，基于 `788c4baf`（外部自动提交，含各组 WIP））
- 状态：Open → Fixed
- 结论：复核成立。单点 `disconnect()` 卡在插件释放等待上（INV-7 要求释放早于 `adapter.disconnect()`），期间 `disconnectAll()` 完成停机、重连成功；旧调用醒来会对已关闭的旧实例再调一次 `adapter.disconnect()`，并在 finally 里按名字删掉新连接的缓存、撤回适配器名、复位表集：`getAdapter()` 另造实例，`localAdapterSync` 仍指新实例，`destroy()` 关不到真正连着的那一份。同类：同一份实例的两次并发 `disconnect()` 各关一次。需并发拆卸与迟到安装组合，维持 P2。与 RV-01a1ba3ae17c7e2eb56b5e4fd2c4e08f 同在拆卸窗口，修法共用 `#teardown_map`，根因不同，两条分别保留。
- 改动：`packages/rxdb/src/RxDB.ts` 拆卸本体抽成 `#disconnect_adapter(name, cached)`：`await cached` 之后、插件释放等待之后各核对一次缓存里是否仍是自己这一份，不是就整段退出（不二次关闭、不清理）；finally 的收尾 `#release_adapter_entry` 同样只在仍属自己这一代时执行。同一份实例的并发 `disconnect()` 经 `#teardown_map` 共用一次拆卸；`disconnectAll()` 接管单点拆卸的登记，拆完即摘，重连不必等那条可能永远等不到的旧释放（保留全局停机不等挂起安装的契约）。
- 验证：`packages/rxdb/src/__tests__/RxDB.disconnect-window.spec.ts` 另两条：并发两次 `disconnect` 只关一次；旧 `disconnect` 被接管后 `getAdapter('local')` 与 `localAdapterSync` 都是新实例、工厂只调 2 次、旧实例只关 1 次、`destroy()` 关掉新实例。修复前 2 failed（`expected "vi.fn()" to be called 1 times, but got 2 times`；`getAdapter` 返回另一份实例）；修复后本文件 5/5，生命周期 8 个文件 102/102 通过；本组改动文件 eslint（max-warnings 0）与 `tsc -p packages/rxdb/tsconfig.lib.json --noEmit` 通过。
- 剩余事项：本组收尾统一跑 `rxdb:test` 整包后 verify。

### EV-01a1c072b7c471d2a6a3c570ea3536db：复核（核心整包通过，消费者待主会话）

- 时间：2026-11-09T21:15:05+08:00
- 操作：verify
- 执行者：ai；anthropic/claude-opus-5-5；会话 aa117580-681a-4540-85b2-3c61967b2092（Claude Code 并行子 agent G03，复核角色）
- 输入快照：工作区树 `2fd7ea2d2bcbd101339003bd55cc144fa886b6b7`（修复事件的输出快照）
- 输出快照：工作区树 `59a948adcb0fe90699bfcf69c873e0dff61d1594`（`ai-review snapshot --worktree`，基于 `bad25587`（外部自动提交，含各组 WIP））
- 状态：Fixed（不变）
- 结论：核心侧修复有效：`pnpm nx run rxdb:test --exclude-task-dependencies --skip-nx-cache`（21:08:25 – 21:09:13）173 个文件，2815 通过 / 1 跳过，覆盖率 statements 95.86% / branches 92.76% / functions 96.14% / lines 96.52%；`rxdb:lint` 与 `tsc -p packages/rxdb/tsconfig.lib.json --noEmit` 通过。并发 `disconnect()` 共用一次拆卸、被 `disconnectAll()` 接管后不再二次关闭，是适配器可观察到的行为变化（`adapter.disconnect()` 调用次数），适配器、绑定与应用的测试经核心 dist 解析，本轮未验证，暂不改为 Resolved。
- 验证：见结论；消费者未跑。
- 剩余事项：同 RV-01a1ba3ae17c7e2eb56b5e4fd2c4e08f 的主会话命令（重建核心 dist 后跑三端绑定、四个本地适配器、working-tree / sync 插件，再 `pnpm test-all`），全绿后补 verify 事件改为 Resolved。

### EV-01a1c25ebdf37de6bf39806f612ed6d8：复核

- 时间：2026-11-10T06:12:31+08:00
- 操作：verify
- 执行者：ai；anthropic/claude-sonnet-5-5；会话 aa117580-681a-4540-85b2-3c61967b2092（Claude Code 主会话，复核角色）
- 输入快照：工作区树 `044e8370001ccbd4355dfbc5ef673d4ac730e326`（基于 `0aad34cf`，含未提交改动）
- 输出快照：工作区树 `044e8370001ccbd4355dfbc5ef673d4ac730e326`（复核未改代码）
- 状态：Fixed → Resolved
- 结论：旧 disconnect 的收尾只清自己那一代的缓存，被 disconnectAll 接管后整段退出，并发调用共用一次拆卸。
- 验证：`pnpm test-all`（`lint`、`typecheck`、`test`、`test-memory`、`test-browser`、`build`、`audit-lazy-backend`、`e2e` 共 101 个项目与 27 个依赖任务）最终一轮全部成功，退出码 0；同上：核心整包与上述消费者的 `test` 通过。
- 剩余事项：无。
