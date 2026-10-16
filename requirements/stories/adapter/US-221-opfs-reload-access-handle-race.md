---
id: US-221
title: OPFS 库在整页刷新后偶发打不开：上一个页面还占着同步访问句柄
status: In Review
priority: High
epic: epic-004-future-features
created: 2026-10-16
updated: 2026-10-16
tags: [adapter, sqlite-wasm, opfs, browser, bug]
---

<!--
INVEST 检查清单:
- [x] Independent (独立): 只动 sqlite-wasm 适配器打开库的路径与三端 demo 的连接失败提示，不依赖其它在途故事
- [x] Negotiable (可协商): 修法落在适配器内的有界重试（owner 2026-10-16 决定与 #122 一起交付）
- [x] Valuable (有价值): 三端 demo 都用这条路径；写库时刷新页面，应用就可能起不来，且页面上看不到任何错误
- [x] Estimable (可估算): 一处打开路径的有界重试 + 一条确定性的浏览器用例 + 三端连接失败提示
- [x] Small (小): 不改 VFS 的协作机制，不改 idb 路径
- [x] Testable (可测试): 用另一个上下文占住句柄即可确定性复现
-->

# 用户故事：OPFS 库在整页刷新后偶发打不开：上一个页面还占着同步访问句柄

## 作为/我想要/以便

**作为** 在浏览器里用 `@aiao/rxdb-adapter-sqlite-wasm`（OPFS）存数据的应用的用户
**我想要** 刷新页面后应用照常打开
**以便** 不会因为刚好在写库时刷新，就面对一个起不来、也不报错的页面，只能再刷一次

## 症状

CI 上实际发生过，复验方式是下载该次运行的 Playwright 工件、解开 trace：

- PR #122 的 `ci / e2e (vue)`（运行 38740222050 第 1 次尝试）：`working-tree.spec.ts`「桌面工作区：变更筛选与历史文件差异」
  三次尝试都在 `page.reload()` 之后 20 秒内等不到 `working-tree-page`。失败时的页面快照里只有应用壳（侧栏、顶栏的分支下拉），
  路由内容没有渲染，也没有任何错误提示。
- trace 的控制台与页面异常：

  ```
  NoModificationAllowedError: Failed to execute 'createSyncAccessHandle' on 'FileSystemFileHandle':
  Access Handles cannot be created if there is another open Access Handle or Writable stream associated with the same file.
  Error: sqlite3_open_v2
  ```

- 同一提交重跑该 job 即通过：偶发，不是确定性失败。这条用例在刷新前刚等完启动时的工作树自动启用，库里还有写入在收尾。

## 根因

由读源码确认：

1. 三端 demo 在支持 OPFS 时都走这条路径：`setup_rxdb_sqlite-wasm.ts`（`apps/dev-rxdb-{angular,react,vue}`）在
   `checkOPFSAvailable()` 为真时注册 `{ vfs: 'opfs', worker: true, workerInstance: new Worker(…) }`。
2. 适配器打开库：[`SqliteClient.#init_sqlite()`](../../../packages/rxdb-adapter-sqlite-wasm/src/SqliteClient.ts) 调
   [`sqliteLoad()`](../../../packages/rxdb-adapter-sqlite-wasm/src/sqlite-load.utils.ts)，后者经 `buildStorageOptions()` 取
   `vfsStorageLoaders.useOpfsStorage(fileName, base)`，再 `initSQLiteCore(storage)`。失败原样抛出，没有重试。
3. `useOpfsStorage` 来自 `@subframe7536/sqlite-wasm@1.4.0`，即 wa-sqlite 的 `OPFSCoopSyncVFS`。它在
   `#requestAccessHandle()` 里先 `#acquireLock()`（以文件的请求通道命名的 Web Lock），再对库文件调 `createSyncAccessHandle()`；
   这一步抛错时只释放、再抛出：

   ```js
   } catch (e) {
     this.#releaseAccessHandle(file);
     throw e;
   ```

   于是 `sqlite3_open_v2` 失败，适配器连接失败。

确定性复现（[`opfs-reload-race.spec.ts`](../../../packages/rxdb-adapter-sqlite-wasm/src/__tests__/opfs-reload-race.spec.ts)：
另一个 Worker 只占句柄、不拿锁）确认：这种状态下今天的打开必定失败，报的正是 `sqlite3_open_v2`。

