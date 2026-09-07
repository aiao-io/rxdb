# next-11 分支 `packages/rxdb-adapter-tauri` 深度评审

- **分支**：`next-11`
- **范围**：`packages/rxdb-adapter-tauri` 全部三半：npm 包 `src/`（6 个源文件 601 行 + 2 个 spec 409 行）、Rust 宿主 `rust/`（crate `aiao-rxdb-tauri`，14 个文件 6,307 行含内联单测）、跨进程一致性套件 `conformance/`（14 个文件 1,662 行）。对照物：`@aiao/rxdb-adapter-sqlite-core/desktop-host` 共享层、`@aiao/rxdb-adapter-electron` 与 `apps/dev-rxdb-electron` 的对侧实现、`apps/dev-rxdb-tauri` 的接线
- **日期**：2026-09-07
- **结论**：🟡 凑合偏下。门禁全绿、注释与结构质量高、happy path 与 Electron 逐行等价；但 **两条 🔴 由真实宿主进程实测复现**（authorizer 对绑定参数形式的 `ATTACH` 失效、非 UTF-8 文本 panic 后毒化会话锁），第三条 🔴 是文档写明的安全性质（变更事件定向投递）在 Tauri 事件系统的实际语义下并不成立。一致性套件绕过了恰好是 Tauri 特有的那一层（窗口归属 / `emit_to` / 异步 `listen`），因此上述回归都不会让套件变红
- **修复状态**：未开始

## 评审方法

1. 机械门禁实跑：`cargo clippy -D warnings` / `cargo test --locked` / `nx lint` / `nx test` / `tsc --build` / `nx test-conformance`；三个红的用例拿 Electron 适配器跑同一批共享套件做归属判别。
2. 评审者本人通读 npm 包全部源码与测试、Rust 的 `lib / error / paths / commands / value / protocol / session / router / bin`、共享层 `desktop-host-protocol.ts` / `desktop-sqlite-client.ts` 等 6 个文件、demo 的 `lib.rs` 与 `setup_rxdb_desktop.ts`、Electron 侧 `RxDBAdapterElectron.ts` / `preload.ts` / `desktop-sqlite-bridge.ts`；核对 tauri 2.11.2 与 `@tauri-apps/api` 2.11.1 的事件分发源码。
3. 三个深度评审 agent 分片：`engine.rs + script.rs`（对照 `node-sqlite-engine.ts` / `sqlite-script.ts`）、`file/*`（对照 `electron-file-host.ts` / `desktop-file-bridge.ts`）、`conformance/*`（对照 Electron 的测试接线与共享套件清单）。
4. 每条 🔴 由评审者用 `rust/target/debug/rxdb_host_stdio`（一致性套件用的真实宿主二进制）按线协议直接复现；agent 的推测项标注「PLAUSIBLE」或剔除。

## 门禁实测

