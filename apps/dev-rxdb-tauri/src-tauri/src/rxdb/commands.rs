//! 把 [`Host`] 接到 Tauri 的 IPC 上，对应 Electron 侧的
//! `apps/dev-rxdb-electron/src-electron/desktop-sqlite-bridge.ts`。
//!
//! 这是 `rxdb` 模块里唯一依赖 `tauri` 的文件——一致性测试用的 stdio 二进制复用其余全部模块，
//! 只把这一层换成 stdin/stdout。

use std::sync::Arc;

use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager, State};

use super::session::{Host, HostOptions};

/// 变更事件的事件名。
///
/// 必须与 `@aiao/rxdb-adapter-desktop` 的 `TAURI_DESKTOP_CHANGE_EVENT` 逐字相同；
/// 命令名同理，但它由 [`rxdb_desktop_request`] 的**函数名**决定
/// （`generate_handler!` 取的是标识符），改名时两处一起改。
pub const CHANGE_EVENT: &str = "rxdb-desktop-change";

/// 托管在 Tauri state 里的 host。
///
/// 整个应用一个实例：会话表要跨窗口、跨命令调用存活，而 `State` 是唯一能横跨
/// 所有 `invoke` 的持有点。
pub struct DesktopHost(Arc<Host>);

impl DesktopHost {
    /// 在应用数据目录上建 host，变更事件走 `app.emit`。
    ///
    /// 物理根目录取自 `app.path().app_data_dir()`——应用作用域，无需任何 `fs` 插件权限（AC#1）。
    pub fn new(app: &AppHandle) -> tauri::Result<Self> {
        let app_data_dir = app.path().app_data_dir()?;
        let emitter = app.clone();
        Ok(Self(Arc::new(Host::new(HostOptions {
            app_data_dir,
            deliver: Arc::new(move |message| {
                // 事件发不出去意味着响应式查询永远不刷新，在 UI 上表现为「数据没变」
                // ——所有故障形态里最难查的一种。这里没有可以回报错误的调用方，
                // 至少要在日志里留下痕迹，不能静默吞掉。
                if let Err(error) = emitter.emit(CHANGE_EVENT, message) {
                    eprintln!("[rxdb-desktop] failed to emit {CHANGE_EVENT}: {error}");
                }
            }),
        }))))
    }

    /// 关闭全部会话，退出路径上调用。
    ///
    /// 不做这一步，SQLite 的文件句柄与 `-wal` / `-shm` 会活到进程被杀为止；
    /// AC#8 要的「关掉应用后能重命名库文件」正是靠这里的 checkpoint 与 close。
    pub fn close_all(&self) {
        self.0.close_all();
    }
}

/// renderer 的唯一入口，对应 `createTauriHostTransport` 里的
/// `invoke('rxdb_desktop_request', { payload })`。
///
/// # 为什么是 `async` + `spawn_blocking`
///
/// Tauri 只把 **async** 命令派到独立任务上，同步命令跑在主线程。若走同步，
/// 两个会话争写锁时会死锁：A 持锁，B 的 `BEGIN IMMEDIATE` 占住主线程等到 `busy_timeout`，
/// 而能解开它的 A 的 `COMMIT` 正排在 B 后面。
///
/// 而 `rusqlite` 是彻头彻尾的阻塞 API，直接写成 `async fn` 只会把阻塞挪到异步运行时的
/// worker 上——worker 数等于核心数，几条并发事务就能耗光。`spawn_blocking` 用的是
/// 按需增长的阻塞线程池，这才是阻塞调用该待的地方。
///
/// # 关于返回类型
///
/// 业务错误是**普通返回值**（`{ kind: "error", code, message }`），不是 `Err`：
/// Tauri 把 `Err` 压平成字符串，AC#5 承诺的可判别 `code` 会在路上丢掉。
/// 这里的 `Err` 只对应一种情况——`Host::handle` panic 了。那是缺陷而非业务失败，
/// 让 `invoke` 直接 reject 才是诚实的信号。
#[tauri::command]
pub async fn rxdb_desktop_request(
    payload: Value,
    host: State<'_, DesktopHost>,
) -> Result<Value, String> {
    let host = Arc::clone(&host.0);
    tauri::async_runtime::spawn_blocking(move || host.handle(&payload))
        .await
        .map_err(|error| format!("rxdb desktop host panicked: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn test_host() -> (DesktopHost, std::path::PathBuf) {
        let root = std::env::temp_dir().join(format!("rxdb-commands-{}", uuid::Uuid::new_v4()));
        let host = Host::new(HostOptions {
            app_data_dir: root.clone(),
            deliver: Arc::new(|_| {}),
        });
        (DesktopHost(Arc::new(host)), root)
    }

    /// 事件名是跨语言契约的一半，另一半在 `tauri-host-transport.ts` 里。
    /// 改动只会在运行时表现为「订阅了但永远收不到事件」，编译器帮不上忙，所以钉死它。
    #[test]
    fn change_event_name_matches_the_renderer_contract() {
        assert_eq!(CHANGE_EVENT, "rxdb-desktop-change");
    }

    /// state 里托管的 host 与 renderer 直连的 host 是同一个东西：命令层不加工请求。
    #[test]
    fn state_dispatches_requests_to_the_host_unchanged() {
        let (host, root) = test_host();
        let response = host.0.handle(&json!({
            "kind": "open",
            "storage": { "engine": "sqlite", "databaseName": "app.sqlite3" }
        }));
        assert_eq!(response["kind"], "open");
        assert_eq!(response["result"]["resolvedLocation"], "desktop-sqlite://app-scope/app.sqlite3");
        host.close_all();
        std::fs::remove_dir_all(&root).unwrap();
    }

    /// 退出路径必须真的把会话清空，否则文件句柄活到进程被杀为止（AC#8）。
    #[test]
    fn close_all_drains_the_session_table() {
        let (host, root) = test_host();
        host.0.handle(&json!({
            "kind": "open",
            "storage": { "engine": "sqlite", "databaseName": "app.sqlite3" }
        }));
        assert_eq!(host.0.open_session_count(), 1);
        host.close_all();
        assert_eq!(host.0.open_session_count(), 0);
        std::fs::remove_dir_all(&root).unwrap();
    }
}
