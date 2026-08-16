//! 一条 IPC 通道上的两套协议：SQL（US-210）与文件（US-505）。
//!
//! renderer 侧的 `DesktopHostTransport` 只有一个 `request()`，两套协议共用它，
//! 因此分流必须发生在 host 侧。Electron 的 `desktop-host-bridge.ts` 干的是同一件事，
//! 判据也一样：按 `kind` **精确成员判定**，不是按 `file.` 前缀。
//!
//! **顺序不能反。** TS 侧的注释写明了理由：SQLite host 的 dispatch 把「不是
//! open/close/version 的」一律当 `execute` 处理，一旦文件请求先落到那边，
//! 一条 `file.writeChunk` 会被当作 SQL 送进 SQLite。Rust 侧的 `parse_request`
//! 对未知 kind 是显式报错而不是兜底成 `execute`，但这里仍然照同样的顺序写：
//! 分流规则与 SQL 解析器的内部行为解耦，才不会在下一次修订时被悄悄推翻。

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, MutexGuard};

use serde_json::Value;

use super::file::protocol::is_file_request;
use super::file::FileHost;
use super::paths::STORAGE_DIRECTORY;
use super::session::{Host, HostOptions};

/// 一个窗口开出的会话，按协议分开记。
///
/// 分开是必要的：两套宿主的会话 id 都是 UUID，混在一张表里就无从知道该拿哪套宿主去关，
/// 而「两边都试一遍」会在另一套宿主上留下一条无意义的 `session_closed`。
#[derive(Default)]
struct OwnedSessions {
    files: HashSet<String>,
    sqlite: HashSet<String>,
}

/// 会话归属表：window label → 它开出的会话。
type Ownership = HashMap<String, OwnedSessions>;

/// 同时持有两套宿主，并把请求送到对的那一套。
///
/// 不派生 `Debug`：`Host` 持有一个 `Arc<dyn Fn>` 的事件投递闭包，本身就不可打印。
pub struct DesktopRouter {
    sqlite: Arc<Host>,
    files: Arc<FileHost>,
    /// 会话归属。放在路由器这一层而不是各自的宿主里：两套宿主都是传输无关的，
    /// 一致性测试的 stdio 二进制原样复用它们，那里根本没有「窗口」这个概念。
    owners: Mutex<Ownership>,
}

impl DesktopRouter {
    /// 用一份宿主配置构造路由器。
    ///
    /// 文件存储根固定为 `<app_data_dir>/rxdb-files`，与 SQLite 的 `rxdb-data` 并列。
    /// 两者同在应用数据目录之下——同一个备份域，正是 US-505 的全部要点。
    pub fn new(options: HostOptions) -> Self {
        let root = options.app_data_dir.join(STORAGE_DIRECTORY);
        Self {
            sqlite: Arc::new(Host::new(options)),
            files: Arc::new(FileHost::new(root)),
            owners: Mutex::new(Ownership::new()),
        }
    }

    /// 处理一条 renderer 请求。两套宿主都保证不 panic、不 reject。
    ///
    /// 不记归属：调用方（stdio 一致性二进制）没有窗口可言，它的会话只在进程退出时回收。
    pub fn handle(&self, request: &Value) -> Value {
        if is_file_request(request) {
            return self.files.handle(request);
        }
        self.sqlite.handle(request)
    }

    /// 处理一条 renderer 请求，并把它开出/关掉的会话记在 `owner` 名下。
    ///
    /// `owner` 是 Tauri 的 window label。窗口销毁后没有任何一条 renderer 请求会再来关它的
    /// 会话，唯一的回收时机是 [`Self::close_owner`]，而那时只剩下一个 label 可用——
    /// 所以归属必须在请求经过时就记下来。
    pub fn handle_owned(&self, request: &Value, owner: &str) -> Value {
        let files = is_file_request(request);
        let response = match files {
            true => self.files.handle(request),
            false => self.sqlite.handle(request),
        };
        self.track(owner, request, &response, files);
        response
    }

    /// 回收一个窗口的全部会话：放掉它持有的锁、丢弃它未提交的写入、关掉它的数据库连接。
    ///
    /// 逐个关闭，单个失败不影响其余：窗口已经没了，「尽量都关掉」比「第一个出错就停手」更有用。
    /// 特别是文件侧——一把没放掉的独占锁会让另一个窗口的 `lockAcquire` 永远等下去，
    /// 而那条等待没有任何超时能解开。
    pub fn close_owner(&self, owner: &str) {
        let Some(owned) = self.owners().remove(owner) else {
            return;
        };
        for session_id in &owned.files {
            let _ = self.files.close_session(session_id);
        }
        for session_id in &owned.sqlite {
            let _ = self.sqlite.close(session_id);
        }
    }

    /// 关闭两套宿主的全部会话。
    pub fn close_all(&self) {
        self.owners().clear();
        self.files.close_all();
        self.sqlite.close_all();
    }