| 项目                                                        | 结果                                                                                                                                                                                                             |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cargo clippy --locked --all-targets -- -D warnings`        | 通过                                                                                                                                                                                                             |
| `cargo test --locked`                                       | 133 通过                                                                                                                                                                                                         |
| `rxdb-adapter-tauri:lint`（`--max-warnings=0`）             | 通过                                                                                                                                                                                                             |
| `rxdb-adapter-tauri:test`（vitest，node 环境）              | 全过                                                                                                                                                                                                             |
| `tsc --build --emitDeclarationOnly`（lib/spec/conformance） | 通过。`nx typecheck` 被上游 `rxdb:typecheck` 挡住：`packages/rxdb/src/__tests__/query/merge_{create,remove,update}.spec.ts` 15 处 TS6133（未使用的 `emissions`），HEAD 上就有，与本包无关                        |
| `rxdb-adapter-tauri:test-conformance`                       | 606 / 609，3 红（bigint 级联删除 1、分支切换 2）。**Electron 跑同一批共享套件同样 3 红、同一断言行** → 共享核心的问题（工作区里暂存未提交的 `rxdb-adapter-sqlite-core` 改动嫌疑最大），不是 Rust 宿主            |
| stdio 宿主复现                                              | `ATTACH DATABASE ?` 绑定绝对路径 → 成功并在应用目录外写出 8,192 字节库文件；`SELECT CAST(X'FF' AS TEXT)` → 线程 panic，同会话后续请求全部 panic「engine mutex poisoned」；`SELECT "no_such_column"` → 返回字符串 |

> 环境备注：工作区被并发会话共享，评审期间 `rxdb-adapter-sqlite-core` / `rxdb-adapter-sqlite` / `rxdb-adapter-sqliteai` 有 17 个文件处于暂存态。评审全程未修改仓库文件（本记录除外）。

---

## 🔴 必须修（3 条，前两条实测复现）

### 1. authorizer 只拦字面量 `ATTACH`：绑定参数或表达式形式的 `ATTACH` 直接放行，可在应用作用域外读写任意 SQLite 文件

- **文件**：`rust/src/engine.rs:454-460`
- **现象**：授权器闭包只匹配 `AuthAction::Attach { .. } | AuthAction::Detach { .. }`，其余 `_ => Allow`。rusqlite 0.32.1 `hooks/mod.rs:270` 只在 SQLite 传来的文件名非 NULL 时才构造 `Attach { filename }`；而 SQLite 的 `codeAttach` 对非 `TK_STRING` 的文件名表达式（绑定参数、字符串拼接、子查询）传的是 NULL，于是落成 `AuthAction::Unknown`，被 `_` 臂放行。
- **实测**（stdio 宿主，真实线协议）：`ATTACH DATABASE '<绝对路径>' AS q` → `permission_denied`（现有单测覆盖的正是这一种）；`ATTACH DATABASE ? AS p` + `bindings: ["<应用目录外的绝对路径>"]` → `kind: execute` 成功；接着 `CREATE TABLE p.proof(x); INSERT INTO p.proof VALUES (1);` → 成功，目录外出现 8,192 字节的 `bound.sqlite`。
- **后果**：US-210 AC#1「WebView 零文件系统权限」失守——renderer 可读进程能打开的任何 SQLite 文件（含 `file:` URI，`SQLITE_OPEN_URI` 是开着的），可在任何可写位置写 SQLite 文件。`VACUUM INTO ?` 仍被拒（其内部 ATTACH 是字面量），但这只是巧合。Electron 不受影响：`node-sqlite-engine.ts:326-328` 按原始 action code 判，`engine.rs:446-453` 那句「与 Electron 侧授权器同规则」不实。
- **修复**：改按原始 opcode 判——同时匹配 `AuthAction::Unknown { code, .. } if code == ffi::SQLITE_ATTACH`（`Detach` 同理），或直接把闭包写成对 `code` 的比较。补三条红测试：`ATTACH ?`、`ATTACH ('/x' || '/y')`、`ATTACH (SELECT ...)`，断言 `permission_denied` 且目录外**无文件**。

### 2. 非 UTF-8 的 TEXT 值让 `execute` panic，会话 `Mutex<Engine>` 从此毒化，退出路径跟着 panic

- **文件**：`rust/src/engine.rs:689-691`（`read_row` 用 `row.get::<_, SqlValue>`）→ rusqlite `types/from_sql.rs:251` 的 `expect("invalid UTF-8")`；`rust/src/session.rs:97 / 109 / 166 / 173 / 188` 五处 `lock().expect("engine mutex poisoned")`
- **实测**：`SELECT CAST(X'FF' AS TEXT)` → 该请求永无应答，stderr `panicked at rusqlite-0.32.1/src/types/from_sql.rs:251:18: invalid UTF-8`；紧接着同会话 `SELECT 1` → `panicked at src/session.rs:166:14: engine mutex poisoned`；`close` → `session.rs:188:23` 同样 panic。
- **可达路径**：SQLite 从不校验 TEXT 编码——导入的、别的程序写的、或被篡改的库文件里一行坏文本就够；`SELECT char(55296)` 也能造出来。
- **后果**：生产路径上 `spawn_blocking` 接住 panic，`invoke` reject 一个**没有错误码**的字符串（`commands.rs:203`），AC#5「稳定可判别的错误码」丢失；该会话永久死亡；`close_window` / `close_all` 在**主线程**上再 panic（`apps/dev-rxdb-tauri/src-tauri/src/lib.rs:397-399, 417-418`）。`session.rs:6` 写的「`Host::handle` 永不 panic」契约不成立。Electron 返回有损字符串。
- **修复**：`read_row` 改读 `ValueRef`，`Text` 分支 `as_str()` 失败时按 `from_utf8_lossy`（与 Node 对齐）或报 `statement_failed`；`session.rs` 的五处 `expect` 改 `unwrap_or_else(PoisonError::into_inner)`，至少让 `close` / `close_all` 在毒化后仍能释放句柄。补红测试：一行 `X'FF'` 文本读出后会话仍可用、仍可关。

### 3. 「变更事件只投递给开出该会话的窗口」在 Tauri 的实际语义下不成立：默认 `listen()` 收到的是全量广播

- **文件**：`rust/src/commands.rs:145-161`（`deliver_change` 用 `emit_to(owner)`，文档：「收件人只能是开出这个会话的窗口」）；`src/tauri-host-transport.ts:148`（`options.listen(TAURI_DESKTOP_CHANGE_EVENT, …)`，不传 target）
- **现象**：tauri 2.11.2 `src/event/listener.rs:310` `match_any_or_filter`：监听者 target 为 `Any` 时**无条件匹配**任何 `emit_to`；`src/manager/mod.rs:575-578` 对**全部** webview 逐一分发。`@tauri-apps/api` 2.11.1 `event.js:75` 的 `listen()` 默认 target 就是 `{ kind: 'Any' }`。README 与 demo（`setup_rxdb_desktop.ts:210-216`）注入的正是这个全局 `listen`。
- **后果**：任何能调用 `listen` 的 webview（demo 的 `rxdb-devtools` 窗口持有 `core:event:default`，就够）都会收到所有窗口的 `rxdb-desktop-change`：sessionId、库名、表名、rowIds。因 `handle_owned` 验主，这是**信息暴露**而非越权；但 Electron 侧走 `webContents.send`（`desktop-sqlite-bridge.ts:127`）只发 owner，两端不对称，且 `commands.rs:56-60` 整段「为什么是 emit_to 而不是 emit」的论证建立在一个不成立的前提上。
- **修复**：让注入点带上 target——`TauriHostTransportOptions.listen` 的文档改为要求注入 `getCurrentWebviewWindow().listen`（它注册的是 `{ kind: 'WebviewWindow', label }`，能与 `emit_to` 的 `AnyLabel` 匹配），或 transport 增加 `target` 选项透传给 `listen(event, handler, { target })`；README 示例与 demo 同改；`commands.rs` 的注释补一句「定向投递需要接收侧也带 target」。这条只有真窗口才测得到，至少在 e2e 里加一条「第二个窗口 `listen` 收不到主窗口事件」。

---

## 🟡 应修（11 条）

### 4. 非有限数绑定参数经 JSON 静默变成 NULL

- **文件**：`src/desktop-json-codec.ts:150-162`（`number` 原样返回）；对照 `rust/src/value.rs:159-163`
- **现象**：`JSON.stringify(Infinity)` / `NaN` → `null`，Tauri IPC 就是 JSON；Rust `decode_binding(Null)` → SQL NULL。Electron（结构化克隆 + node:sqlite）与 wa-sqlite 存的是 `Inf` / `NaN`。Rust 侧在**响应**方向刻意拒绝非有限 REAL（「静默改写成 null 会让调用方读到一个不是他写进去的值」），请求方向却没有同一道闸。
- **修复**：编码器对 `typeof value === 'number' && !Number.isFinite(value)` 抛 `protocol_violation`，与 Rust 同口径；补 codec 红测试。附带记录一条已知不对称：`SELECT 1e400` 在 Tauri 是 `protocol_violation`、在 Electron 返回 `Infinity`。

### 5. 双引号字符串字面量：Tauri 放行、Electron 拒绝

- **文件**：`rust/src/engine.rs:296-299, 423-442`（PRAGMA 初始化）
- **现象**：bundled SQLite 默认 `SQLITE_DQS=3`，`node:sqlite` 默认 `enableDoubleQuotedStringLiterals: false`。实测 `SELECT "no_such_column" AS v` 在 Tauri 返回 `"no_such_column"`，Electron 报 `no such column`。一处 `WHERE name = "alice"` 的手误在两个桌面后端行为相反。
- **修复**：open 后 `db_config(SQLITE_DBCONFIG_DQS_DDL, false)` / `DQS_DML`；补测试。

### 6. `close()` 的 `wal_checkpoint(TRUNCATE)` 会在主线程上等满 `busy_timeout`（5 s）

- **文件**：`rust/src/engine.rs:389-392`（TRUNCATE 模式会触发 busy handler）+ `:438-440`（`busy_timeout = 5000`）；调用点 `apps/dev-rxdb-tauri/src-tauri/src/lib.rs:397-399` 的 `on_window_event` 在主线程
- **现象**：窗口 A 在事务中，窗口 B 关闭 → B 的 `close_window` 在主线程做 checkpoint，被 A 的读快照挡住，UI 冻结直到 A 提交或 5 s 到期（阻塞 CONFIRMED，最坏时长 PLAUSIBLE）。Node 侧无 busy_timeout，checkpoint 立刻返回 `busy=1`。`engine.rs:9-13`「每条连接活在自己的线程上」在这条路径上不成立。
- **修复**：close 路径先 `busy_timeout = 0` 或改 PASSIVE；或 demo 把 `close_window` 丢进 `spawn_blocking`。

### 7. 一致性套件绕过了 Tauri 特有的那一层：窗口归属、`emit_to`、异步 `listen`

- **文件**：`rust/src/bin/rxdb_host_stdio.rs:103, 138`（`router.handle()`，事件无条件写 stdout）；对照生产 `rust/src/commands.rs:134`（`handle_owned`）与 `:154-157`（无主会话的事件**丢弃**）；`conformance/rust-host-transport.ts:151-156`（测试 `listen` 同步落定）
- **现象**：`track` / `session_owner` / `reject_foreign_session` 任一回归，生产里所有 change 事件被丢、响应式查询停摆，而 20 + 6 个共享套件全绿。测试 `listen` 同步生效，把 `desktop-sqlite-client.ts:283` 的 `await client.#awaitSubscription()` 删掉套件照样绿。`deliver_change` 本身零测试（需要 `AppHandle`）。
- **修复**：stdio 二进制加 `--owner <label>` 参数走 `handle_owned`，并像生产一样按 `session_owner` 过滤事件（无主即丢）；测试 `listen` 用 `setImmediate` 延迟注册。

