# aiao-rxdb-tauri

`@aiao/rxdb-adapter-tauri` 的 Rust 宿主：应用作用域内的 SQLite 与本地文件存储，跑在桌面 host 线协议的特权一侧。

WebView 那一半是同目录的 npm 包（`../src/`）。两半住在同一个项目里，是因为它们是同一份线协议的两端——改一端必然看见另一端。

## 它是什么

- **普通 crate，不是 Tauri 插件**。命令由宿主应用自己 `generate_handler!` 注册。
- **一个 session 一条 `rusqlite::Connection`**。单连接事务语义由构造保证，不靠连接池配置。
- **对 `tauri` 的依赖只在 `commands.rs`**。引擎、协议、路由、文件宿主对 tauri 零依赖，一致性测试用的
  `rxdb_host_stdio` 二进制正是靠这一点在没有 `tauri::App` 的情况下原样复用它们。

## ⚠️ 未发布到 crates.io

`Cargo.toml` 里写着 `publish = false`。这不是遗漏，是本轮的显式决定（US-210 T7）。

**后果——引用方式只有两种：**

```toml
# git 依赖：仓库外的应用用这个
[dependencies]
aiao-rxdb-tauri = { git = "https://github.com/aiao-io/rxdb", tag = "v0.0.25" }

# path 依赖：本仓库内的 demo 用这个
[dependencies]
aiao-rxdb-tauri = { path = "../../../packages/rxdb-adapter-tauri/rust" }
```

**要为此付的代价，一条都不隐瞒：**

- **依赖本 crate 的 crate 自己也发不了 crates.io**。cargo 拒绝发布带 git/path 依赖的包——这条会传染，
  凡是想把「集成了 rxdb 的 Tauri 应用库」发上去的人都会撞墙。写应用（binary）不受影响。
- **没有语义化版本解析**。git 依赖锁的是 tag 或 commit，`cargo update` 不会帮你升到兼容的新版本；
  升级是手工改 tag。
- **构建要能访问 GitHub**。离线或内网 CI 需要自己 vendor（`cargo vendor`）或做仓库镜像。
- **版本对齐靠手工**。crate 的 `version` 与 npm 包的 `version` 是同一份协议的两端，今天没有任何机械
  约束保证它们同步。漂移不会静默——renderer 会在 `handshake` 上以 `protocol_violation` 拒绝连接
  （US-210 AC#10）——但排查成本落在用户头上。改一侧就要改另一侧。

**为什么现在不发**：crate 名、公开 API 表面（今天是十个 `pub mod` 全开）和版本策略都还没定，
发上去等于把一个还没想清楚的表面永久冻结。crates.io 的名字**不可回收**，撤回只有 yank 一条路。
`publish = false` 让一次手滑的 `cargo publish` 直接失败，而不是先占坑再后悔。

发布本身是后续任务，不在 US-210 范围内。

## 门禁

```bash
pnpm nx run rxdb-adapter-tauri:cargo-check        # cargo check --locked --all-targets
pnpm nx run rxdb-adapter-tauri:cargo-clippy       # clippy -D warnings，零警告
pnpm nx run rxdb-adapter-tauri:cargo-test         # cargo test --locked
pnpm nx run rxdb-adapter-tauri:test-conformance   # 跨进程一致性套件（Vitest 驱动 stdio 宿主）
```

`test-conformance` 的 `dependsOn` 会先编出 `build-test-host`，也就是 `src/bin/rxdb_host_stdio.rs`——
一个在 stdin/stdout 上跑同一套宿主的测试专用二进制（**不进任何产品包**）。

## 不建 cargo workspace

本 crate 与 `apps/dev-rxdb-tauri/src-tauri` 是两个独立的 cargo 包，靠 path 依赖相连，**刻意不并成一个
workspace**：workspace 会把 `target/` 挪到仓库根，连带一致性套件的 `HOST_BINARY`、e2e 的二进制路径、
`.gitignore`、CI 的缓存 key 与 `release-desktop.yml` 全要跟着改一遍。

代价是 `rusqlite(bundled)` 在两个 target 目录里各编译一次。可以接受：两边的 cargo target 本来就跑在
不同的 CI job 里，共享 target 目录也省不下那次编译。

## 目录

```text
rust/
├── src/lib.rs        # 模块清单 + 接入文档（宿主应用要写的那几行）
├── src/commands.rs   # 唯一依赖 tauri 的文件：命令、DesktopHost、会话按窗口记账
├── src/session.rs    # 会话表、变更事件扇出
├── src/engine.rs     # rusqlite 连接、PRAGMA、authorizer（挡住 ATTACH/DETACH）
├── src/protocol.rs   # 线协议形状与 PROTOCOL_VERSION
├── src/router.rs     # 请求 → 处理器
├── src/paths.rs      # 逻辑名 → 物理路径，白名单校验
├── src/value.rs      # SQLite 值 ↔ JSON（base64 BLOB、大整数字符串化）
├── src/script.rs     # 多语句脚本切分
├── src/error.rs      # 错误码，与 TS 侧共用同一套
├── src/file/         # 本地文件存储宿主（US-505）：读写、独占锁
└── src/bin/rxdb_host_stdio.rs  # 一致性测试用的 stdio 宿主
```

## 许可

MIT，见仓库根目录的 LICENSE。