    /// 某个窗口名下还记着的会话数，用于诊断与测试。
    pub fn owned_session_count(&self, owner: &str) -> usize {
        self.owners()
            .get(owner)
            .map_or(0, |owned| owned.files.len() + owned.sqlite.len())
    }

    /// SQL 宿主，供诊断与关停检查使用。
    pub fn sqlite(&self) -> &Host {
        &self.sqlite
    }

    /// 文件宿主，供诊断与关停检查使用。
    pub fn files(&self) -> &FileHost {
        &self.files
    }

    /// 按**应答**更新归属表。
    ///
    /// 判据取应答而不是请求：只有宿主真的接下了才算开出一个会话，一条被拒的 `open`
    /// 不该在表里留下任何东西，否则窗口销毁时会拿着一个从不存在的 id 去关。
    fn track(&self, owner: &str, request: &Value, response: &Value, files: bool) {
        match response["kind"].as_str() {
            Some("file.open" | "open") => self.remember(owner, files, response["result"]["sessionId"].as_str()),
            Some("file.close" | "close") => self.forget(files, request["sessionId"].as_str()),
            _ => (),
        }
    }

    fn remember(&self, owner: &str, files: bool, session_id: Option<&str>) {
        let Some(session_id) = session_id else {
            return;
        };
        let mut owners = self.owners();
        let owned = owners.entry(owner.to_string()).or_default();
        match files {
            true => owned.files.insert(session_id.to_string()),
            false => owned.sqlite.insert(session_id.to_string()),
        };
    }

    /// 从**所有**窗口名下抹掉一个会话 id。
    ///
    /// 不限定在发起关闭的那个窗口：会话 id 只是 renderer 递来的字符串，宿主并不校验
    /// 是谁在关。只从发起方名下删的话，一次跨窗口的关闭会在原窗口留下一条永不消失的记录。
    fn forget(&self, files: bool, session_id: Option<&str>) {
        let Some(session_id) = session_id else {
            return;
        };
        for owned in self.owners().values_mut() {
            match files {
                true => owned.files.remove(session_id),
                false => owned.sqlite.remove(session_id),
            };
        }
    }

    fn owners(&self) -> MutexGuard<'_, Ownership> {
        self.owners.lock().expect("ownership table mutex poisoned")
    }
}