### 8. Nx 把原生二进制与平台门控的测试结果缓存起来，却没有任何平台输入

- **文件**：`project.json:59-97`（`build-test-host` 输出 `target/debug/rxdb_host_stdio`、`test-conformance`，均 `cache: true`，inputs 只有 `rust/**`）；`nx.json:30` `sharedGlobals: []`、`:32` Nx Cloud 启用
- **现象**：同一份 `rust/**` 哈希下，macOS 推上去的 Mach-O 会被 Linux CI 还原（`spawn` ENOEXEC，`rust-host-transport.ts:129` 全部用例失败）；或者更糟——直接回放 macOS 的 `test-conformance` 结果，`storage-disk-full.spec.ts:162` 的 tmpfs 分支永远不执行。
- **修复**：两个 target 加 `{ "runtime": "node -p process.platform+process.arch" }` 输入，或 `cache: false`。

### 9. TEMP 通知触发器随事务回滚，但 `watched_tables` 仍记着——该表事件此后静默丢失

- **文件**：`rust/src/engine.rs:625-638`
- **现象**：`BEGIN IMMEDIATE` → 建 `rxdb$rxdb_change` → 语句后钩子在事务内装 TEMP 触发器并写入 `watched_tables` → `ROLLBACK` → 触发器没了、集合还在 → `ensure_notify_triggers` 永远跳过它。可达：`RxDBAdapterSqliteBase.ts:1146-1153` 的建表脚本跑在 `BEGIN IMMEDIATE;` / `COMMIT;` 之间，COMMIT 失败（磁盘满 / IO）回滚后同一会话重试。机制 CONFIRMED，生产触发 PLAUSIBLE。Node 同款（`node-sqlite-engine.ts:516-530`），是共享缺陷不是分叉。
- **修复**：`ensure_notify_triggers` 以 `sqlite_temp_master` 为准而不是内存集合，或在回滚路径清空 `watched_tables`。

