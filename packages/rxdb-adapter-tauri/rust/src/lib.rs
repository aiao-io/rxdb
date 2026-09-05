//! Tauri 侧的桌面 SQLite 与本地文件宿主（US-210 / US-505）。
//!
//! 同目录的 npm 包 `@aiao/rxdb-adapter-tauri` 把 renderer 与 host 之间的一切收敛成一个
//! `DesktopHostTransport`，Electron 用 `ipcRenderer.invoke` 实现，Tauri 用
//! `invoke` + `listen` 实现。线协议两侧共用，本 crate 是它的 Rust 宿主实现——
//! 两半住在同一个 Nx project（`packages/rxdb-adapter-tauri/`）里，正是为了让协议的两端
//! 一起改、一起发。
//!
//! # 接入：宿主应用要写的两行
//!
//! 本 crate 是**普通 crate，不是 Tauri 插件**，命令因此由宿主应用自己注册：
//!
//! ```ignore
//! tauri::Builder::default()
//!     .invoke_handler(tauri::generate_handler![aiao_rxdb_tauri::commands::rxdb_desktop_request])
//!     .setup(|app| {
//!         let dir = app.path().app_data_dir()?;
//!         // 第三个参数是允许敲这个 host 的窗口 label：应用自有命令不过 capability
//!         // 门禁，所以「谁有资格开库」只能在这里点名，且没有「不配置即全放行」。
//!         app.manage(aiao_rxdb_tauri::commands::DesktopHost::new(app.handle(), dir, &["main"]));
//!         Ok(())
//!     })
//! ```
//!
//! 完整接线（含窗口销毁与进程退出两处回收）见 `apps/dev-rxdb-tauri/src-tauri/src/lib.rs`，
//! 那份 demo 的接入代码就是文档里给用户看的那段。
//!
//! 做成普通 crate 而不是 `tauri::plugin::Builder` 是 2026-08-18 的决策，理由在权限面一节。
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
//!
//! 这也是本 crate **不做成 Tauri 插件**的全部理由。插件的命令带 `plugin:` 前缀，恰好落进
//! capability 门禁：宿主应用从此必须显式授予 `rxdb:allow-request`，AC#1 的论证就从
//! 「根本没有可授的东西」退化成「授予面收敛到两个命令」。换来的只是把上面那段接入代码
//! 缩成一行 `.plugin(...)`——用一条结构性的安全性质换几行样板，不划算。

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
