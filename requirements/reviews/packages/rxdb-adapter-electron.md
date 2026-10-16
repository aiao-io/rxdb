# Review：rxdb-adapter-electron

## 结论

🟡 二次评审发现 4 条问题（1 P2 + 3 P3），集中在 PGlite 恢复收尾、disconnect 窗口、文件分块写入与事务提交的传输失败路径；首轮「未发现问题」结论被推翻。

## 检查范围

检查了 `package.json` 的四个发布入口与可选 PGlite peer、`project.json` 的 build/typecheck/lint/test-memory target、README 的 renderer/host 隔离与数据库路径约束，以及 `src/RxDBAdapterElectron.ts`、`src/host.ts`、`src/electron-file-host.ts`、`src/electron-sqlite-host.ts`、`src/node-sqlite-engine.ts`、`src/pglite/**` 和对应 `src/__tests__/**`（SQLite/PGlite host、备份恢复、协议、加密和 conformance）。renderer 入口只转出 sqlite-core 协议，PGlite 通过独立子路径隔离可选依赖；数据库名在构造期和 host 侧均校验，恢复使用独占目标连接。二次评审额外走读了 `pglite-host-restore.ts` 的 stage 状态机、`desktop-pglite-client.ts` 的 close/transaction 与 `electron-file-host.ts` 的写路径。

## 发现

### P2：恢复标记清除失败 → 已完整落盘的恢复目录被当作半成品删除

- 证据：`src/pglite-host/pglite-host-restore.ts:379-383` `commit` 在 `stage='persisted'`（数据已全部写入并 fsync）后只剩 `entry.lock.clearRestoring()`（sidecar 锁库上的 DELETE）；`417-419` 的 `poisonOnFailure` 把任何非协议错误置 `stage='failed'`（`285-295`）；renderer 侧 `src/pglite/restore-electron-pglite-database.ts:272、331-333` 的 catch → `abandon` → `host.abort()`——`abort` 无 stage 门槛（`385-392`），`entry.marked` 仍为真 → `discardTarget`（`190-201`）→ `removePgliteDataDirectory` 递归删除目录。stage 已 `'failed'` 使 `pg.restore.commit` 无法重试（`expectStage` 抛 `protocol_violation`）。
- 触发：`clearRestoring()` 那一刻撞上瞬时 I/O 错（磁盘满/ENOSPC 使 journal 写入失败、锁文件 IOERR）→ 一份**已完整持久化**的恢复数据被销毁，只能整个恢复流程重跑。
- 建议：`commit` 中 `clearRestoring()` 失败时保持 `persisted`（或专用可重试态）供 renderer 重试 `pg.restore.commit`；`abort` 在 stage ≥ `persisted` 时跳过目录删除（标记留着，让清理/提交可重试）。

### P3：`DesktopPGliteClient.disconnect()` 在 `await #lock` 之后才置 `#closed`，并发 `query()` 可能排在 `pg.close` 之后上线上报 `session_closed`

- 证据：`src/pglite/desktop-pglite-client.ts:442-452` `#runClose(drain=true)` 先 `await this.#lock.catch(...)` 再 `this.#closed = true`；窗口内启动的 `query()` 能通过 `#assertOpen`（`585-592`）并把自己的请求链到同一个 `#lock` 上——disconnect 的续体先执行（更早挂载）、置 closed、直接发 `pg.close`，晚到的 query 排在旧 tail 之后传输 → 宿主先拆会话、回答 `session_closed`。对照 `packages/rxdb-adapter-sqlite-core/src/desktop/desktop-sqlite-client.ts:477-483` 的兄弟实现同步先置 `#closed`，无此窗口。
- 触发：`client.query(...)` 与 `client.disconnect()` 在同一微任务窗口竞态（client 公开导出，存在直接调用方）→ 断开前发起的调用被拒绝，违反文档化的 drain 契约（`358-360`）。
- 建议：`#runClose` 开头同步置 `#closed = true`，并/或 `#exclusive`/`#send` 在执行时重查 `#closed`。

### P3：`electron-file-host` 忽略 `FileHandle.write` 的 `bytesWritten`，短写静默损坏已提交文件

- 证据：`src/electron-file-host.ts:667-674` `file.writeChunk` 分支 `await pending.handle.write(request.chunk)` 丢弃返回的 `{bytesWritten}`。`fs.promises` 的 `FileHandle.write` 是单次写 syscall，可能无错误地写入少于缓冲区的字节（POSIX 短写，如配额/空间边界）。
- 触发：某块被部分接受（文件系统返回短计数而非 ENOSPC）→ 位置照常推进、后续块继续写，`file.writeCommit` 把带洞的文件改名覆盖目标——**已提交数据损坏且全程无错误**。
- 建议：改 `handle.writeFile(request.chunk)`（循环写满），或按返回的 `bytesWritten` 循环直到整块写完，否则抛错。

### P3：`pg.commit` 传输失败留下僵尸事务，长期独占 PGlite 连接——后续查询永久挂起、事务持续超时

- 证据：`src/pglite/desktop-pglite-client.ts:466-469` `end()` 在**发送前**就置 `settled = true`，`511-515` 的 catch `if (!settled) await end('pg.rollback')` 因此在提交发送失败时跳过回滚；宿主侧 `electron-pglite-host.ts:733-741` 只有 `teardownSession` 回收挂起事务（无租约/空闲超时），而挂起事务的回调持有 PGlite 单连接互斥。
- 触发：`pg.commit` 请求在传输层失败（worker/bridge 抖动）→ 无回滚尝试、宿主保留挂起事务 → 该数据目录上所有后续 `runtime.query`/`exec`/`pg.begin` 排队：自动提交查询无超时地挂起，新事务 `beginTimeout` 后报 `transaction_unavailable`，直到窗口销毁（`releaseOwner`）或客户端断开。`pg.backup.end`/`pg.rollback` 发送失败同形。
- 建议：commit 发送失败时仍尝试 `pg.rollback`（若 commit 实际已达宿主，rollback 会得到 `transaction_not_found`，安全）；或宿主侧加挂起事务空闲租约超时回收。

## 风险/未覆盖

真实 Electron 主进程/多窗口环境仍依赖宿主应用接线；仓库测试主要是 node host 与协议接缝级回归。本轮未运行真实 Electron 打包矩阵。

## 建议验证

在 Node 26/Electron 目标版本下执行 `pnpm nx run rxdb-adapter-electron:build`、`pnpm nx run rxdb-adapter-electron:typecheck`、`pnpm nx run rxdb-adapter-electron:test-memory`，并在真实 Electron 多窗口应用中复验 preload 传输、窗口销毁回收与备份恢复。