/// 文件存储根的物理路径，仅用于诊断与测试。**不回传给 renderer**（AC#4）。
pub fn storage_root(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join(STORAGE_DIRECTORY)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::sync::mpsc;

    fn router(root: &Path) -> DesktopRouter {
        let (sender, _receiver) = mpsc::channel::<Value>();
        DesktopRouter::new(HostOptions {
            app_data_dir: root.to_path_buf(),
            deliver: Arc::new(move |event| {
                let _ = sender.send(event);
            }),
        })
    }

    /// 以某个窗口的名义开一个文件会话，返回它的 id。
    fn open_file_session(router: &DesktopRouter, owner: &str) -> String {
        router.handle_owned(&json!({ "kind": "file.open" }), owner)["result"]["sessionId"]
            .as_str()
            .expect("file.open returns a session id")
            .to_string()
    }

    /// 以某个窗口的名义开一个 SQL 会话，返回它的 id。
    fn open_sql_session(router: &DesktopRouter, owner: &str, database_name: &str) -> String {
        let response = router.handle_owned(
            &json!({
                "kind": "open",
                "storage": { "engine": "sqlite", "databaseName": database_name }
            }),
            owner,
        );
        response["result"]["sessionId"]
            .as_str()
            .unwrap_or_else(|| panic!("open failed: {response}"))
            .to_string()
    }

    /// 一条独占锁申请。
    fn acquire(session_id: &str, name: &str) -> Value {
        json!({ "kind": "file.lockAcquire", "sessionId": session_id, "name": name, "mode": "exclusive" })
    }

    /// 分流错了不会「报个错」，而是把一条文件请求送进 SQLite——所以两个方向都要断言。
    #[test]
    fn routes_each_protocol_to_its_own_host() {
        let root = std::env::temp_dir().join(format!("rxdb-router-{}", uuid::Uuid::new_v4()));
        let router = router(&root);

        let file_session = router.handle(&json!({ "kind": "file.open" }));
        assert_eq!(file_session["kind"], "file.open");
        assert_eq!(router.files().open_session_count(), 1);
        assert_eq!(router.sqlite().open_session_count(), 0);

        let sql_session = router.handle(&json!({
            "kind": "open",
            "storage": { "engine": "sqlite", "databaseName": "app.sqlite3" }
        }));
        assert_eq!(sql_session["kind"], "open");
        assert_eq!(router.sqlite().open_session_count(), 1);
        assert_eq!(router.files().open_session_count(), 1);

        router.close_all();
        assert_eq!(router.files().open_session_count(), 0);
        assert_eq!(router.sqlite().open_session_count(), 0);
        let _ = std::fs::remove_dir_all(&root);
    }

    /// 两个存储根必须分开：文件写进 `rxdb-data` 会和数据库文件混在一个目录里，
    /// 而 SQLite 的 WAL / journal 文件恰好是靠文件名约定被识别的。
    #[test]
    fn keeps_the_two_storage_roots_apart() {
        let root = std::env::temp_dir().join(format!("rxdb-router-{}", uuid::Uuid::new_v4()));
        let router = router(&root);
        let session = router.handle(&json!({ "kind": "file.open" }))["result"]["sessionId"]
            .as_str()
            .expect("file.open returns a session id")
            .to_string();

        assert_eq!(
            router.handle(&json!({ "kind": "file.mkdir", "sessionId": session, "path": "" }))["kind"],
            "file.mkdir"
        );
        assert!(storage_root(&root).is_dir());
        assert!(!root.join(super::super::paths::DATABASE_DIRECTORY).exists());

        router.close_all();
        let _ = std::fs::remove_dir_all(&root);
    }

    /// 一个窗口没了，另一个窗口必须**立刻**能拿到它持有的锁。
    ///
    /// 这是「session 绑定窗口生命周期」唯一说得清的判据。只在 `RunEvent::Exit` 回收的话，
    /// 崩掉的窗口带着它的独占锁一直留到整个应用退出，而活着的窗口看到的现象是
    /// 「`lockAcquire` 再也不返回」——与死锁不可区分，且没有任何超时会把它解开。
    #[test]
    fn reclaims_a_dead_window_sessions_and_frees_its_locks() {
        let root = std::env::temp_dir().join(format!("rxdb-router-{}", uuid::Uuid::new_v4()));
        let router = router(&root);
        let dead = open_file_session(&router, "main");
        let alive = open_file_session(&router, "second");
        assert_eq!(
            router.handle_owned(&acquire(&dead, "/a"), "main")["kind"],
            "file.lockAcquire"
        );

        std::thread::scope(|scope| {
            let waiter = scope.spawn(|| router.handle_owned(&acquire(&alive, "/a"), "second"));
            // 先确认它真的排上了队，再去销毁窗口：反过来就成了一次无竞争的申请，测的东西悄悄没了。
            while router.files().queued_lock_count("/a") < 1 {
                std::thread::yield_now();
            }
            router.close_owner("main");
            let granted = waiter.join().expect("the waiter thread does not panic");
            assert_eq!(granted["kind"], "file.lockAcquire");
        });

        assert_eq!(router.files().open_session_count(), 1);
        router.close_all();
        let _ = std::fs::remove_dir_all(&root);
    }

    /// 回收只能针对那一个窗口：连坐会把还活着的窗口的连接一起关掉。
    #[test]
    fn leaves_the_sql_sessions_of_other_windows_alone() {
        let root = std::env::temp_dir().join(format!("rxdb-router-{}", uuid::Uuid::new_v4()));
        let router = router(&root);
        open_sql_session(&router, "main", "main.sqlite3");
        open_sql_session(&router, "second", "second.sqlite3");
        assert_eq!(router.sqlite().open_session_count(), 2);

        router.close_owner("main");
        assert_eq!(router.sqlite().open_session_count(), 1);
        assert_eq!(router.owned_session_count("second"), 1);

        router.close_all();
        let _ = std::fs::remove_dir_all(&root);
    }

    /// renderer 自己关掉的会话不能一直挂在归属表上：一个长命窗口开开关关几千次，
    /// 那张表就成了另一处只增不减的泄漏，窗口销毁时还要拿着一堆早已作废的 id 各关一遍。
    #[test]
    fn forgets_a_session_the_renderer_closed_itself() {
        let root = std::env::temp_dir().join(format!("rxdb-router-{}", uuid::Uuid::new_v4()));
        let router = router(&root);
        let session = open_file_session(&router, "main");
        assert_eq!(router.owned_session_count("main"), 1);

        let closed = router.handle_owned(&json!({ "kind": "file.close", "sessionId": session }), "main");
        assert_eq!(closed["kind"], "file.close");
        assert_eq!(router.owned_session_count("main"), 0);

        router.close_all();
        let _ = std::fs::remove_dir_all(&root);
    }

    /// 未知 kind 落到 SQL 侧后必须报协议违规，而不是被当成一条 `execute`。
    #[test]
    fn refuses_a_kind_that_belongs_to_neither_protocol() {
        let root = std::env::temp_dir().join(format!("rxdb-router-{}", uuid::Uuid::new_v4()));
        let router = router(&root);
        let response = router.handle(&json!({ "kind": "file.explode", "sessionId": "x" }));
        assert_eq!(response["kind"], "error");
        assert_eq!(response["code"], "protocol_violation");
        router.close_all();
        let _ = std::fs::remove_dir_all(&root);
    }
}
