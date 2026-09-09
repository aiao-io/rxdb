# next-11 分支 `packages/rxdb-adapter-tauri` 评审 · 剩余项

- **原评审**：2026-09-07，覆盖 npm 包 `src/`、Rust 宿主 `rust/`（crate `aiao-rxdb-tauri`）、跨进程一致性套件 `conformance/`
- **修复**：2026-09-08，🔴 #1–#3 与 🟡 #4–#14 十四条全部修完，🟢 一档处理绝大部分。验证：Rust 150 测试通过、clippy `-D warnings` 干净、一致性套件 610 测试 / 12 文件通过、`lint` `test` `typecheck` 全绿
- **本次复核**：2026-09-09，逐条对照 HEAD 源码
- **修复**：2026-09-09，`node-sqlite-engine.ts` 的 `#watchedTables` 回滚残留已修（`#rememberWatched`）；两端授权器已拦掉 `temp_store_directory` 与同类的 `data_store_directory`（`engine.rs` 的 `repoints_a_process_wide_directory`、`node-sqlite-engine.ts` 的 `DENIED_PRAGMAS`）。判据写在这几处的注释里，用例钉在各自的 spec / `#[test]`
- **结论**：**剩 1 条仍值得做**，需另开工作项；已修条目与其修法说明一并删除（判据都写在代码注释里了）

同时删掉一条明确不做的：**分片上限的检查顺序**。评审指出 `read_chunk` 在 `decode_bytes` 之后才查上限，实测下来 base64 文本在 JSON 解析时已整体入内存，解码只多花约 3/4，没有放大效应；调整顺序反而要把 `$u8` 的编码知识推进 `read_chunk`。已改为补上缺失的上限测试。

---

## 1. 文件协议错误码与 Electron 是否一致，没有任何测试盯着

- **现象**：共享的 `storageBackendParitySuite`（`@aiao/rxdb-plugin-storage`，18 条）两端都跑，但它只钉了 `removeDirectory('/')` 一条路径类错误。评审点名的四种分叉一条都没覆盖：
  - `file.rmdir` 对普通文件 → Tauri `remove_dir_all` 报 `invalid_file_path`（`rust/src/file/mod.rs:468`），Electron 删掉并成功
  - `file.remove` 对目录 → macOS `permission_denied` / Linux `invalid_file_path`（`mod.rs:477`）/ Electron `host_internal_error`
  - 符号链接成环 → Tauri `host_internal_error`（`mod.rs:94-105` 无 `FilesystemLoop` 臂），Electron `invalid_file_path`
  - Windows 上 `file.read` 目录 → `permission_denied`（PLAUSIBLE，未在 Windows 验证）
- **后果**：两套宿主此刻**可能已经不一致**，而不会有任何东西变红。
- **为什么本轮没修**：修在本包里没用，正确的位置是那个共享套件；一加就同时作用于 Electron，而 Electron 侧若真的不一致，本包范围内修不了它，仓库会留红。
- **做法**：单开一条，把这四种情形加进 `storageBackendParitySuite`，同时定两端的口径并把 Electron 侧一起改齐。

---

## 附：复现用法

`pnpm nx run rxdb-adapter-tauri:build-test-host` 编出 `rust/target/debug/rxdb_host_stdio <临时根目录>`，按行喂 `{"id":N,"payload":<协议请求>}`、按 `id` 对应答即可，不需要起 Tauri。注意它走的是 `router.handle()` 而不是生产的 `handle_owned()`，窗口归属那一层在这里测不到。
