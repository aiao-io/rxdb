//! 请求派发与会话表，`packages/rxdb-adapter-desktop/src/desktop-sqlite-host.ts` 的 Rust 对照实现。
//!
//! 这里是唯一接触文件系统的地方：入参先过 [`super::protocol::parse_request`] 的信任边界，
//! 再落到 [`super::engine::Engine`]。
//!
//! [`Host::handle`] **永不 panic**：一切失败都编码成 `{ kind: "error", code, message }` 应答。
//! Tauri 的 `invoke` 在 Rust 侧返回 `Err` 时只把错误压平成字符串，`code` 会在路上丢掉，
//! 而 AC#5 承诺的正是「稳定、可判别的错误码」。
//!
//! # 与 Node 版的差异：没有 busy 重试循环
//!
//! Node 版在 host 层为 `BEGIN IMMEDIATE` / `BEGIN EXCLUSIVE` 写了一套 1ms→100ms 的异步退避，
//! 因为 Electron 主进程里所有连接共享一条线程，`PRAGMA busy_timeout` 的同步自旋会把持锁方的
//! `COMMIT` 续体一起卡死。Rust 侧每条连接活在自己的线程上，SQLite 自己的忙等就能正确工作，
//! 因此退避交给 [`super::engine`] 里的 `busy_timeout`，这一层不再重复实现。

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use serde_json::{json, Value};

use super::engine::{ChangeEvent, Engine, EngineOptions, ExecuteResult, DEFAULT_BATCH_TIMEOUT_MS};
use super::error::{ErrorCode, HostError, HostResult};
use super::paths::resolve_database_path;
use super::protocol::{error_response, parse_request, Request, PROTOCOL_VERSION};
use super::value::{encode_bigint, encode_date_ms, encode_real, encode_sqlite_value};

/// 逻辑位置的 scheme。
///
/// 刻意不是物理绝对路径：renderer 拿到物理根目录等于拿到了额外的文件系统情报，
/// 而它并不需要这份情报就能工作（AC#4）。
const LOGICAL_LOCATION_SCHEME: &str = "desktop-sqlite://app-scope";

/// 普通事务的起始 SQL。
///
/// 用 `IMMEDIATE` 而非裸 `BEGIN`：同一个文件上有多个窗口的连接，而 `BEGIN` 是延迟取锁的
/// ——写锁要等到事务里第一条写语句才拿，撞锁于是发生在**事务中途**。那时已经读过一份快照，
/// SQLite 要求整个事务回滚重来。`IMMEDIATE` 把取锁挪到起点，撞锁时事务根本还没开，
/// 由 `busy_timeout` 原地等待即可。wa-sqlite 的多连接模式出于同样的理由用 `BEGIN IMMEDIATE`。
const BEGIN_TRANSACTION_SQL: &str = "BEGIN IMMEDIATE;";

/// 系统 schema 迁移使用的最强锁，与 `Oo1ClientBase` 保持一致。
const BEGIN_SYSTEM_MIGRATION_TRANSACTION_SQL: &str = "BEGIN EXCLUSIVE;";

/// 变更事件的出口：拿到的是已经编码好的 `{ kind: "change", ... }` 消息。
///
/// Tauri 下是 `app.emit`，stdio 测试二进制下是往标准输出写一行 JSON。
pub type ChangeDelivery = Arc<dyn Fn(Value) + Send + Sync>;

/// [`Host::new`] 的入参。
pub struct HostOptions {
    /// 应用数据根目录；库文件落在它下面的 `rxdb-data/` 子目录里。
    pub app_data_dir: PathBuf,
    /// 变更事件出口。
    pub deliver: ChangeDelivery,
}

/// 桌面 SQLite host。
pub struct Host {
    app_data_dir: PathBuf,
    deliver: ChangeDelivery,
    /// 外层锁只保护表本身，连接各自加锁——两个会话因此能真正并行。
    sessions: Mutex<HashMap<String, Arc<Mutex<Engine>>>>,
}