### 10. flusher 可以在一条语句执行中途派发，把它的 rowIds 拆成两批

- **文件**：`rust/src/engine.rs:220-237`（`wait_for_batch` 等的是**上一次** `arm` 的截止时间）与 `:349-354`
- **现象**：`batchTimeout=16`，第 1 条 `execute` 在 T 落地并 arm T+16；第 2 条在 T+15 开始一段 5 ms 的批量插入；T+16 flusher `take_batch` 拿走第 2 条已录的前 k 行先发，其余下一批。事件不丢，但 `:349-353`「语句已经跑完，事务状态已经落定」与模块文档「差异 2」只在批次不重叠时成立；Node 的定时器只能在同步执行之间跑，做不出这种拆分。
- **修复**：`take_batch` 遇到「有语句在跑」就推迟到语句结束，或 `arm` 时把已到期的 due 顺延。

### 11. `.rxdb-tmp` 在 Tauri 侧没有启动清扫

- **文件**：Electron `apps/dev-rxdb-electron/src-electron/desktop-file-bridge.ts:129-152` 有 `sweepTemporaryFiles`；`rust/` 与 `apps/dev-rxdb-tauri/src-tauri/` 无对应物（`rust/src/file/mod.rs:733` 的过滤是测试 helper）
- **现象**：SIGKILL / 断电后残留的临时文件永久留在用户的备份域里，`file.list` 把它们当 `kind: "file"` 列出来，`physical-name.ts:116` 原样透传成 `.<uuid>.rxdb-tmp`。`mod.rs:235-236`「下次启动时无害」不实。
- **修复**：`FileHost::new` 时递归清扫存储根下的 `.rxdb-tmp`。

