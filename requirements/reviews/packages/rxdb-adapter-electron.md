---
package: rxdb-adapter-electron
status: IncrementalReview
baseline: ffed57da
incrementalFrom: 18ea576f
reviewed: 2026-10-26
---

# rxdb-adapter-electron 增量代码评审

## 结论

🟡 待处理：1 条 P2、3 条 P3。上轮问题继续保留；本提交区间未提供关闭证据。

## 提交与检查范围

- 上轮报告提交：`18ea576f`（2026-10-16，PR #128）；本轮检查到 `ffed57da`。逐包提交、全量增量统计与验证边界见 [本轮记录](./incremental-2026-10-26.md)。
- 本包变化：实现 3 文件、测试/测试工具 7 文件、配置/文档/版本 1 文件；以 Git 路径变化计，不把版本发布当成功能修复。
- 提交：`967aa658 12313`；`b109ba33 feat(aiao): 重构 worktree 功能 (#122)`；`23d8a098 chore(aiao): release 0.0.28 (#153)`。
- 检查重点：SQLite host 的 drop 请求、同库打开/删除串行与旁文件回收；Electron PGlite 显式拒绝删库；旧恢复、短写和事务错误路径无修复增量。
- 实现锚点：`src/RxDBAdapterElectron.ts`、`src/electron-sqlite-host.ts`、`src/pglite/RxDBAdapterElectronPGlite.ts`。

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

## 验证与限制

本轮对本包执行静态增量检查，未单独运行其 lint/typecheck/test/build；不沿用旧报告的测试通过结论。

本轮环境为 Node `26.12.0`、pnpm `10.34.9`；旧报告的 Node 22 / Nx 插件加载限制已过时。未列出的任务与宿主验证不视为通过，统一边界见 [本轮记录](./incremental-2026-10-26.md#未覆盖)。