**推断**（依据是 CI 的报错与上面的取锁顺序）：整页刷新时，上一个页面的专用 Worker 正在销毁，它持有的
Web Lock 先释放、同步访问句柄后关闭，于是新页面落进上面那个状态。

## 范围边界

### In Scope

- sqlite-wasm 适配器（OPFS）打开库时遇到 `NoModificationAllowedError`：在有上限的时间内退避重试，句柄释放后打开成功；
  wa-sqlite 适配器的 `OPFSCoopSyncVFS` 是同一个 VFS，一并覆盖（见 Out of Scope 里的查证结论）
- 重试耗尽仍打不开：抛 `RxDBAdapterSqliteError`，消息点名「库文件的同步访问句柄被另一个上下文占用」，不无限等待
- 三端 demo 连接失败时显示错误，而不是只剩应用壳
- 一条确定性的浏览器用例：另一个上下文占住库文件的同步访问句柄，一段时间后释放

### Out of Scope

- `OPFSCoopSyncVFS` 自身的多标签页协作机制（它靠 Web Lock 与通道通知让出句柄）
- idb VFS（SharedWorker）路径：不用同步访问句柄（推断）
- `@aiao/rxdb-adapter-wa-sqlite` 的 OPFS 系 VFS（2026-10-16 读 vendored 源码查清）：`OPFSCoopSyncVFS` 与 sqlite-wasm 的 `opfs` 档是同一个 VFS，
  同样受影响；修法已上提到共享层 `@aiao/rxdb-adapter-sqlite-core`，两个适配器一起覆盖，只对 `OPFSCoopSyncVFS` 重试。其余不套：
  - `OPFSAdaptiveVFS`：Chromium 上开 `readwrite-unsafe` 句柄，与上一个页面留下的同类句柄共存，撞不上；不支持该模式的浏览器上，
    打开失败时不放它拿的打开锁，同一上下文里重试会一直等那把锁——把报错变成挂死
  - `OPFSWriteAheadVFS`：只用 `readwrite-unsafe` 句柄（上游写明仅 Chromium），与上一个页面留下的句柄共存
  - `OPFSAnyContextVFS`：不开同步访问句柄（读走 `getFile()`、写走 `createWritable()`），打开只取文件句柄
  - `AccessHandlePoolVFS`：建 VFS 时就整池开句柄，撞上占用抛的是 `NoModificationAllowedError` 而不是 `SQLITE_CANTOPEN`；
    池里是随机文件名，没有 `<库名>.sqlite` 可探测；部分失败时已开的句柄不关，同一上下文重试会撞上自己

## 验收标准

| #   | 前置条件                                                                                         | 操作             | 预期结果                                                                                                      | 状态 |
| --- | ------------------------------------------------------------------------------------------------ | ---------------- | ------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | 另一个上下文持有库文件的同步访问句柄，并在重试上限内释放                                         | 打开 OPFS 库     | 等句柄释放后打开成功，期间不抛错                                                                              | ✅   |
| 2   | 句柄一直不释放                                                                                   | 打开 OPFS 库     | 在重试上限内失败，抛 `RxDBAdapterSqliteError`，消息点名句柄被占用；不无限等待                                 | ✅   |
| 3   | 其它打开失败（`vfs ${vfs} not found`、OPFS 只能在 Worker 里用、非 `SQLITE_CANTOPEN` 的打开错误） | 打开             | 不重试，原样失败                                                                                              | ✅   |
| 4   | demo（e2e 走 OPFS 的 React / Vue），另一个标签页占着库文件句柄，应用第一次打开撞上后放开         | 打开页面并写入   | 照常打开，能写能读                                                                                            | ✅   |
| 5   | 三端 demo，打开最终失败                                                                          | 进入受守卫的页面 | 应用壳显示「数据库打不开」与原因，带重新加载按钮；受守卫的路由不渲染、不被默认错误页换掉整个壳                | ✅   |
| 6   | 门禁                                                                                             | 收尾             | sqlite-wasm 与 wa-sqlite 适配器单测与浏览器用例、三端单测与 e2e、`audit:requirements`、`nx format:check` 全绿 | ✅   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 技术笔记

