//! Tauri 侧的桌面 SQLite 宿主（US-210）。
//!
//! `@aiao/rxdb-adapter-desktop` 把 renderer 与 host 之间的一切收敛成一个
//! `DesktopHostTransport`，Electron 用 `ipcRenderer.invoke` 实现，Tauri 用
//! `invoke` + `listen` 实现。线协议两侧共用，本模块是它的 Rust 宿主实现。
//!
//! # 为什么不用 `tauri-plugin-sql`
//!
//! 两条都致命，且与配置无关：
//!
//! 1. 它对 `Pool<Db>` 执行 `query.execute(&*db)`，连续调用可能落在不同物理连接上，
//!    `BEGIN` / 业务语句 / `COMMIT` 无法固定在同一连接（US-210 AC#2）。
//! 2. 它**完全没有变更事件 API**，AC#3 要求的响应式订阅无从实现。
//!
//! 因此走故事技术笔记里的第二个方案：自写 command 持有一条 `rusqlite::Connection`，
//! 一个 session 一条连接——AC#2 由构造保证，同时也拿回了触发器这条事件通路。
//!
//! # 权限面
//!
//! `generate_handler!` 注册的应用自定义命令**不受 capability 门禁约束**（只有 `core:`
//! 与 `plugin:` 前缀的命令才是），因此 `capabilities/default.json` 无需任何改动，
//! 也不引入 `sql` / `fs` 插件权限——这正是 AC#1 要的「未授予额外 shell 或全文件系统权限」。

pub mod commands;
pub mod engine;
pub mod error;
pub mod file;
pub mod paths;
pub mod protocol;
pub mod router;
pub mod script;
pub mod session;
pub mod value;