### 12. 文件锁的无超时阻塞等待可以耗尽 Tauri 的阻塞线程池，挂死整个 host

- **文件**：`rust/src/file/mod.rs:636-641`（Condvar 无超时）；`rust/src/commands.rs:201`（每请求一个 `spawn_blocking`，tokio 默认上限 512）；唯一的护栏是**每锁名** 256（`mod.rs:629`）
- **现象**：一个窗口持有 `/a` 独占锁后发 256 条 `lockAcquire /a`，再对 `/b` 同样一遍——512 个池线程全部 parked，之后**任何**窗口的任何请求（包括能解开它们的 `lockRelease`、包括所有 SQL）都在 tokio 队列里永远排队，只有 `close_window` 能救。Electron 的等待是 promise，没有线程成本。机制 CONFIRMED，触发需要失控或恶意 renderer（PLAUSIBLE）——而本包的设计文档把 renderer 定为不可信。
- **修复**：加每会话在等锁数上限（服务层按路径串行，8 就足够）或全局上限，超限报 `protocol_violation`。

### 13. `host_unavailable` 在 Tauri 上永远不会产生，README 却说它覆盖「命令未注册」

- **文件**：`src/tauri-host-transport.ts:167-172`（`invoke` 的 reject 原样透传）；`README.md:142`
- **现象**：宿主应用忘了 `generate_handler!`，`rxdb.connect()` 以裸字符串 `"Command rxdb_desktop_request not found"` 失败；宿主 panic 时是 `"rxdb desktop host panicked: …"`。两者都不是 `RxDBAdapterDesktopError`，按 README 写的 `error.code === 'host_unavailable'` 分支永远走不到。Electron 侧 `resolveDesktopHostTransport()` 是真的会抛 `host_unavailable`。
- **修复**：transport 把 `invoke` 的 reject 包成 `RxDBAdapterDesktopError`（命令未注册 → `host_unavailable`，其余 → `host_internal_error`），`cause` 挂原值；或至少把 README 改诚实。