- **确定性复现**：浏览器用例里先起一个 Worker，对库文件 `createSyncAccessHandle()` 并持有，再从适配器打开同一个库；
  持有方等客户端第一次打开撞上占用之后才 `close()`（VFS 先建出 `-wal` 再去开句柄：见到 `-wal` 再等 200 毫秒）。
  今天的实现在第一次 `createSyncAccessHandle()` 就失败，修好后应等到释放再打开成功。不靠真实刷新的时序，也不靠 Worker 启动快慢
  （早先「隔 300 毫秒放开」的写法，Worker 起得慢时第一次打开已在放开之后，用例不经过重试也会绿）。
- **失败那次留下的句柄**（2026-10-16 查清）：上游 `#requestAccessHandle()` 用 `Promise.all` 并行开库文件与 `-journal` / `-wal`
  的句柄，库文件先失败时另外两个后开出来、没人关，上游也没有 `close()`。同一个 Worker 里的重试于是撞上自己留下的句柄，
  要等垃圾回收才放开（实测从数百毫秒到超出 3 秒的重试窗口都有）。每次失败先用 `releaseOpfsCoopSyncHandles()` 交出这些句柄再重开。
- **修法候选**：
  1. 适配器内重试：`sqliteLoad()` 外包一层，只对 `NoModificationAllowedError`（或它导致的 `sqlite3_open_v2`
     失败，需确认错误能否区分）做指数退避，总时长有上限；重试前确保上一次失败的连接已清理。
  2. 上游 VFS：在 `#requestAccessHandle()` 里对这个错误等待重试。要改依赖或打补丁，不首选。
- **e2e 怎么占住句柄**：同一浏览器上下文的另一个标签页起 blob Worker，对 `<库名>@<RXDB_DB_NAME_SUFFIX>.sqlite` 开同步访问句柄；
  本页面的库名经 sessionStorage 定成已知值。先等应用第一次打开撞上占用（VFS 把 `NoModificationAllowedError` 打到控制台）再放开。
  Angular 的 e2e 端口强制 IDB（失败现场归档要读同一个库），不走 OPFS，它的连接失败提示由组件测试覆盖。
- **为什么不是用例问题**：失败的是应用本身打不开库，真实用户刷新页面同样会碰到；用例只是恰好在写入收尾时刷新。

## 实现文件

- `packages/rxdb-adapter-sqlite-core/src/opfs-open-retry.ts` — 两个适配器共用：`openOpfsWithRetry()` 退避重试、
  `isOpfsAccessHandleBusy()` 占用探测、`releaseOpfsCoopSyncHandles()` 交出失败那次 VFS 留下的句柄；单测 `__tests__/opfs-open-retry.spec.ts`
- `packages/rxdb-adapter-sqlite-wasm/src/sqlite-load.utils.ts` — `sqliteLoad()`：`opfs` 打开走重试，失败那次经 `beforeOpen` 拿到的 VFS 先交出句柄
- `packages/rxdb-adapter-wa-sqlite/src/sqlite-load.utils.ts` — `openWaSqliteDatabase()`：逐个 VFS 表态是否重试（只有 `OPFSCoopSyncVFS`）；
  给 `OPFSCoopSyncVFS` 补上交出句柄的 `close()`
- `packages/rxdb-adapter-wa-sqlite/src/WaSqliteClientBase.ts` — 运行时打开钩子 `WaSqliteClientRuntime.open()`：浏览器接重试，小程序只打开一次
- `packages/rxdb-adapter-{sqlite-wasm,wa-sqlite}/src/__tests__/opfs-reload-race.spec.ts`、`opfs-handle-holder.worker.ts` — 真实 Worker 的确定性复现
- `packages/rxdb-adapter-wa-sqlite/src/__tests__/sqlite-client-open-retry.spec.ts` — 哪些 VFS 重试、每次重试是一次完整打开的注入式用例
- `apps/dev-rxdb-{angular,react,vue}/src/app/rxdb/db-connection.ts` — 启动时与路由守卫共用的连接，失败登记
- `apps/dev-rxdb-{angular,react,vue}` 应用壳的 `DbConnectionAlert`；React 受守卫路由的 `RouteLoadError`
- `apps/dev-rxdb-{react,vue}-e2e/src/db-open-contention.spec.ts` — 另一个标签页占句柄的 e2e

## References

- [PR #122 的 CI 运行 38740222050](https://github.com/aiao-io/rxdb/actions/runs/38740222050)（`ci / e2e (vue)` 第 1 次尝试的 Playwright 工件）
- [US-204 SQLite WASM 适配器](US-204-sqlite-wasm-adapter.md)
