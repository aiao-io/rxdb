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

use std::path::{Path, PathBuf};
use std::sync::Arc;

use serde_json::Value;

use super::file::protocol::is_file_request;
use super::file::FileHost;
use super::paths::STORAGE_DIRECTORY;
use super::session::{Host, HostOptions};

/// 同时持有两套宿主，并把请求送到对的那一套。
///
/// 不派生 `Debug`：`Host` 持有一个 `Arc<dyn Fn>` 的事件投递闭包，本身就不可打印。
pub struct DesktopRouter {
    sqlite: Arc<Host>,
    files: Arc<FileHost>,
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
        }
    }

    /// 处理一条 renderer 请求。两套宿主都保证不 panic、不 reject。
    pub fn handle(&self, request: &Value) -> Value {
        if is_file_request(request) {
            return self.files.handle(request);
        }
        self.sqlite.handle(request)
    }

    /// 关闭两套宿主的全部会话。
    pub fn close_all(&self) {
        self.files.close_all();
        self.sqlite.close_all();
    }

    /// SQL 宿主，供诊断与关停检查使用。
    pub fn sqlite(&self) -> &Host {
        &self.sqlite
    }

    /// 文件宿主，供诊断与关停检查使用。
    pub fn files(&self) -> &FileHost {
        &self.files
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