### 14. README 的 Rust 接入示例编译不过

- **文件**：`README.md:63` `app.manage(DesktopHost::new(app.handle(), dir));`；实际签名 `rust/src/commands.rs:77` 三个参数，第三个 `allowed_windows` 刻意必填且无默认（「未配置即全放行」是被禁掉的兜底）。`rust/src/lib.rs:20` 的文档是对的。
- **后果**：npm 上的 README 就是这份；照抄的用户第一步就撞编译错误，而且错的恰好是安全相关的那个参数。
- **修复**：补 `&["main"]`，并加一句「第三个参数是允许敲 host 的窗口 label」。

---

## 🟢 建议（低）

- **每会话 pending-write 上限不约束它声称保护的 fd**（`rust/src/file/protocol.rs:31-33` / `mod.rs:556-561`）：`file.open` 无上限且零成本，循环 `file.open` + 256 × `writeBegin` 即可持有 256 × N 个句柄。Electron 同款（`electron-file-host.ts:672-676`）。
- **文件协议错误码分叉**：`file.rmdir` 对普通文件 → `remove_dir_all` 报 `invalid_file_path`（`mod.rs:468`），Electron 删掉并成功；`file.remove` 对目录 → macOS `permission_denied` / Linux `invalid_file_path` / Electron `host_internal_error`（`mod.rs:477`）；符号链接环 → `host_internal_error`（`mod.rs:94-105` 无 `FilesystemLoop` 臂），Electron `invalid_file_path`；Windows 上 `file.read` 目录 → `permission_denied`（PLAUSIBLE，未在 Windows 验证）。
- **`sync_directory` 吞的比注释说的多**（`mod.rs:247-252`）：`PermissionDenied | InvalidInput` 来自 open 与 sync_all 都吞，注释只说「打不开目录」；macOS `File::sync_all` 只走 `F_FULLFSYNC` 无 `fsync` 回退，SMB/NFS 上每次 commit 报 `host_internal_error`，且 `:274` 的目录 sync 失败发生在 `rename` **之后**——renderer 收到错误但文件已落盘（PLAUSIBLE，需网络卷验证）。
- **`track()` 竞态**（`rust/src/router.rs:182-200`）：`open` 在飞时窗口销毁，会话记到已死 owner 名下，泄漏到进程退出。
- **`PRAGMA temp_store_directory` 放行**（进程级副作用，Node 同）。
- **注释漂移**（按文件）：`router.rs:202-205` `forget`「宿主并不校验是谁在关」——`reject_foreign_session` 现在会拒；`engine.rs:446-453 / 9-13 / 14-17 / 349-353` 见 #1 / #6 / #10；`file/mod.rs:14-16`「TS 侧会把物理根泄露给 renderer」——Electron 已报逻辑路径；`file/mod.rs:18`、`locks.rs:8-9, 152-154`「先拒排队、后放持有，与 TS 侧顺序相反」——Electron `closeSession` 已改成同序，两份文档指向一个不存在的分叉；`script.rs:80-82, 116` 未闭合 `/*` 在 SQLite 里是到 EOF 的空白，不报错；`script.rs:147` 引用的 TS 正则已被 `execute-sql.utils.ts:16-23` 的线性扫描替代（语义同）。
- **测试质量**：`engine.rs:878-936` `denies_attach_*` 只测字面量（#1 存在时全绿）；`:1032-1041` 只断言「不早于窗口」（#10 存在时全绿）；`:747-752` 名为 survives_a_restart 却不重启；`file/mod.rs:976-981` sibling 断言没经过 `resolve_within_root`；`file/protocol.rs:284-286` chunk 上限无测试、且在 `decode_bytes` 完整物化**之后**才判；`file/mod.rs:883` 以 root 身份跑会假红；`conformance/write-lock-contention.spec.ts:140-158` 第 3 条单独跑是同义反复；`protocol-handshake.spec.ts:195-200` 第 3 条不可能独立失败、`:61-78` 只看 `rxdb-data/` 且「目录存在但为空」放行；`storage-disk-full.spec.ts:71-78` Linux 门只看 `sudo -n`，容器里 `mount` 会硬红而不是 skip，`:155-160` `afterAll` 未守卫会泄漏 RAM disk；`rust-host-transport.ts:30-37` 忽略 `CARGO_TARGET_DIR`；命令名 `rxdb_desktop_request` 没有任何跨语言测试钉住（事件名有）；`project.json:95`「21 个共享套件」实为 20（`createSqliteClientSuite` 有意排除，理由成立）。
- **README**：错误码表列了 11 / 17（缺本包同样承载的文件协议码 `file_not_found` / `invalid_file_path` / `disk_full` / `write_aborted`）；「`capabilities/` 一个字都不用改」默认了 `core:default`——`listen` 需要 `core:event:allow-listen`。
- **包配置**：`rxjs` 在 `vite.config.mts` external 与 eslint `ignoredDependencies` 里，src 未用；`resolveDesktopHostTransport` / `DESKTOP_HOST_TRANSPORT_KEY` 按对称性转出，但按本包自己的文档它在 Tauri 上永远失败，至少该在 `index.ts` 注明。

