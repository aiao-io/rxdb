//! renderer 与 host 之间的线协议，`packages/rxdb-adapter-sqlite-core/src/desktop/desktop-host-protocol.ts` 的镜像。
//!
//! 这是 host 的**信任边界**：入参来自 WebView，不可信。解析结果是重新构造出来的
//! `Request`，而不是把原始 JSON 往下传——契约之外的字段因此不会顺着流进 host。
//!
//! 失败一律走**正常返回值** `{ "kind": "error", "code", "message" }` 而不是 reject：
//! Tauri 的 `invoke` 在 Rust 侧返回 `Err` 时只把错误序列化成字符串，`code` 会在路上丢掉，
//! 而 AC#5 承诺的正是「稳定、可判别的错误码」。

use serde_json::{Map, Value};

use super::error::{ErrorCode, HostError, HostResult};
use super::paths::validate_database_name;
use super::value::decode_binding;

/// 线协议版本；renderer 在 `handshake` 应答里核对该值（`open` 应答里也带一份）。
pub const PROTOCOL_VERSION: i64 = 1;

/// 单条 SQL 文本的长度上限。
pub const MAX_SQL_LENGTH: usize = 1_000_000;

/// 单条请求允许的绑定参数个数上限。
pub const MAX_BINDINGS: usize = 100_000;

/// 单个 blob 绑定参数的字节上限。
pub const MAX_BLOB_BYTES: usize = 64 * 1024 * 1024;

/// renderer 可以发给 host 的请求。
#[derive(Debug, Clone, PartialEq)]
pub enum Request {
    /// 协商线协议版本。
    ///
    /// **不带任何参数，也不产生任何副作用**——这正是它存在的理由。版本核对必须排在 `open`
    /// 之前：`open` 会建库、开连接、登记会话，等 renderer 从 `open` 应答里读出版本不匹配时，
    /// 磁盘上已经多了一个空库文件，而调用方拿不到 client，也就没有把手去收拾它（US-210 AC#10）。
    ///
    /// 加入本请求**没有**抬高 [`PROTOCOL_VERSION`]：它对 host 是纯增量的，老 renderer 直接发
    /// `open`，行为一字不变；而老到不认识这个 kind 的 host 会回 `protocol_violation`，那条路径
    /// 同样碰不到文件系统，于是「版本对不上就不建库」在新旧两种 host 上都成立。
    Handshake,
    /// 打开（必要时创建）一个数据库会话。
    Open {
        /// 应用作用域内的逻辑数据库名。
        database_name: String,
        /// 变更事件的防抖窗口（毫秒），省略时用 host 默认值。
        batch_timeout: Option<u64>,
    },
    /// 在已打开的会话上执行 SQL。
    Execute {
        /// host 签发的会话 ID。
        session_id: String,
        /// 待执行的 SQL。
        sql: String,
        /// 位置绑定参数。
        bindings: Vec<rusqlite::types::Value>,
    },
    /// 查询底层 SQLite 版本。
    Version {
        /// host 签发的会话 ID。
        session_id: String,
    },
    /// 关闭会话并释放文件句柄。
    Close {
        /// host 签发的会话 ID。
        session_id: String,
    },
}

fn violation(message: impl Into<String>) -> HostError {
    HostError::new(ErrorCode::ProtocolViolation, message)
}

fn as_object(value: &Value) -> HostResult<&Map<String, Value>> {
    value
        .as_object()
        .ok_or_else(|| violation("request must be a plain object"))
}

/// UUID v4 的字面形状，等价于 TS 侧的 `SESSION_ID_PATTERN`。
///
/// 文件协议（US-505）复用它校验 `sessionId` / `writeId` / `lockId`——TS 侧同样是一个
/// `readUuid` 服务于两套协议，各写一份只会让两边的接受集在下一次修订时分叉。
pub fn is_session_id(candidate: &str) -> bool {
    let groups = [8usize, 4, 4, 4, 12];
    let mut parts = candidate.split('-');
    let matched = groups
        .iter()
        .all(|length| parts.next().is_some_and(|part| is_hex_run(part, *length)));
    matched && parts.next().is_none()
}

