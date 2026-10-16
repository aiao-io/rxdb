# Review：rxdb-adapter-tauri

## 结论

🟡 二次评审发现 3 条问题（1 P2 + 2 P3），集中在 renderer 输入边界（`batchTimeout` 溢出 panic、路径泄露、base64 先解码后限长）；首轮「未发现问题」结论被推翻。

## 检查范围

检查了 `package.json`、`project.json` 的 TS build/typecheck、cargo-check/clippy/test、宿主构建和 conformance target、README；走读 `src/tauri-host-transport.ts`、`desktop-json-codec.ts`、`RxDBAdapterTauri.ts`，以及 `rust/src/{commands,router,session,protocol,value,paths,engine,error,file}.rs` 和 `conformance/**`。重点核对窗口白名单、会话归属、事件定向投递、JSON 标签编码、路径隔离、锁/事务和 Rust/TS 协议版本。二次评审额外走读了 `engine.rs` 的批处理 arm/flush、`paths.rs` 的错误构造与 `file/protocol.rs` 的分块解码顺序。

## 发现

### P2：`batchTimeout` 无上界 → `Instant + Duration` 溢出 panic，毒化 pending 互斥锁并升级为宿主进程 abort

- 证据：`rust/src/engine.rs:197` `self.deadline = Some(now + batch_timeout)`（std 的 `Instant + Duration` 溢出即 panic）；该调用发生在 `arm_flush`（`engine.rs:636-642`）**持有 `state.0` 锁期间**，panic 使互斥锁毒化。输入校验链全段无上界：`rust/src/protocol.rs:169-177` `read_batch_timeout` 接受任意 `u64`，TS 侧 `packages/rxdb-adapter-sqlite-core/src/desktop/desktop-host-protocol.ts:505-511` 只查 `Number.isInteger && >= 0`（可达 ~9e15）。
- 触发：`open` 传 `batchTimeout ≥ ~1.84e13` ms（u64 纳秒 Instant 的 584 年上限，macOS；JS 侧可表达的值远超此界），随后任一写表语句触发 `arm_flush` → 首次 panic 报 `host_internal_error`；毒化锁使同会话后续 `execute`/`mute`/`close` 全部 panic，下一次触发器回调在 `engine.rs:593` 的 `.expect("pending state mutex poisoned")` 处 panic 穿过 extern "C" trampoline → **进程 abort，宿主对所有窗口失效**。renderer 一次构造输入即可 DoS 宿主。
- 建议：解析期给 `batchTimeout` 设上界（如 ≤ 1 小时），且/或 `arm` 用 `checked_add` 兜底；pending 互斥锁改为容忍毒化（如 `lock_through_poison` 风格），保证一次 panic 不会砖掉会话。

### P3：`open` 失败错误消息向 renderer 泄露应用数据物理路径

- 证据：`rust/src/paths.rs:91-98` `directory_error` 拼入 `directory.display()`（绝对 `<app_data_dir>/rxdb-data`），经 `protocol.rs:252-258` 的 `error_response` 原样回给 renderer；而本模块头部注释的 AC#4 明确要求对 renderer 隐藏物理根目录，file host 有专门测试（`never_leaks_the_physical_root_in_a_response`）——SQL 侧独漏这一处。
- 触发：`open` 时 `create_dir_all` 失败（如 `rxdb-data` 位置是普通文件、TCC/权限拒绝）→ renderer 收到含绝对路径的错误消息。
- 建议：错误消息只带逻辑名/相对分量，如 `failed to prepare the database directory: {error}`。

### P3：base64 载荷在限长检查之前完整解码，尺寸上限形同虚设

- 证据：`rust/src/file/protocol.rs:279-288` `read_chunk` 先 `decode_bytes(chunk)` 完整解码再比 `MAX_FILE_CHUNK_BYTES`；`rust/src/protocol.rs:161-166` `decode_one_binding` 先 `decode_binding` 再 `check_blob_size`；解码分配在 `rust/src/value.rs:106-136`（`Vec::with_capacity(end * 6 / 8)`）。
- 触发：恶意/故障 renderer 发送 1.4 GB base64 的 `file.writeChunk` 或 `$u8` 绑定 → 宿主先分配 ~1 GB 再拒绝 → 可重复的内存耗尽 DoS。两个常量本意正是防 renderer 滥用，但都拦在分配之后。
- 建议：解码前按 4:3 比例检查编码串长度（chunk `> MAX_FILE_CHUNK_BYTES * 4 / 3`、绑定 `> MAX_BLOB_BYTES * 4 / 3` 即拒），或给 `decode_base64` 传最大输出尺寸。

## 风险/未覆盖

真实 Tauri WebView capability、窗口销毁事件和各平台 Rust SQLite 行为未在本轮启动；`cargo`/真实宿主测试仍需 CI 或本机 Tauri 环境。

## 建议验证

执行 `pnpm nx run rxdb-adapter-tauri:cargo-check`、`cargo-clippy`、`cargo-test`、`test-conformance` 及 TS typecheck，并在 Windows/macOS/Linux 真实 Tauri 应用复验窗口权限和恢复。
