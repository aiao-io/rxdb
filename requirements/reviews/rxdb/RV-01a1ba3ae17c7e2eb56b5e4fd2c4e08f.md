---
id: RV-01a1ba3ae17c7e2eb56b5e4fd2c4e08f
title: '断连尚未完成时 connect 会返回正在关闭的旧适配器'
project: rxdb
branch: refs/heads/codex/full-review-main-20261108
range: project
base_ref: null
review_scopes: []
scope_id: 'project:rxdb'
status: Fixed
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
  - 'packages/rxdb/src/RxDB.ts#connect'
  - 'packages/rxdb/src/RxDB.ts#disconnect'
affected_projects: []
related_findings: []
pr: null
---

# RV-01a1ba3ae17c7e2eb56b5e4fd2c4e08f：断连尚未完成时 connect 会返回正在关闭的旧适配器

## 问题与影响

同一实例先成功连接某个适配器，再启动异步 `disconnect(name)`；当底层 `adapter.disconnect()` 尚未结算时再次调用 `connect(name)`，新调用会成功返回那份正在关闭的旧适配器。此时 `connected$` 已为 `false`、`initialized` 已复位为 `false`，并未建立新连接。依赖 `await connect()` 判断可用性的并发登录、切库或组件重挂载路径会继续使用即将失效的连接。触发需要拆卸与重连重叠，定为 P2。

## 证据与根因

证据快照：`0ffa3c419fcc59dc3e13d695ca4658116134bfa0`。

- `packages/rxdb/src/RxDB.ts:1074` 至 `packages/rxdb/src/RxDB.ts:1078`：缓存路径只核对 `#destroyed` 与是否仍在已连接集合，未区分「正在引导」和「正在断连」，直接返回上次已成功的 Promise。
- `packages/rxdb/src/RxDB.ts:1310` 至 `packages/rxdb/src/RxDB.ts:1332`：`disconnect()` 先摘除连接状态并执行全局拆卸，等待底层 `adapter.disconnect()` 之后才在 `finally` 删除连接 Promise。整个等待窗口仍可命中旧 Promise。
- `RxDB.reconnect.spec.ts` 与 `RxDB.disconnect-race.spec.ts` 的重连用例均先等待断连完成，未覆盖底层关闭仍在进行的窗口。

在仓库根完成 `pnpm nx build rxdb --skipRemoteCache --output-style=static` 后，以下 Node.js 最小复现可验证缓存路径。远程适配器使用最小替身，因为该缺陷在宿主缓存仲裁层，与 SQL 或网络行为无关。

```javascript
import { RxDB, SyncType } from './packages/rxdb/dist/index.js';

const closing = Promise.withResolvers();
const entered = Promise.withResolvers();
const db = new RxDB({
  dbName: 'review-disconnect-window',
  entities: [],
  multiInstance: false,
  sync: { remote: { adapter: 'remote' }, type: SyncType.None }
});
const adapter = {
  connect: async () => adapter,
  disconnect: async () => {
    entered.resolve();
    await closing.promise;
  }
};
db.adapter('remote', () => adapter);
await db.connect('remote');
const disconnecting = db.disconnect('remote');
await entered.promise;
console.log((await db.connect('remote')) === adapter, db.initialized);
closing.resolve();
await disconnecting;
await db.destroy();
```

实际输出为 `true false`；额外订阅验证 `connected$` 为 `false`，底层 `connect()` 仅调用一次。预期第二次连接应明确拒绝拆卸中的请求，或等待拆卸完成再建立新连接。

## 修复方向

为适配器拆卸建立独立状态或 Promise，在命中连接缓存之前仲裁；保持引导期重入仍返回原 Promise 的契约。补上单适配器关闭窗口、全局拆卸窗口和两个适配器中仅断开一个的回归用例。

## 处理记录

### EV-01a1ba3ae1a5739b99f8b36ef0d6d609：发现

- 时间：2026-11-08T16:17:28+08:00
- 操作：review/full
- 执行者：ai；provider、model、version、session 均为 unknown（会话未提供可核实的模型 ID）
- 输入快照：`0ffa3c419fcc59dc3e13d695ca4658116134bfa0`
- 输出快照：`0ffa3c419fcc59dc3e13d695ca4658116134bfa0`（仅写评审记录）
- 状态：未登记 → Open
- 结论：异步关闭窗口内第二次 `connect()` 成功返回旧连接，未重新引导。
- 验证：核心 Nx build 成功，utils 与 rxdb 构建命中本地缓存；Node.js 最小复现输出 `resolved / returnsClosingAdapter=true / connected=false / initialized=false / connects=1`。核对既有重连与断连竞态测试；本事件未运行完整单测。
- 剩余事项：按单问题 fix 流程补回归并修复，之后独立复核；本次评审未改业务代码。