---

## 复核过、没有问题的部分

- **JSON 传输编码**：base64 规范形式（长度对齐 4、补位 ≤ 2、丢弃位为 0）与 `$bigint` 规范十进制两侧逐条对齐，`Zm9=` / `Zh==` / `-0` / `0x10` 等边界手算与两侧测试一致；`$esc` 只在 TS 侧解码，Rust 侧拒绝，理由（跨线对象键全由协议固定）成立。
- **传输层订阅语义**：注册期间退订、注册失败后重注册、坏负载与坏订阅者互相隔离、`subscriptionReady` 与 `starting` 生命周期分离——逐个场景推演正确，单测覆盖到位。
- **每会话请求串行队列**（`desktop-sqlite-client.ts:454-458`）补上了 Tauri 并发 `invoke` 的乱序，Electron 侧此前只是靠同步 `ipcMain` 偶然成立——这是本包对共享层的一处实质贡献。
- **SQL 切分**（`script.rs`）是 `sqlite3_complete` 的忠实移植：状态转移表、`IdChar`、关键字集、注释 / 引号 / 方括号处理逐项对上。
- **文件宿主**：路径穿越（`..` / 绝对路径 / 反斜杠 / 盘符 / NUL / 保留名 / 尾点尾空格 / 指向外部的符号链接）两层校验无缝；写入原子性与 fsync 顺序（sync → drop → rename → dirsync）与 Electron 一致；锁表无死锁、无丢唤醒、无跨会话释放；大文件流式落盘不进堆。
- **结果形状 / rowsAffected / elapsed / 错误码表 / PRAGMA 初始化集 / 触发器 SQL**：与 Node 引擎逐行等价。
- **`index.ts` 导出面**与 Electron 一致；`ADAPTER_NAME` 用 `satisfies` 钉在共享登记表上。

---

## 建议的修复顺序

1. 🔴 #1（一行改判定 + 三条红测试）与 #2（`read_row` 改 `ValueRef` + 五处 `expect` 改 `into_inner`）——都是小改、都关安全与稳定。
2. 🔴 #3 + 🟡 #13 / #14：transport 与 README 一起改，一次 PR 把「接入」这条路走通。
3. 🟡 #7 / #8：先把套件补到能抓住上面几条，再谈其余。
4. 🟡 #4 / #5 / #11：三条与 Electron 的行为分叉。
5. 🟡 #6 / #9 / #10 / #12：调度与资源类，各自需要一条能打红的并发测试。
6. 🟢 注释漂移与测试质量一并清。

## 附：本次复现用法

`pnpm nx run rxdb-adapter-tauri:build-test-host` 编出 `rust/target/debug/rxdb_host_stdio <临时根目录>`，按行喂 `{"id":N,"payload":<协议请求>}`、按 `id` 对应答即可，不需要起 Tauri。注意它走的是 `router.handle()` 而不是生产的 `handle_owned()`，#3 / #7 涉及的窗口归属这一层在这里测不到。
