---
id: RV-01a1bbbdb6a07c31a83e2ee1d21f64bf
title: '多实例网关直接发送合法实体代理负载，外部更新通知抛 DataCloneError'
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
updated: 2026-11-09
anchors:
  - 'packages/rxdb/src/gateway/RxDBTabsGateway.ts#broadcastEntityEvent'
  - 'packages/rxdb/src/entity/entity-manager.ts#notifyExternalUpdate'
affected_projects: []
related_findings: []
pr: null
---

# RV-01a1bbbdb6a07c31a83e2ee1d21f64bf：多实例网关直接发送合法实体代理负载，外部更新通知抛 DataCloneError

## 问题与影响

开启默认的多实例网关后，把已挂载实体作为 notifyExternalUpdate 的完整 patch 传入，会同步抛 DataCloneError，跨连接通知未送达。该参数类型为 Readonly<Partial<InstanceType<T>>>，完整实体实例是合法输入；实例由核心构造为 Proxy，原样送给 BroadcastChannel 不能结构化克隆。普通字面量 patch 正常。需要完整实体代理负载，按 P2 边界条件记录，不泛化为所有通知或所有多实例写入失败。

## 证据与根因

冻结快照：`0ffa3c419fcc59dc3e13d695ca4658116134bfa0`。

`packages/rxdb/src/entity/entity-manager.ts:634` 附近的 notifyExternalUpdate 直接把传入 patch 放进 EntityLocalUpdatedEvent。`packages/rxdb/src/gateway/RxDBTabsGateway.ts:250` 附近的出站广播将完整原 event 交给 topic.emit；`packages/utils/src/@browser/broadcast-channel-pool.ts:76` 附近最终直接 channel.postMessage(message)，途中没有把实体代理快照化。接收端的 cloneGatewayEvent 发生在消息已经经过结构化克隆之后，无法解决出站 Proxy。

有界复现使用真实 RxDB、实体装饰器与 Node 原生 BroadcastChannel / Web Locks：

1. 注册一个带 title 的实体和真实 PGlite 适配器工厂，multiInstance=true；只调用 init()，不连接或打开存储。
2. new Row({title:current}) 得到核心挂载代理。
3. notifyExternalUpdate(Row,entity.id,entity) 同步抛 DataCloneError：[object Object] could not be cloned。
4. 对照以 {title:entity.title} 为 patch 调用成功。

这验证的是公开通知与实际广播序列化边界，不是模拟 channel 的行为。接口明确允许在尚未连接适配器时发通知，因此没有以未连接状态代替业务前置条件。当前 gateway 两份测试都使用同步原样传递的 topic 替身和普通对象负载，未验证真实实体 Proxy 的发送。

## 修复方向

在广播边界形成可结构化克隆的数据快照，保留 bigint、Date、binary view 与表集标签的现有语义；同步核对系统表与外部通知生产者。补真实挂载实体作为 patch、普通 patch、异构值和接收端副本隔离的回归，错误应在有效消息发送前被处理。

## 处理记录

### EV-01a1bbbdb6ca7fa981b9d705d7fe017c：发现

- 时间：2026-11-08T15:18:55.064Z
- 操作：review/full（parallel-001/core）
- 执行者：ai；provider、model、version、session 均为 unknown
- 输入快照：`0ffa3c419fcc59dc3e13d695ca4658116134bfa0`
- 输出快照：`0ffa3c419fcc59dc3e13d695ca4658116134bfa0`（仅写评审记录）
- 状态：未登记 → Open
- 结论：公开API接受的完整实体在真实广播边界不可发送，普通对象对照成功。
- 验证：`node <git-common-dir>/ai-review/v1/runs/full-main-20261108/parallel-001/core/repro-gateway-entity-patch.mjs`，退出 0，entityError.name=DataCloneError、plainError=null；未连接存储、未改业务或原测试。
- 剩余事项：补正式回归并按 fix/verify 处理；PGlite正常系统表生产链另由storage组核对，不将未运行的链路计为已证实。

### EV-01a1c06cd79779f3afcba21062cff31e：修复