impl Host {
    /// 创建一个 host。
    pub fn new(options: HostOptions) -> Self {
        Self {
            app_data_dir: options.app_data_dir,
            deliver: options.deliver,
            sessions: Mutex::new(HashMap::new()),
        }
    }

    /// 处理一条来自 renderer 的请求。
    ///
    /// 返回值一定是一个合法的协议应答，失败走 `kind: "error"` 分支。
    pub fn handle(&self, request: &Value) -> Value {
        match self.dispatch(request) {
            Ok(response) => response,
            Err(error) => error_response(&error),
        }
    }

    /// 当前打开的会话数，用于诊断与关停检查。
    pub fn open_session_count(&self) -> usize {
        self.sessions.lock().expect("session table mutex poisoned").len()
    }

    /// 关闭全部会话，通常在应用退出前调用。
    ///
    /// 逐个关闭，单个失败不影响其余——退出路径上「尽量都关掉」比「第一个出错就停手」更有用。
    pub fn close_all(&self) {
        let sessions = {
            let mut table = self.sessions.lock().expect("session table mutex poisoned");
            std::mem::take(&mut *table)
        };
        for engine in sessions.into_values() {
            let _ = engine.lock().expect("engine mutex poisoned").close();
        }
    }

    fn dispatch(&self, request: &Value) -> HostResult<Value> {
        match parse_request(request)? {
            Request::Open {
                database_name,
                batch_timeout,
            } => self.open(&database_name, batch_timeout),
            Request::Execute {
                session_id,
                sql,
                bindings,
            } => self.execute(&session_id, &sql, &bindings),
            Request::Version { session_id } => self.version(&session_id),
            Request::Close { session_id } => self.close(&session_id),
        }
    }

    /// 打开一个会话。
    ///
    /// 每个 `open` 得到**独立的**连接而不是共享一条：多个窗口共用连接时它们的 `BEGIN` 块
    /// 会互相穿插，事务隔离直接失效（AC#2）。
    fn open(&self, database_name: &str, batch_timeout: Option<u64>) -> HostResult<Value> {
        let session_id = uuid::Uuid::new_v4().to_string();
        let file_path = resolve_database_path(&self.app_data_dir, database_name)?;
        let engine = Engine::open(EngineOptions {
            file_path,
            db_name: database_name.to_string(),
            batch_timeout_ms: batch_timeout.unwrap_or(DEFAULT_BATCH_TIMEOUT_MS),
            sink: self.change_sink(&session_id),
        })?;
        let mut table = self.sessions.lock().expect("session table mutex poisoned");
        table.insert(session_id.clone(), Arc::new(Mutex::new(engine)));
        Ok(json!({
            "kind": "open",
            "result": {
                "sessionId": session_id,
                "resolvedLocation": format!("{LOGICAL_LOCATION_SCHEME}/{database_name}"),
                "protocolVersion": PROTOCOL_VERSION,
                "beginTransactionSql": BEGIN_TRANSACTION_SQL,
                "beginSystemMigrationTransactionSql": BEGIN_SYSTEM_MIGRATION_TRANSACTION_SQL,
            }
        }))
    }

    fn execute(&self, session_id: &str, sql: &str, bindings: &[rusqlite::types::Value]) -> HostResult<Value> {
        let engine = self.require_session(session_id)?;
        let result = engine
            .lock()
            .expect("engine mutex poisoned")
            .execute(sql, bindings)?;
        Ok(json!({ "kind": "execute", "result": encode_execute_result(&result)? }))
    }

    fn version(&self, session_id: &str) -> HostResult<Value> {
        let engine = self.require_session(session_id)?;
        let version = engine.lock().expect("engine mutex poisoned").version()?;
        Ok(json!({ "kind": "version", "result": version }))
    }