fn is_hex_run(part: &str, length: usize) -> bool {
    part.len() == length && part.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn read_session_id(record: &Map<String, Value>) -> HostResult<String> {
    let session_id = record.get("sessionId").and_then(Value::as_str);
    session_id
        .filter(|candidate| is_session_id(candidate))
        .map(str::to_string)
        .ok_or_else(|| violation("sessionId must be a UUID string issued by the host"))
}

fn read_sql(record: &Map<String, Value>) -> HostResult<String> {
    let sql = record
        .get("sql")
        .and_then(Value::as_str)
        .ok_or_else(|| violation("sql must be a string"))?;
    // 与 TS 侧一致按 UTF-16 码元计长，否则同一段 SQL 在两侧的上限判定会不同。
    if sql.encode_utf16().count() > MAX_SQL_LENGTH {
        return Err(violation(format!("sql exceeds {MAX_SQL_LENGTH} characters")));
    }
    Ok(sql.to_string())
}

fn check_blob_size(value: &rusqlite::types::Value, index: usize) -> HostResult<()> {
    let rusqlite::types::Value::Blob(blob) = value else {
        return Ok(());
    };
    if blob.len() > MAX_BLOB_BYTES {
        return Err(violation(format!(
            "binding at index {index} is not a SQLite compatible value within size limits"
        )));
    }
    Ok(())
}

fn read_bindings(record: &Map<String, Value>) -> HostResult<Vec<rusqlite::types::Value>> {
    // 只有**缺席**才读作空数组。`null` 在 TS 侧过不了 `Array.isArray`，这里也不放行：
    // 编码层会丢掉 `undefined` 属性，因此一个显式的 `null` 只可能来自形状不对的调用方。
    let Some(bindings) = record.get("bindings") else {
        return Ok(Vec::new());
    };
    let items = bindings
        .as_array()
        .ok_or_else(|| violation("bindings must be an array"))?;
    if items.len() > MAX_BINDINGS {
        return Err(violation(format!("bindings exceed {MAX_BINDINGS} entries")));
    }
    items.iter().enumerate().map(decode_one_binding).collect()
}

fn decode_one_binding((index, item): (usize, &Value)) -> HostResult<rusqlite::types::Value> {
    let value = decode_binding(item)
        .map_err(|error| violation(format!("binding at index {index} is invalid: {}", error.message)))?;
    check_blob_size(&value, index)?;
    Ok(value)
}

/// `batchTimeout` 只接受非负整数；0 表示「尽快派发」，是合法档位。
fn read_batch_timeout(record: &Map<String, Value>) -> HostResult<Option<u64>> {
    match record.get("batchTimeout") {
        None => Ok(None),
        Some(value) => value
            .as_u64()
            .map(Some)
            .ok_or_else(|| violation(format!("batchTimeout must be an integer >= 0, got {value}"))),
    }
}

/// 校验 `storage`，只接受能力矩阵内的组合。
///
/// 不受支持时直接报错，**不回退**到内存库或另一个引擎：用户必须能确信数据确实
/// 写进了他指定的那个后端（AC#5）。当前矩阵：Tauri + SQLite ✅、Tauri + PGlite ❌（永不支持）。
fn read_storage(record: &Map<String, Value>) -> HostResult<String> {
    let storage = record
        .get("storage")
        .and_then(Value::as_object)
        .ok_or_else(|| violation("storage must be an object"))?;
    let engine = storage.get("engine").and_then(Value::as_str);
    if engine == Some("pglite") {
        return Err(HostError::new(
            ErrorCode::UnsupportedRuntimeEngine,
            "tauri cannot host a PGlite data directory: there is no Node main process to serve \
             PGlite synchronous filesystem contract",
        ));
    }
    if engine != Some("sqlite") {
        return Err(HostError::new(
            ErrorCode::UnsupportedRuntimeEngine,
            format!("unknown desktop storage engine {}", engine.unwrap_or("<missing>")),
        ));
    }
    let database_name = storage
        .get("databaseName")
        .and_then(Value::as_str)
        .ok_or_else(|| HostError::new(ErrorCode::InvalidDatabaseName, "database name must be a string"))?;
    validate_database_name(database_name)?;
    Ok(database_name.to_string())
}

/// 校验并归一化一条来自 renderer 的请求。
pub fn parse_request(value: &Value) -> HostResult<Request> {
    let record = as_object(value)?;
    let kind = record.get("kind").and_then(Value::as_str).unwrap_or("<missing>");
    match kind {
        // 握手没有任何字段可读：重新构造出来的值里因此只剩 kind 本身，renderer 多塞的东西一概进不来。
        "handshake" => Ok(Request::Handshake),
        "open" => Ok(Request::Open {
            database_name: read_storage(record)?,
            batch_timeout: read_batch_timeout(record)?,
        }),
        "execute" => Ok(Request::Execute {
            session_id: read_session_id(record)?,
            sql: read_sql(record)?,
            bindings: read_bindings(record)?,
        }),
        "version" => Ok(Request::Version {
            session_id: read_session_id(record)?,
        }),
        "close" => Ok(Request::Close {
            session_id: read_session_id(record)?,
        }),
        other => Err(violation(format!("unknown request kind {other}"))),
    }
}

/// 把一个 host 错误编码成协议里的错误应答。
///
/// 注意它是**应答**而不是传输层失败：调用方 `assertDesktopHostResponse` 会在 renderer
/// 侧把它重新变回一个带 `code` 的异常。
pub fn error_response(error: &HostError) -> Value {
    serde_json::json!({
        "kind": "error",
        "code": error.code,
        "message": error.message,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    const SESSION: &str = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

    fn open(storage: Value) -> Value {
        json!({ "kind": "open", "storage": storage })
    }

    /// 握手是协议里唯一**无副作用**的请求：它没有会话可指、也没有存储可开。
    /// 多带来的字段一律留在信任边界外，否则「无副作用」就成了一句只在正常入参下成立的话。
    #[test]
    fn parses_a_handshake_that_carries_nothing() {
        let noisy = json!({
            "kind": "handshake",
            "sessionId": SESSION,
            "storage": { "engine": "pglite", "databaseName": "../escape" }
        });
        assert_eq!(parse_request(&noisy).unwrap(), Request::Handshake);
    }

    #[test]
    fn parses_an_open_request() {
        let request = parse_request(&open(json!({ "engine": "sqlite", "databaseName": "app.sqlite3" }))).unwrap();
        assert_eq!(
            request,
            Request::Open {
                database_name: "app.sqlite3".into(),
                batch_timeout: None
            }
        );
    }

    #[test]
    fn reads_batch_timeout_including_the_zero_tier() {
        let mut record = open(json!({ "engine": "sqlite", "databaseName": "a" }));
        record["batchTimeout"] = json!(0);
        let Request::Open { batch_timeout, .. } = parse_request(&record).unwrap() else {
            panic!("expected an open request");
        };
        assert_eq!(batch_timeout, Some(0));
    }

    #[test]
    fn rejects_a_negative_or_fractional_batch_timeout() {
        for timeout in [json!(-1), json!(1.5), json!("16"), json!(null)] {
            let mut record = open(json!({ "engine": "sqlite", "databaseName": "a" }));
            record["batchTimeout"] = timeout.clone();
            let error = parse_request(&record).unwrap_err();
            assert_eq!(error.code, ErrorCode::ProtocolViolation, "for {timeout}");
        }
    }

    /// PGlite 在 Tauri 上永不支持——必须报能力缺失，而不是悄悄换成 SQLite。
    #[test]
    fn rejects_engines_outside_the_capability_matrix() {
        for storage in [
            json!({ "engine": "pglite", "dataDirectoryName": "pg" }),
            json!({ "engine": "mysql", "databaseName": "a" }),
            json!({ "databaseName": "a" }),
        ] {
            let error = parse_request(&open(storage.clone())).unwrap_err();
            assert_eq!(error.code, ErrorCode::UnsupportedRuntimeEngine, "for {storage}");
        }
    }

    #[test]
    fn rejects_a_database_name_that_is_not_app_scoped() {
        let error = parse_request(&open(json!({ "engine": "sqlite", "databaseName": "../x" }))).unwrap_err();
        assert_eq!(error.code, ErrorCode::InvalidDatabaseName);
    }

    #[test]
    fn parses_execute_with_decoded_bindings() {
        let request = parse_request(&json!({
            "kind": "execute",
            "sessionId": SESSION,
            "sql": "INSERT INTO t VALUES (?, ?, ?)",
            "bindings": [null, { "$bigint": "9007199254740993" }, { "$u8": "Zm9v" }]
        }))
        .unwrap();
        assert_eq!(
            request,
            Request::Execute {
                session_id: SESSION.into(),
                sql: "INSERT INTO t VALUES (?, ?, ?)".into(),
                bindings: vec![
                    rusqlite::types::Value::Null,
                    rusqlite::types::Value::Integer(9_007_199_254_740_993),
                    rusqlite::types::Value::Blob(vec![102, 111, 111]),
                ],
            }
        );
    }

    /// 缺席的 `bindings` 读作空数组；显式 `null` 不是数组，按协议违规拒绝（与 TS 侧一致）。
    #[test]
    fn treats_absent_bindings_as_empty_but_rejects_null() {
        let request =
            parse_request(&json!({ "kind": "execute", "sessionId": SESSION, "sql": "SELECT 1" })).unwrap();
        let Request::Execute { bindings, .. } = request else {
            panic!("expected an execute request");
        };
        assert!(bindings.is_empty());

        let with_null = json!({ "kind": "execute", "sessionId": SESSION, "sql": "SELECT 1", "bindings": null });
        assert_eq!(
            parse_request(&with_null).unwrap_err().code,
            ErrorCode::ProtocolViolation
        );
    }

    #[test]
    fn rejects_a_session_id_that_the_host_could_not_have_issued() {
        let malformed = [
            json!("not-a-uuid"),
            json!("3f2504e0-4f89-41d3-9a0c-0305e82c330"),
            json!("3f2504e0-4f89-41d3-9a0c-0305e82c3301-extra"),
            json!("3f2504e0-4f89-41d3-9a0c-0305e82c330g"),
            json!(1),
            json!(null),
        ];
        for session_id in malformed {
            let error = parse_request(&json!({ "kind": "version", "sessionId": session_id })).unwrap_err();
            assert_eq!(error.code, ErrorCode::ProtocolViolation, "for {session_id}");
        }
    }

    #[test]
    fn accepts_uppercase_session_ids() {
        let request = parse_request(&json!({ "kind": "close", "sessionId": SESSION.to_uppercase() })).unwrap();
        assert_eq!(
            request,
            Request::Close {
                session_id: SESSION.to_uppercase()
            }
        );
    }

    #[test]
    fn rejects_shapes_that_are_not_requests() {
        for value in [json!([]), json!("open"), json!(null), json!({ "kind": "explode" })] {
            let error = parse_request(&value).unwrap_err();
            assert_eq!(error.code, ErrorCode::ProtocolViolation, "for {value}");
        }
    }

    #[test]
    fn enforces_the_sql_and_binding_limits() {
        let long_sql = "-".repeat(MAX_SQL_LENGTH + 1);
        let over_limit = json!({ "kind": "execute", "sessionId": SESSION, "sql": long_sql });
        assert_eq!(
            parse_request(&over_limit).unwrap_err().code,
            ErrorCode::ProtocolViolation
        );

        let too_many = json!({
            "kind": "execute", "sessionId": SESSION, "sql": "SELECT 1",
            "bindings": vec![Value::Null; MAX_BINDINGS + 1]
        });
        assert_eq!(
            parse_request(&too_many).unwrap_err().code,
            ErrorCode::ProtocolViolation
        );
    }

    /// blob 上限直接测断言函数：构造一个真的 64 MiB 载荷来跑解析，代价远大于它证明的东西。
    #[test]
    fn enforces_the_blob_size_limit() {
        let at_limit = rusqlite::types::Value::Blob(vec![0; 0]);
        assert!(check_blob_size(&at_limit, 0).is_ok());
        let over_limit = rusqlite::types::Value::Blob(vec![0; MAX_BLOB_BYTES + 1]);
        assert_eq!(
            check_blob_size(&over_limit, 3).unwrap_err().code,
            ErrorCode::ProtocolViolation
        );
    }

    /// 错误应答的**线上形状**：renderer 的 `assertDesktopHostResponse` 就按这三个键解包。
    #[test]
    fn encodes_errors_as_ordinary_responses() {
        let error = HostError::new(ErrorCode::DatabaseBusy, "locked");
        assert_eq!(
            error_response(&error),
            json!({ "kind": "error", "code": "database_busy", "message": "locked" })
        );
    }
}
