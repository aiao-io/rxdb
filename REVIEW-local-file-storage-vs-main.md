# `local-file-storage` 相对 `main` 代码评审报告

## 结论

**代码评级：🔴 不建议合并。**

功能方向值得做，后端抽象、共享 parity suite、结构化错误码和临时文件提交的整体设计也合理；但当前实现仍存在文件系统边界、Windows 覆盖写、跨窗口并发和 DevTools v2 数据面未闭环等阻断问题。测试数量和覆盖率很高，但部分测试固化了错误行为，不能代替语义正确性。

## 评审范围

- 分支：`local-file-storage`
- 当前 HEAD：`cba097b58a62273ee3082db290ea0b9ffa11bccb`
- 对比范围：`main...HEAD`
- merge-base：`c74d231b1ac841e9c8e2e556e4a611a132f66f3d`
- 变更规模：159 个文件，23,742 行新增，876 行删除
- 主要模块：
  - `packages/rxdb-plugin-storage`
  - `packages/rxdb-adapter-desktop`
  - `apps/dev-rxdb-electron`
  - `apps/dev-rxdb-tauri`
  - `packages/rxdb-devtools`
  - requirements、API baseline 与构建配置

本报告只评审已经进入当前分支 HEAD 的 `main...HEAD` 差异，不包含评审期间出现的工作区未提交修改。后续修复若尚未提交，不会改变本文对 `cba097b` 的结论。

## 阻断问题

### 1. [P0] Node 与 Rust 文件 Host 均可通过符号链接逃逸存储根目录

位置：