    /// 关闭会话。
    ///
    /// 先从表里摘掉再关：关闭本身可能报错（例如 checkpoint 失败），但连接已经不可用了，
    /// 留在表里只会让后续请求打到一个死会话上。
    ///
    /// `pub(crate)`：除了 renderer 发来的 `close`，[`DesktopRouter::close_owner`] 也要按 id
    /// 关会话——窗口销毁后不会再有任何一条 renderer 请求来关它。
    ///
    /// [`DesktopRouter::close_owner`]: crate::rxdb::router::DesktopRouter::close_owner
    pub(crate) fn close(&self, session_id: &str) -> HostResult<Value> {
        let engine = self.take_session(session_id)?;
        engine.lock().expect("engine mutex poisoned").close()?;
        Ok(json!({ "kind": "close" }))
    }

    fn change_sink(&self, session_id: &str) -> Arc<dyn Fn(ChangeEvent) + Send + Sync> {
        let deliver = Arc::clone(&self.deliver);
        let session_id = session_id.to_string();
        Arc::new(move |event| deliver(encode_change_message(&session_id, &event)))
    }

    fn require_session(&self, session_id: &str) -> HostResult<Arc<Mutex<Engine>>> {
        let table = self.sessions.lock().expect("session table mutex poisoned");
        table.get(session_id).map(Arc::clone).ok_or_else(|| unknown(session_id))
    }

    fn take_session(&self, session_id: &str) -> HostResult<Arc<Mutex<Engine>>> {
        let mut table = self.sessions.lock().expect("session table mutex poisoned");
        table.remove(session_id).ok_or_else(|| unknown(session_id))
    }
}

impl Drop for Host {
    /// host 消失时连接也必须消失，否则库文件会被一个没人再引用的句柄占住。
    fn drop(&mut self) {
        self.close_all();
    }
}

fn unknown(session_id: &str) -> HostError {
    HostError::new(
        ErrorCode::SessionClosed,
        format!("session {session_id} is not open on this host"),
    )
}

/// 编码成 TS 侧的 `SqliteResult`。
///
/// `results` 是数组而非单值：wasm 后端的类型是 `SqliteData[]`，虽然实际至多一个元素。
/// 这里保持同一形状，上层才不必分后端处理。
fn encode_execute_result(result: &ExecuteResult) -> HostResult<Value> {
    let results = match &result.results {
        None => Vec::new(),
        Some(data) => vec![encode_result_set(data)?],
    };
    Ok(json!({
        "sql": result.sql,
        "rowsAffected": result.rows_affected,
        "elapsed": encode_real(result.elapsed_ms)?,
        "results": results,
    }))
}

fn encode_result_set(data: &super::engine::ResultSet) -> HostResult<Value> {
    let rows = data
        .rows
        .iter()
        .map(|row| row.iter().map(encode_sqlite_value).collect::<HostResult<Vec<Value>>>())
        .collect::<HostResult<Vec<Vec<Value>>>>()?;
    Ok(json!({ "columns": data.columns, "rows": rows }))
}