- 时间：2026-11-09T21:08:40+08:00
- 操作：fix
- 执行者：ai；anthropic/claude-opus-5-5；会话 aa117580-681a-4540-85b2-3c61967b2092（Claude Code 并行子 agent G03）
- 输入快照：`1b5fb4e43f449bace1d6f67df78e55a129863f50`（提交视图，修复起点）
- 输出快照：工作区树 `b249119de9683316045fb82ad01bf90f5ebdec7e`（`ai-review snapshot --worktree`，基于 `bad25587`（外部自动提交，含各组 WIP））
- 状态：Open → Fixed
- 结论：复核成立。`RxDBTabsGateway.#broadcastEntityEvent` 把本地事件原样交给 `topic.emit` → `channel.postMessage`；`notifyExternalUpdate` 的 patch 类型是 `Partial<InstanceType<T>>`，直接传实体实例（Proxy）时 `postMessage` 同步抛 `DataCloneError`，跨 tab 通知送不出去，异常还顺着本地派发抛回调用方。真实浏览器实测另核出：实体实例的展开里带关系属性（如 `author`），值若是另一个实体实例，同样克隆不了。仓库内现有生产者 `packages/rxdb-i18n/src/i18n.ts:173` / `:484` 传的是展开后的普通对象，不受影响；需要调用方直接传实体实例，维持 P2。
- 改动：`packages/rxdb/src/gateway/RxDBTabsGateway.ts` 出站前经 `toOutboundEvent()` 生成副本：每条实体记录的 `patch` / `inversePatch` 逐键拷成普通对象，值为实体实例或实体实例数组的属性（关系对象）不跨 tab——克隆不了，在另一个 tab 里也只会变成冒充实体的普通对象，关系身份由外键列携带；其余字段（bigint、Date、二进制视图、表集标签、来源标记）原样交给结构化克隆。本地派发的事件对象不变，接收端仍按原逻辑 `cloneGatewayEvent` 隔离副本。
- 验证：回归 `packages/rxdb/src/__tests__/gateway/gateway-entity-payload.spec.ts`（真实 RxDB 多实例网关 + 同名频道上的真实 `BroadcastChannel` 旁听）3 条：实体实例本身当 patch、patch 夹着另一个实体实例、普通 patch 的 bigint / Date / Uint8Array。修复前（换回 `1b5fb4e4` 的网关）2 failed（`DataCloneError: Failed to execute 'postMessage' on 'BroadcastChannel'`），普通 patch 对照通过；修复后 3/3，`src/__tests__/gateway/` 与 `RxDB.gateway-scope.spec.ts` 共 4 个文件 31/31 通过；本组改动文件 eslint（max-warnings 0）与 `tsc -p packages/rxdb/tsconfig.lib.json --noEmit` 通过。
- 剩余事项：本组收尾统一跑 `rxdb:test` 整包后 verify。

### EV-01a1c072b7657870837ceccdf752aee8：复核

- 时间：2026-11-09T21:15:05+08:00
- 操作：verify
- 执行者：ai；anthropic/claude-opus-5-5；会话 aa117580-681a-4540-85b2-3c61967b2092（Claude Code 并行子 agent G03，复核角色）
- 输入快照：工作区树 `b249119de9683316045fb82ad01bf90f5ebdec7e`（修复事件的输出快照）
- 输出快照：工作区树 `59a948adcb0fe90699bfcf69c873e0dff61d1594`（`ai-review snapshot --worktree`，基于 `bad25587`（外部自动提交，含各组 WIP））
- 状态：Fixed → Resolved
- 结论：修复有效。核对：快照只发生在网关出站这一处，覆盖所有实体事件生产者（`notifyExternalUpdate`、适配器的变更派发、QueryCache 回填）；本地派发拿到的仍是原事件对象，行为不变；接收端照旧经 `cloneGatewayEvent` 隔离副本并打 `cross-tab` 标记（既有网关用例通过）。表集标签、来源标记、bigint / Date / 二进制视图都由结构化克隆原样送达（回归钉住）。改动只在核心网关内部，不改公开 API；三端绑定无端侧代码。
- 验证：`pnpm nx run rxdb:test --exclude-task-dependencies --skip-nx-cache`（21:08:25 – 21:09:13，晚于本组全部代码改动）173 个文件，2815 通过 / 1 跳过，覆盖率 statements 95.86% / branches 92.76% / functions 96.14% / lines 96.52%；`pnpm nx run rxdb:lint --exclude-task-dependencies --skip-nx-cache`、`tsc -p packages/rxdb/tsconfig.lib.json --noEmit` 通过。
- 剩余事项：无。原记录剩余事项里「PGlite 系统表生产链」属另一组核对范围，本条不据此计为已证实。
