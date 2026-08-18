//! 把 [`DesktopRouter`] 接到 Tauri 的 IPC 上，对应 Electron 侧的
//! `apps/dev-rxdb-electron/src-electron/desktop-sqlite-bridge.ts`。
//!
//! 这是 `rxdb` 模块里唯一依赖 `tauri` 的文件——一致性测试用的 stdio 二进制复用其余全部模块，
//! 只把这一层换成 stdin/stdout。

use std::path::{Path, PathBuf};
use std::sync::{Arc, Weak};

use serde_json::Value;
use tauri::{AppHandle, Emitter, State};

use super::router::DesktopRouter;
use super::session::HostOptions;

/// 变更事件的事件名。
///
/// 必须与 `@aiao/rxdb-adapter-tauri` 的 `TAURI_DESKTOP_CHANGE_EVENT` 逐字相同；
/// 命令名同理，但它由 [`rxdb_desktop_request`] 的**函数名**决定
/// （`generate_handler!` 取的是标识符），改名时两处一起改。
pub const CHANGE_EVENT: &str = "rxdb-desktop-change";

/// 托管在 Tauri state 里的 host。
///
/// 整个应用一个实例：会话表要跨窗口、跨命令调用存活，而 `State` 是唯一能横跨
/// 所有 `invoke` 的持有点。SQL 与文件两套协议共用这一个 state——renderer 侧
/// `DesktopHostTransport` 只有一个 `request()`，分流因此只能发生在 host 侧。
pub struct DesktopHost(Arc<DesktopRouter>);

impl DesktopHost {
    /// 在给定的根目录上建 host，变更事件按会话归属定向投递。
    ///
    /// 生产路径上 `app_data_dir` 来自 `app.path().app_data_dir()`——应用作用域，无需任何
    /// `fs` 插件权限（US-210 AC#1 / US-505 AC#1）。SQLite 库落在 `rxdb-data/`，文件存储落在
    /// `rxdb-files/`，两者同在这个目录之下，因而同属一个备份域（US-505 AC#4）。
    ///
    /// # 为什么根目录是参数而不是自己去读
    ///
    /// 自检模式要把它换到测试给的临时目录（`selfcheck.rs`）。若在这里写成
    /// `env::var(...).unwrap_or(app.path().app_data_dir()?)`，一个手滑的变量名就会让测试
    /// 悄悄写进用户真实的应用数据目录——那是铁律禁掉的兜底形状。选择因此上提到唯一的调用点，
    /// 在那里两个分支都是被显式选出来的，没有哪一个是另一个的退路。
    ///
    /// # 为什么是 `emit_to` 而不是 `emit`
    ///
    /// `emit` 广播给应用的每一个窗口，而每条变更事件里都带着 session id。那等于把所有
    /// 会话的 id 公开给所有窗口。会话 id 不是凭证（[`DesktopRouter::handle_owned`] 现在会验主），
    /// 但把它发给不相干的窗口本身就没有意义，只是徒增暴露面。收件人只能是开出这个会话的窗口。
    ///
    /// # 为什么是 `Arc::new_cyclic`
    ///
    /// 投递闭包要反查会话归属，而归属表在路由器里，路由器又要拿这个闭包才能构造。
    /// 用 `Weak` 打破这个环：闭包只在路由器还活着时投递，路由器没了也就没有会话可通知。
    /// 强引用会让路由器永远不被释放——它自己的 host 持有那个闭包。
    pub fn new(app: &AppHandle, app_data_dir: PathBuf) -> Self {
        let emitter = app.clone();
        Self(Arc::new_cyclic(|router: &Weak<DesktopRouter>| {
            let router = router.clone();
            DesktopRouter::new(HostOptions {
                app_data_dir,
                deliver: Arc::new(move |message| deliver_change(&emitter, &router, &message)),
            })
        }))
    }

    /// host 实际建库所在的根目录，见 [`DesktopRouter::app_data_dir`]。
    pub fn app_data_dir(&self) -> &Path {
        self.0.app_data_dir()
    }

    /// 关闭两套宿主的全部会话，退出路径上调用。
    ///
    /// 不做这一步，SQLite 的文件句柄与 `-wal` / `-shm` 会活到进程被杀为止；
    /// US-210 AC#8 要的「关掉应用后能重命名库文件」正是靠这里的 checkpoint 与 close。
    /// 文件侧则是把未提交的写入连同临时文件一起丢弃：留下 `.rxdb-tmp` 不会破坏目标文件
    /// （原子替换只发生在 commit），但会在用户的备份域里堆垃圾。
    pub fn close_all(&self) {
        self.0.close_all();
    }

    /// 回收一个窗口的全部会话，窗口销毁时调用。
    ///
    /// 只在 `RunEvent::Exit` 上 `close_all` 是不够的：窗口崩溃或被单独关掉之后，
    /// 它持有的文件锁、未提交的写入和 SQLite 连接会一直活到整个应用退出。锁尤其致命——
    /// `file.lockAcquire` 是条件变量上的无限等待，另一个窗口从此再也拿不到那把锁，
    /// 而它看到的现象与死锁不可区分。
    pub fn close_window(&self, label: &str) {
        self.0.close_owner(label);
    }
}