/// 编码成 TS 侧的 `DesktopHostChangeEventMessage`。
///
/// `rowIds` 一律走 `$bigint` 标签而不是裸数字：TS 侧的类型是 `bigint[]`，
/// 让小 rowid 变成 `number`、大 rowid 变成 `bigint` 会把类型分歧推给每一个消费者。
fn encode_change_message(session_id: &str, event: &ChangeEvent) -> Value {
    let row_ids: Vec<Value> = event.row_ids.iter().copied().map(encode_bigint).collect();
    json!({
        "kind": "change",
        "sessionId": session_id,
        "event": {
            "type": event.change_type,
            "dbName": event.db_name,
            "tableName": event.table_name,
            "rowIds": row_ids,
            "recordAt": encode_date_ms(event.record_at_ms),
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::mpsc::{channel, Receiver};
    use std::time::Duration;

    struct Harness {
        host: Host,
        events: Receiver<Value>,
        directory: PathBuf,
    }

    impl Drop for Harness {
        fn drop(&mut self) {
            self.host.close_all();
            let _ = std::fs::remove_dir_all(&self.directory);
        }
    }

    fn harness() -> Harness {
        let directory = std::env::temp_dir().join(format!("rxdb-session-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&directory).unwrap();
        let (sender, events) = channel();
        let host = Host::new(HostOptions {
            app_data_dir: directory.clone(),
            deliver: Arc::new(move |message| {
                let _ = sender.send(message);
            }),
        });
        Harness {
            host,
            events,
            directory,
        }
    }

    fn open_session(host: &Host, database_name: &str) -> String {
        let response = host.handle(&json!({
            "kind": "open",
            "storage": { "engine": "sqlite", "databaseName": database_name },
            "batchTimeout": 0
        }));
        assert_eq!(response["kind"], "open", "{response}");
        response["result"]["sessionId"].as_str().unwrap().to_string()
    }

    fn run(host: &Host, session_id: &str, sql: &str) -> Value {
        let response = host.handle(&json!({ "kind": "execute", "sessionId": session_id, "sql": sql }));
        assert_eq!(response["kind"], "execute", "{sql} -> {response}");
        response["result"].clone()
    }

    #[test]
    fn open_reports_a_logical_location_not_a_filesystem_path() {
        let harness = harness();
        let response = harness.host.handle(&json!({
            "kind": "open",
            "storage": { "engine": "sqlite", "databaseName": "app.sqlite3" }
        }));
        let result = &response["result"];
        assert_eq!(result["resolvedLocation"], "desktop-sqlite://app-scope/app.sqlite3");
        assert_eq!(result["protocolVersion"], PROTOCOL_VERSION);
        assert_eq!(result["beginTransactionSql"], "BEGIN IMMEDIATE;");
        assert_eq!(result["beginSystemMigrationTransactionSql"], "BEGIN EXCLUSIVE;");
        // 物理根目录不得出现在任何字段里。
        let serialized = response.to_string();
        assert!(
            !serialized.contains(harness.directory.to_str().unwrap()),
            "{serialized}"
        );
    }

    #[test]
    fn executes_and_encodes_results_in_the_wire_shape() {
        let harness = harness();
        let session = open_session(&harness.host, "app.sqlite3");
        run(&harness.host, &session, "CREATE TABLE t (a, b)");
        let insert = harness.host.handle(&json!({
            "kind": "execute",
            "sessionId": session,
            "sql": "INSERT INTO t VALUES (?, ?)",
            "bindings": [{ "$bigint": "9007199254740993" }, { "$u8": "Zm9v" }]
        }));
        assert_eq!(insert["result"]["rowsAffected"], 1);

        let selected = run(&harness.host, &session, "SELECT a, b FROM t");
        assert_eq!(selected["results"][0]["columns"], json!(["a", "b"]));
        assert_eq!(
            selected["results"][0]["rows"],
            json!([[{ "$bigint": "9007199254740993" }, { "$u8": "Zm9v" }]])
        );
        assert_eq!(selected["rowsAffected"], 0);
    }

    #[test]
    fn reports_the_engine_version_and_closes() {
        let harness = harness();
        let session = open_session(&harness.host, "app.sqlite3");
        let version = harness
            .host
            .handle(&json!({ "kind": "version", "sessionId": session }));
        assert_eq!(version["result"], rusqlite::version());

        assert_eq!(harness.host.open_session_count(), 1);
        let closed = harness
            .host
            .handle(&json!({ "kind": "close", "sessionId": session }));
        assert_eq!(closed, json!({ "kind": "close" }));
        assert_eq!(harness.host.open_session_count(), 0);
    }

    /// 会话不存在（或已关闭）时报 `session_closed`，而不是 panic 掉整个 host。
    #[test]
    fn answers_unknown_sessions_with_an_error_response() {
        let harness = harness();
        let session = open_session(&harness.host, "app.sqlite3");
        harness
            .host
            .handle(&json!({ "kind": "close", "sessionId": session }));
        for kind in ["execute", "version", "close"] {
            let response = harness.host.handle(&json!({
                "kind": kind, "sessionId": session, "sql": "SELECT 1"
            }));
            assert_eq!(response["kind"], "error", "for {kind}");
            assert_eq!(response["code"], "session_closed", "for {kind}");
        }
    }

    /// AC#5：错误是**普通返回值**，`code` 必须原样跨过边界。
    #[test]
    fn encodes_failures_as_ordinary_responses() {
        let harness = harness();
        let session = open_session(&harness.host, "app.sqlite3");
        let response = harness.host.handle(&json!({
            "kind": "execute", "sessionId": session, "sql": "SELECT * FROM missing"
        }));
        assert_eq!(response["kind"], "error");
        assert_eq!(response["code"], "statement_failed");
        assert!(response["message"].as_str().unwrap().contains("missing"));
    }

    /// AC#2：两个会话各持一条连接，一方未提交的写入对另一方不可见，提交后立刻可见。
    #[test]
    fn keeps_transactions_isolated_between_sessions() {
        let harness = harness();
        let writer = open_session(&harness.host, "app.sqlite3");
        let reader = open_session(&harness.host, "app.sqlite3");
        run(&harness.host, &writer, "CREATE TABLE t (a)");

        run(&harness.host, &writer, BEGIN_TRANSACTION_SQL);
        run(&harness.host, &writer, "INSERT INTO t VALUES (1)");
        let during = run(&harness.host, &reader, "SELECT count(*) FROM t");
        assert_eq!(during["results"][0]["rows"], json!([[0]]));

        run(&harness.host, &writer, "COMMIT;");
        let after = run(&harness.host, &reader, "SELECT count(*) FROM t");
        assert_eq!(after["results"][0]["rows"], json!([[1]]));
    }

    /// 回滚必须真的丢掉写入，否则崩溃恢复后会读到半截状态。
    #[test]
    fn rolls_a_transaction_back() {
        let harness = harness();
        let session = open_session(&harness.host, "app.sqlite3");
        run(&harness.host, &session, "CREATE TABLE t (a)");
        run(&harness.host, &session, BEGIN_TRANSACTION_SQL);
        run(&harness.host, &session, "INSERT INTO t VALUES (1)");
        run(&harness.host, &session, "ROLLBACK;");
        let after = run(&harness.host, &session, "SELECT count(*) FROM t");
        assert_eq!(after["results"][0]["rows"], json!([[0]]));
    }

    /// 变更事件的**线上形状**：renderer 的 `parseDesktopHostChangeEvent` 就按这些键解包。
    #[test]
    fn delivers_change_events_tagged_with_their_session() {
        let harness = harness();
        let session = open_session(&harness.host, "app.sqlite3");
        run(&harness.host, &session, "CREATE TABLE \"rxdb$rxdb_change\" (a)");
        run(&harness.host, &session, "INSERT INTO \"rxdb$rxdb_change\" VALUES (1)");

        let message = harness.events.recv_timeout(Duration::from_secs(5)).unwrap();
        assert_eq!(message["kind"], "change");
        assert_eq!(message["sessionId"], session.as_str());
        let event = &message["event"];
        assert_eq!(event["type"], 18);
        assert_eq!(event["dbName"], "main");
        assert_eq!(event["tableName"], "rxdb$rxdb_change");
        assert_eq!(event["rowIds"], json!([{ "$bigint": "1" }]));
        assert!(event["recordAt"]["$date"].as_i64().unwrap() > 0);
    }

    /// 库名校验发生在建目录之前，越界的名字不得在磁盘上留下任何痕迹。
    #[test]
    fn refuses_to_open_a_database_outside_the_app_scope() {
        let harness = harness();
        let response = harness.host.handle(&json!({
            "kind": "open",
            "storage": { "engine": "sqlite", "databaseName": "../escape.sqlite3" }
        }));
        assert_eq!(response["kind"], "error");
        assert_eq!(response["code"], "invalid_database_name");
        assert_eq!(harness.host.open_session_count(), 0);
    }
}