- [Node `resolveWithinRoot`](packages/rxdb-adapter-desktop/src/desktop-file-host.ts#L185)
- [Rust `resolve_within_root`](apps/dev-rxdb-tauri/src-tauri/src/rxdb/file/mod.rs#L137)
- [US-505 AC#4 证据声明](requirements/stories/plugin/US-505-tauri-local-file-storage.md#L138)

两端都只做词法 normalize 和路径前缀判断。若存储根目录内存在指向根外的符号链接，合法逻辑路径仍可通过该链接读取、覆盖或删除根外文件。当前代码注释已经明确承认拦不住符号链接，却把“应用独占目录”当成安全前提；与此同时，US-505 仍声称测试能够“挡根内符号链接”，文档与实现直接矛盾。

影响：文件 Host 对 renderer 暴露了“只能访问 storage root”的能力边界，但实际边界依赖磁盘目录永远不含链接。备份恢复、用户迁移、同用户进程或损坏目录均可打破该假设。

建议：逐段拒绝 symlink，或使用 canonical root、最近已存在父目录 canonicalization 与 no-follow/openat 语义组合处理尚不存在的写入目标。Node 和 Rust 都要增加真实文件及目录 symlink 的读、写、移动、删除测试。

### 2. [P1] Tauri 在 Windows 上无法覆盖已有文件

位置：[Rust `finish_write`](apps/dev-rxdb-tauri/src-tauri/src/rxdb/file/mod.rs#L202)

提交最终调用 `std::fs::rename(temporary, target)`。Windows 下目标存在时不会像 Unix 一样原子替换，导致 overwrite、远程 fetch 更新及依赖覆盖提交的补偿路径失败。后续增加的 `sync_directory` 只处理持久性，不改变 rename 的覆盖语义。

建议：提供平台无关的 atomic replace 实现，并在 Windows CI 上覆盖“目标已存在”的提交、失败补偿和重启读回。

### 3. [P1] rename/delete 使用锁前读取的旧路径，实际操作时可能锁错对象

位置：

- [rename 锁前读取与加锁](packages/rxdb-plugin-storage/src/storage.service.ts#L647)
- [delete 锁前读取与加锁](packages/rxdb-plugin-storage/src/storage.service.ts#L689)

rename 和 delete 都先读取 metadata，再按当时的 `opfsPath` 排队。锁内虽然重读 metadata，但仍只持有旧路径锁。

触发场景：操作一完成 `rename A -> B`；此前排队在 A 上的 delete 随后拿到 A 锁，锁内重读得到 B 并删除 B。此时另一个窗口可以同时持有 B 锁执行 upload 或 rename，导致文件、metadata 与补偿交错。

建议：以稳定 fileId 作为串行化主键，或在锁内发现路径变化后释放旧锁并按新路径重试。必须新增两个独立 service/窗口的 `rename -> delete/upload/rename` 交错测试。

### 4. [P1] 生产 Connector 能协商 v2，却没有接入 v2 Endpoint

位置：

- [生产消息 listener](packages/rxdb-devtools/src/connector.ts#L631)
- [生产 v2 negotiation 启动](packages/rxdb-devtools/src/connector.ts#L869)
- [真正的数据面 endpoint](packages/rxdb-devtools/src/v2/endpoint.ts#L456)

生产 Connector 对非 v1 帧只调用 negotiation。握手进入 v2 后，PING、DISCONNECT、REQUEST 和 TRANSFER 帧没有交给 `createDevToolsConnectorEndpoint`；该 endpoint 当前只在测试 fake 中使用。

影响：v2 握手可以成功，但协商后的基础 PING 和全部数据面请求静默无响应。空 descriptor 只能说明没有 provider，不能解释已协商协议连生命周期帧都不处理。

建议：现在接入 endpoint；若产品接线确实属于后续 US-904c/904d/905，则当前生产 Connector 不应宣告或选择 v2，只发布协议库与测试入口。

### 5. [P1] 文件操作缺少需求明确要求的共享 request/response schema

位置：

- [US-904b provider 数据面要求](requirements/stories/future/US-904b-devtools-v2-protocol.md#L54)
- [`DevToolsRequestPayload`](packages/rxdb-devtools/src/v2/wire.ts#L121)
- [`DevToolsProvider.invoke`](packages/rxdb-devtools/src/provider/types.ts#L113)

需求要求 list、download、upload、create-directory、delete 的共享 schema。实际 wire 层的 `params/result` 均为 `unknown`，provider 接口仍是 `operation: string, params: unknown`，没有按操作区分的请求、响应类型和 exact-key guard。

建议：建立以 domain/operation 为判别键的请求与响应联合，为每项文件操作提供运行时 guard，并让 provider registry、endpoint 和 conformance suite 使用同一组类型。

### 6. [P1] Transfer 没有绑定真实 upload REQUEST 或目标路径，download 字节通路也不存在

位置：

- [`TRANSFER_START` 载荷](packages/rxdb-devtools/src/v2/wire.ts#L147)
- [transfer 建立](packages/rxdb-devtools/src/v2/endpoint.ts#L308)
- [sink 创建](packages/rxdb-devtools/src/v2/endpoint.ts#L340)
- [固化错误路径的测试](packages/rxdb-devtools/src/__tests__/v2/endpoint.spec.ts#L266)

Endpoint 不验证 `requestId` 是否属于仍在途的 `files.upload`，也没有保存 upload REQUEST 中已校验的目标路径，而是直接用 `transferId` 调用 `createChunkSink`。测试因此断言提交文件名就是 `t1`。此外，当前 endpoint 只有接收 chunk 的路径，没有 download 对应的反向 sender。

建议：建立 `requestId -> 已授权操作 -> 已校验目标路径 -> transferId` 状态；仅允许合法 upload REQUEST 建立传输，并在 commit/discard 后结算请求。download 需要独立的流式发送端和背压协议。

### 7. [P1] Chunk sink 是同步接口，真实文件 I/O 无法背压或可靠回传错误

位置：

- [`DevToolsChunkSink`](packages/rxdb-devtools/src/provider/types.ts#L76)
- [状态先于 sink 推进](packages/rxdb-devtools/src/v2/transfer.ts#L166)
- [endpoint 调用 sink](packages/rxdb-devtools/src/v2/endpoint.ts#L359)

`write`、`commit`、`discard` 全部返回 `void`。Transfer table 先推进 `nextChunkIndex/receivedBytes`，再同步调用 sink。真实 OPFS、Node 和 Rust 写入都是异步 I/O，接口既无法背压，也无法在写入失败时保持协议状态一致。

建议：sink 方法返回 Promise；只有 write 成功后才能推进 offset，commit 成功后才能发送最终响应。失败必须进入统一 discard 与结构化错误映射。

### 8. [P1] Provider 调用没有 AbortSignal，也没有异常边界

位置：

- [`DevToolsProvider.invoke`](packages/rxdb-devtools/src/provider/types.ts#L113)
- [fire-and-forget 调用](packages/rxdb-devtools/src/v2/endpoint.ts#L296)
- [实际 await provider](packages/rxdb-devtools/src/v2/endpoint.ts#L299)

请求超时或 session 断开后，endpoint 只丢弃迟到结果，真实 mutation 仍会继续执行。provider Promise reject 时，`void this.#invoke()` 没有 catch，会形成 unhandled rejection，并让请求账本只能等超时回收。

建议：每个请求持有 AbortController，把 signal 传给 provider；超时、断连与 dispose 统一 abort。endpoint 必须捕获所有异常并映射为脱敏后的 provider error。

## 中等级问题

### 9. [P2] 跨 service 的不同 URL fetch 会覆盖并返回错误内容

位置：

- [实例级 in-flight Map](packages/rxdb-plugin-storage/src/storage.service.ts#L284)
- [fetch 提交与锁外回读](packages/rxdb-plugin-storage/src/storage.service.ts#L1134)

同实例会拒绝“同路径、不同 URL”，但两个窗口各自拥有 Map。两个下载会依次提交同一路径；第一个调用释放路径锁后才回读 committed file，第二个窗口可在这之间覆盖目标，导致第一个调用返回第二个 URL 的内容。

建议：把 URL 冲突信息放进跨上下文锁保护的共享状态，或在同一锁内完成提交和返回快照。增加两个 service 共享 desktop backend 的不同 URL 测试。

### 10. [P2] `destroy()` 只等待写操作，进行中的读取可在销毁后重建 filesystem

位置：

- [惰性 filesystem getter](packages/rxdb-plugin-storage/src/storage.service.ts#L304)
- [`read`](packages/rxdb-plugin-storage/src/storage.service.ts#L383)
- [`destroy`](packages/rxdb-plugin-storage/src/storage.service.ts#L743)

read/list/watch 不计入 `#activeWrites`。读取在 metadata await 期间，destroy 可以 dispose 并把 filesystem 置空；读取恢复后再次访问 getter，会在生命周期已经 destroyed 时创建新后端。

建议：追踪全部在途操作，而不是只追踪写；或在操作开始时固定 backend 引用并在每个 await 边界后检查 lifecycle。

### 11. [P2] `createDirectory()` 不参与 PathLockManager

位置：[createDirectory](packages/rxdb-plugin-storage/src/storage.service.ts#L627)

目录创建直接调用 `ensureDirectory`，可与 clear/renameDirectory 的全局独占锁交错。结果可能是 clear 完成后仍残留刚创建的目录，或 renameDirectory 枚举完后漏迁新目录。

建议：目录创建也必须进入与 `withExclusiveLock` 兼容的临界区，并增加 create/clear/renameDirectory 的跨窗口交错测试。

### 12. [P2] Endpoint 自动订阅 events 绕过 descriptor 授权

位置：[endpoint event subscription](packages/rxdb-devtools/src/v2/endpoint.ts#L406)

该路径只检查消息 capability，随后直接调用 `database.events`。数据库 descriptor 缺席、不可用或未声明 events 时仍会触碰 provider，也没有处理 invoke rejection。这破坏了代码声称的 capability、descriptor、mutationPolicy 三层授权模型。

建议：复用 `authorizeOperation`，并让订阅返回显式 disposer/失败结果，而不是 fire-and-forget invoke。

### 13. [P2] Snapshot source reject 会永久卡死为 `snapshot_busy`

位置：

- [capture race](packages/rxdb-devtools/src/provider/snapshot.ts#L238)
- [正常 settle 才清理 pending](packages/rxdb-devtools/src/provider/snapshot.ts#L276)

若 `source.capture()` 因真实 I/O reject，`#capture` 没有 catch/finally，`#pending` 和 deadline 不会正常清理，后续所有 open 永久返回 busy。

建议：用 try/finally 清理 pending、resolver 与 timer，并将 reject 映射成稳定错误；增加 capture reject 后可再次 open 的测试。

### 14. [P2] Electron 写入错误仍会泄漏物理绝对路径

位置：

- [错误文本拼接 path](packages/rxdb-adapter-desktop/src/desktop-file-host.ts#L156)
- [commit/chunk 传入 `pending.targetPath`](packages/rxdb-adapter-desktop/src/desktop-file-host.ts#L477)

普通文件操作已经改为使用协议相对路径，但 pending write 只保存绝对 targetPath，因此 chunk/commit 错误仍把用户数据目录绝对路径带回 renderer。

建议：PendingWrite 同时保存 logicalPath，所有协议错误只携带逻辑路径；物理路径仅进入 host 本地日志。

### 15. [P2] 两个 demo 初始化列表失败后仍显示 ready

位置：

- [Electron initialize](apps/dev-rxdb-electron/src/app/pages/storage/storage.page.ts#L219)
- [Tauri initialize](apps/dev-rxdb-tauri/src/app/pages/storage/storage.page.ts#L233)

`refresh()` 使用 `run()` 捕获并吞掉异常，`initialize()` 在 await 返回后无条件设置 ready。因此 init 成功但首次 list 失败时，页面同时显示错误和 ready。

建议：抽出会 reject 的内部 `loadEntries()`；公共事件入口再用 `run()` 包装。初始化应捕获 init 和 list 的完整失败范围。

### 16. [P2] Tauri session 没有绑定窗口生命周期

位置：[Tauri app Exit 回收](apps/dev-rxdb-tauri/src-tauri/src/lib.rs#L38)

Host 只在整个应用 `RunEvent::Exit` 时执行 `close_all()`。窗口崩溃、WebView 被销毁或单个窗口关闭后，该窗口的 session、锁和 pending write 可存活到整个应用退出。

建议：session 记录 owner window label，在窗口销毁事件中回收对应 session；增加两个窗口中一个异常退出后另一窗口能取得锁的测试。

### 17. [P2] Session tombstone 上限没有为在途请求预留终态容量

位置：

- [session 准入检查](packages/rxdb-devtools/src/v2/session.ts#L233)
- [请求与墓碑上限](packages/rxdb-devtools/src/v2/constants.ts#L38)

当 tombstones 为 4095 时，最多 32 个请求仍可同时准入；全部结算后 tombstones 达到 4127，超过声明的 4096 上限。

建议：准入条件检查 `tombstones + inflight`，或为所有已准入 ID 预留墓碑槽。增加 `4095 + 32` 的边界测试。

## 已在后续提交修复的评审项

当前 HEAD 相比首次评审快照 `3206e3f` 已修复以下问题，不再列为未解决 finding：

1. 临时文件名增加随机段，消除了跨窗口同毫秒碰撞：[storage.service.ts](packages/rxdb-plugin-storage/src/storage.service.ts#L1190)。
2. Node Host 在队列为空时删除锁名，并增加等待队列上限：[desktop-file-host.ts](packages/rxdb-adapter-desktop/src/desktop-file-host.ts#L260)。
3. Node Host 增加 pending write/lock/read 等资源上限，并用 `wx` 创建临时文件，降低 renderer 耗尽文件描述符和撞名覆盖的风险。
4. Node/Rust 写提交增加父目录同步，补齐 rename 后的持久性语义。

## 验证记录

评审过程使用项目要求的 Node.js 26.7.0，并通过 Nx 执行项目任务。

- `git diff --check main...HEAD`：通过。
- 三框架对称检查：通过；新增主体是框架无关核心包，没有 Angular/React/Vue 单端 API。
- `rxdb-plugin-storage:test`：200/200 通过（首次评审快照）。
- `rxdb-adapter-desktop:test`：920/920 通过，statements 97.11%（首次评审快照）。
- `rxdb-devtools:test`：757/757 通过，statements 97.72%。
- `dev-rxdb-electron:test`：164/164 通过（首次评审快照）。
- `dev-rxdb-tauri:test`：70/70 通过（首次评审快照）。
- Rust `cargo check`、`cargo clippy -- -D warnings`：通过（首次评审快照）。
- Rust `cargo test`：113/113 通过（首次评审快照）。
- Tauri conformance：首次 601/602，复跑 602/602；Nx 明确标记为 flaky。
- Electron、Tauri production build：均曾在 Angular `Building...` 后无有效诊断退出 1，不能视为构建全绿。
- Electron typecheck：曾因 `rxdb-client-generator` 无法解析多项 `@aiao/rxdb` exports 失败，尚未证明是本分支引入。
- Windows/Linux 未实机验证；Windows overwrite 问题来自 Rust 标准库明确语义。

“首次评审快照”表示这些任务运行于 `3206e3f`。当前 HEAD 的后续两次提交修改了 storage/desktop/Tauri host，因此相关目标需要在 PR CI 中重新执行；不能拿旧结果替当前代码背书。

## 测试缺口

1. 真实 symlink 文件与目录越界测试，Node/Rust 两端都缺。
2. Windows 已存在目标的 atomic replace、权限错误和目录 ACL 测试缺失。
3. 两个独立 service/窗口共享同一 storage root 的 rename/delete/fetch 竞态测试缺失。
4. DevTools v2 生产 Connector 到 Endpoint 的端到端测试缺失。
5. upload REQUEST 与 transfer/path 绑定测试缺失；download 字节发送测试缺失。
6. 异步 sink 写失败、commit 失败、背压与取消测试缺失。
7. provider reject、超时后 mutation 停止、断连 abort 测试缺失。
8. 窗口异常退出后的 session、锁和临时文件回收测试缺失。
9. Tauri ≥ 50 MiB 实测和 JS 堆占用观测缺失。
10. 两个 production build 当前没有可接受的成功证据。

## 合并前最低要求

1. 修复 P0/P1 全部问题，并补对应跨平台、跨窗口测试。
2. 明确 DevTools v2 当前交付边界：接入生产 Endpoint，或停止在生产 Connector 宣告 v2。
3. 在 Windows、macOS、Linux 至少各跑一次文件覆盖、持久化、权限与会话回收测试。
4. 重新运行受后续提交影响的 storage、desktop、Electron、Tauri、Rust 与 conformance targets。
5. Electron/Tauri production build 必须稳定通过，不能留下“无诊断 exit 1”。
6. 修正文档中“已挡住根内符号链接”的错误证据声明。

## 复核与修复记录（2026-08-16）

对上述 17 条逐条核对代码后的结论，以及本轮已落地的修复。核对基准是评审快照之后的工作区，
落地提交为 `67411aa`、`8c33738`。

### 一条不成立的 finding

**#2「Tauri 在 Windows 上无法覆盖已有文件」不属实。** `std::fs::rename` 在 Windows 上走的是
`MoveFileExW` 并带 `MOVEFILE_REPLACE_EXISTING`，目标存在时会被替换；Node 的 `fs.rename` 同理。
标准库文档里“目标存在时的行为因平台而异”指的是目录与跨卷的情形，不是同卷普通文件覆盖。
因此 `finish_write` 的 rename 提交在 Windows 上语义正确，无需平台分支。Windows CI 仍值得补，
但它验证的是权限与 ACL，不是 replace 语义。

### 越出合并门槛的两条

**#5（共享 request/response schema）与 #6（transfer 绑定 upload REQUEST、download 字节通路）**
描述的现象属实，但它们是 US-904c/904d/905 的交付内容，不是本分支承诺的范围。本分支的边界已由 #4
的修复确定：生产 Connector 现在真的接入了 v2 endpoint，协商后的 PING/DISCONNECT/REQUEST/TRANSFER
不再静默丢弃。schema 判别联合与 download 反向通道留给后续 story，不作为合并阻断。

### 本轮已修复

1. **#1 符号链接逃逸** —— Node 与 Rust 两端都改为对已存在部分做 canonicalize、对尚不存在的写入
   目标做最近已存在父目录 canonicalization 后再判前缀，逐段拒绝越界链接；两端都补了真实
   symlink（文件与目录）的读、写、移动、删除测试。同时改掉 US-505 AC#4 里“挡根内符号链接”的
   错误证据声明——那正是评审第 6 条最低要求。
2. **#4 生产 Connector 未接入 v2 Endpoint** —— `connector.ts` 在协商进入 v2 后把非 v1 帧交给
   `createDevToolsConnectorEndpoint`，新增 `connector.v2-negotiation.spec.ts` 端到端钉住。
3. **#7 同步 chunk sink** —— `write` / `commit` / `discard` 全部返回 Promise；transfer table 改为
   写入成功后才推进 `nextChunkIndex` / `receivedBytes`，失败统一进 discard。背压由每条 entry 的
   promise 串行化提供：流水线上的 CHUNK 帧排在未完成的写入之后。
4. **#13 snapshot capture reject 永久 busy** —— `#capture` 加 try/finally 清理 `#pending`、resolver
   与 deadline timer，reject 映射为稳定错误码；补了“capture reject 之后仍能再次 open”的测试。
5. **#15 两个 demo 初始化失败仍显示 ready** —— 抽出会 reject 的内部 `loadEntries()`，`initialize()`
   把 init 与首次 list 一起纳入失败范围，公共事件入口继续用 `run()` 包装。
6. **#16 Tauri session 未绑定窗口生命周期** —— 在 `router.rs` 增加按 window label 记账的会话归属表
   （`handle_owned` / `close_owner`），`lib.rs` 挂 `WindowEvent::Destroyed` 回收。归属表放在 router
   而不是两个 host 里，是因为 stdio 一致性二进制复用同一批 host 且根本没有窗口；`handle()` 因此
   保持无归属语义。测试覆盖“一个窗口消失后另一个窗口能拿到它持有的独占锁”。
7. **#17 tombstone 上限未为在途预留终态容量** —— 准入水位改为 `tombstones + inflight`，并补了
   `4095 + 32` 的边界测试。

**#8 的异常边界一半**与 **#12 的 descriptor 授权**在评审快照之后、本轮之前已经修好，代码中可查。

### 仍未处理

仍然成立、但未在本轮范围内的：#3、#9、#10、#11、#14，以及 #8 的 AbortSignal 一半。

### 本轮验证

- Rust：`cargo test` 121 通过、`cargo clippy --all-targets -- -D warnings` 干净、`cargo check
  --locked --all-targets` 与 `cargo build` 通过。
- `pnpm nx run-many -t lint test --projects=rxdb-devtools,dev-rxdb-tauri,dev-rxdb-electron`：全绿。
- `dev-rxdb-tauri:test-conformance`：首跑 1 条 undo 断言失败，复跑 604/604 通过（已知 flaky）。
- `tag:js-lib` 全量门禁只剩两处红：`rxdb-plugin-storage:test` 的 `backend-parity.spec.ts`
  （34/34 失败于 `ReferenceError: document is not defined`——该文件声明 `@vitest-environment node`
  以便 desktop 半边能用 `node:sqlite`，而 opfs 半边需要 DOM，两者在同一文件内不可兼得；该文件
  在 `main` 上不存在，也不属于本报告 17 条），以及 `rxdb-adapter-supabase:test-env`（Docker 守护
  进程未运行）。