/// 把一条变更事件送到开出该会话的那个窗口。
///
/// 查不到收件人时**不广播**：那正是这里要避免的行为。会话属于 [`DesktopRouter::handle`]
/// （一致性测试的 stdio 路径，没有窗口）或已经关掉时都会走到这一支，两种情况下都没有该收的人。
///
/// 事件发不出去意味着响应式查询永远不刷新，在 UI 上表现为「数据没变」——所有故障形态里
/// 最难查的一种。这里没有可以回报错误的调用方，至少要在日志里留下痕迹，不能静默吞掉。
fn deliver_change(emitter: &AppHandle, router: &Weak<DesktopRouter>, message: &Value) {
    let Some(router) = router.upgrade() else {
        return;
    };
    let Some(session_id) = message["sessionId"].as_str() else {
        eprintln!("[rxdb-desktop] dropped a {CHANGE_EVENT} without a session id");
        return;
    };
    let Some(owner) = router.session_owner(session_id) else {
        eprintln!("[rxdb-desktop] dropped a {CHANGE_EVENT} for unowned session {session_id}");
        return;
    };
    if let Err(error) = emitter.emit_to(owner.as_str(), CHANGE_EVENT, message) {
        eprintln!("[rxdb-desktop] failed to emit {CHANGE_EVENT} to {owner}: {error}");
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
/// 这里的 `Err` 只对应一种情况——`DesktopRouter::handle` panic 了。那是缺陷而非业务失败，
/// 让 `invoke` 直接 reject 才是诚实的信号。
///
/// # 关于 `window`
///
/// 会话按**发起窗口**记账，窗口销毁时据此回收（[`DesktopHost::close_window`]）。
/// 这个归属只能在请求经过时记下来：窗口没了以后，除了一个 label 什么都不剩。
///
/// 注入的是 `Window` 而不是 `Webview`：回收挂在 `WindowEvent::Destroyed` 上，那个事件
/// 按**窗口** label 分发。两处用的 label 必须同源，否则回收永远匹配不上任何一条记录。
#[tauri::command]
pub async fn rxdb_desktop_request(
    payload: Value,
    window: tauri::Window,
    host: State<'_, DesktopHost>,
) -> Result<Value, String> {
    let host = Arc::clone(&host.0);
    let owner = window.label().to_string();
    tauri::async_runtime::spawn_blocking(move || host.handle_owned(&payload, &owner))
        .await
        .map_err(|error| format!("rxdb desktop host panicked: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn test_host() -> (DesktopHost, PathBuf) {
        let root = std::env::temp_dir().join(format!("rxdb-commands-{}", uuid::Uuid::new_v4()));
        let router = DesktopRouter::new(HostOptions {
            app_data_dir: root.clone(),
            deliver: Arc::new(|_| {}),
        });
        (DesktopHost(Arc::new(router)), root)
    }

    /// 事件名是跨语言契约的一半，另一半在 `tauri-host-transport.ts` 里。
    /// 改动只会在运行时表现为「订阅了但永远收不到事件」，编译器帮不上忙，所以钉死它。
    #[test]
    fn change_event_name_matches_the_renderer_contract() {
        assert_eq!(CHANGE_EVENT, "rxdb-desktop-change");
    }

    /// 自检报告里的 `appDataDir` 就取自这里，所以它必须报的是**构造时收到的那个目录**。
    /// 这一条一旦退化（比如有人把它改回去自己读 `app.path()`），
    /// `apps/dev-rxdb-tauri-e2e` 的目录断言会变成一句同义反复而照旧全绿。
    #[test]
    fn reports_the_app_data_dir_it_was_built_on() {
        let (host, root) = test_host();
        assert_eq!(host.app_data_dir(), root.as_path());
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
        assert_eq!(host.0.sqlite().open_session_count(), 1);
        host.close_all();
        assert_eq!(host.0.sqlite().open_session_count(), 0);
        std::fs::remove_dir_all(&root).unwrap();
    }

    /// 接线的全部意义在这一条：state 里托管的必须是**路由器**，不是 SQL 宿主。
    /// 托错了不会编译失败，只会让一条 `file.open` 落进 SQL 解析器。
    #[test]
    fn state_routes_file_requests_to_the_file_host() {
        let (host, root) = test_host();
        let response = host.0.handle(&json!({ "kind": "file.open" }));
        assert_eq!(response["kind"], "file.open");
        assert_eq!(host.0.files().open_session_count(), 1);
        assert_eq!(host.0.sqlite().open_session_count(), 0);
        host.close_all();
        assert_eq!(host.0.files().open_session_count(), 0);
        let _ = std::fs::remove_dir_all(&root);
    }

    /// 窗口销毁钩子只回收**那一个** label 名下的会话。
    ///
    /// 无法在单测里造出真的 `Window`，所以钉的是这一层的两件事：label 被原样传给
    /// [`DesktopRouter::close_owner`]，且回收不波及其他窗口。
    #[test]
    fn close_window_reclaims_only_that_windows_sessions() {
        let (host, root) = test_host();
        host.0.handle_owned(&json!({ "kind": "file.open" }), "main");
        host.0.handle_owned(&json!({ "kind": "file.open" }), "second");
        assert_eq!(host.0.files().open_session_count(), 2);

        host.close_window("main");
        assert_eq!(host.0.files().open_session_count(), 1);
        assert_eq!(host.0.owned_session_count("second"), 1);

        host.close_all();
        let _ = std::fs::remove_dir_all(&root);
    }
}