### EV-01a1ba56b30177c5a63c4676931b9d75：补充验证

- 时间：2026-11-08T16:46:46+08:00
- 操作：review/full（验证补充，不变更问题状态）
- 执行者：ai；provider、model、version、session 均为 unknown
- 输入快照：`0ffa3c419fcc59dc3e13d695ca4658116134bfa0`
- 输出快照：`0ffa3c419fcc59dc3e13d695ca4658116134bfa0`（仅更新评审记录）
- 状态：Open → Open
- 结论：既有自动测试通过不消除本记录已复现的问题，本记录保持 Open。
- 验证：通过 Nx 执行根项目 `test-scripts`（544 用例）、核心断连 / 重连 / 备份相关测试（150 用例）、React 全部单测（228 用例）、Vue 全部单测（232 用例），合计 1,154 用例全部通过；核心与两框架构建通过；本批问题的独立复现证据见发现事件。需求一致性审计通过。
- 剩余事项：实现针对本问题的回归与修复，再按 verify 复核；全仓评审仍在继续，本事件不表示其余文件已审完。

### EV-01a1c0410dc6798bb423b093528774ef：修复

- 时间：2026-11-09T20:20:51+08:00
- 操作：fix
- 执行者：ai；anthropic/claude-opus-5-5；会话 aa117580-681a-4540-85b2-3c61967b2092（Claude Code 并行子 agent G03）
- 输入快照：`1b5fb4e43f449bace1d6f67df78e55a129863f50`（提交视图，修复起点）
- 输出快照：工作区树 `2fd7ea2d2bcbd101339003bd55cc144fa886b6b7`（`ai-review snapshot --worktree`，基于 `788c4baf`（外部自动提交，含各组 WIP））
- 状态：Open → Fixed
- 结论：复核成立，且窗口比原报告大：除单适配器 `adapter.disconnect()` 尚未结算外，`disconnectAll()` 在 `#shutdown()` 清空已连接集合之后、逐个 `adapter.disconnect()` 期间同样命中——缓存里的连接 Promise 仍在，`!#connected_adapters.has()` 被当成「还在引导」原样返回；两个适配器只断一个时同理。依赖 `await connect()` 判断可用性的重挂载、切库路径会拿到正在关闭的实例。需拆卸与重连重叠，维持 P2。契约取舍：停机窗口内 `init()` 现有设计是明确拒绝，但对**同名**适配器拒绝会让卸载后立即重挂（如 StrictMode 双调用）直接报错；改为等这次拆卸结束再重新引导，`connect()` 仍 resolve 一个可用的适配器，不改变返回语义。
- 改动：`packages/rxdb/src/RxDB.ts` 新增 `#teardown_map`（适配器名 → 拆的是哪一份缓存实例与拆完信号），`disconnect()` / `disconnectAll()` 同步登记、拆完按身份摘除（`#track_teardown`）；`connect()` 在终态判定之后、连接缓存之前查它，有在飞的拆卸就等它结算（成败都）再调一次 `connect()`。`disconnectAll()` 覆盖它开始时缓存着的每个名字。`connect()` / `disconnect()` / `disconnectAll()` 的 TSDoc 写明新语义。
- 验证：回归 `packages/rxdb/src/__tests__/RxDB.disconnect-window.spec.ts`「拆卸窗口内的 connect() 不交出正在关闭的旧适配器」三条（单适配器 / disconnectAll / 两适配器只断一个）。修复前 3 failed（拆卸尚未结束时 `connect()` 已结算，`expected true to be false`）；修复后通过，并断言新实例不同于旧实例、`connected$` 为 `true`、`localAdapterSync` 指向新实例、未断开的那个适配器始终连着。生命周期 8 个文件 102/102 通过；本组改动文件 eslint（max-warnings 0）与 `tsc -p packages/rxdb/tsconfig.lib.json --noEmit` 通过。
- 剩余事项：本组收尾统一跑 `rxdb:test` 整包后 verify；建议主会话在 CHANGELOG 的 Bug Fixes 记一条（拆卸窗口内同名 `connect()` 改为等拆卸结束后重新引导）。
