# Review：rxdb-adapter-tauri

## 结论

🟢 未发现可定位的 P0/P1/P2/P3 问题。

## 检查范围

检查了 `package.json`、`project.json` 的 TS build/typecheck、cargo-check/clippy/test、宿主构建和 conformance target、README；走读 `src/tauri-host-transport.ts`、`desktop-json-codec.ts`、`RxDBAdapterTauri.ts`，以及 `rust/src/{commands,router,session,protocol,value,paths,engine,error}.rs` 和 `conformance/**`。重点核对窗口白名单、会话归属、事件定向投递、JSON 标签编码、路径隔离、锁/事务和 Rust/TS 协议版本。

## 发现

无。Tauri IPC 错误分类、窗口白名单、跨窗口 session 拒绝、关闭竞态代数、canonical base64/bigint 校验及协议握手均有测试与 conformance 覆盖。

## 风险/未覆盖

真实 Tauri WebView capability、窗口销毁事件和各平台 Rust SQLite 行为未在本轮启动；`cargo`/真实宿主测试仍需 CI 或本机 Tauri 环境。

## 建议验证

执行 `pnpm nx run rxdb-adapter-tauri:cargo-check`、`cargo-clippy`、`cargo-test`、`test-conformance` 及 TS typecheck，并在 Windows/macOS/Linux 真实 Tauri 应用复验窗口权限和恢复。
