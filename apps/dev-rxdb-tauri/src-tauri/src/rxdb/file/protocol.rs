//! `file.*` 线协议，`packages/rxdb-adapter-desktop/src/desktop-host-protocol.ts` 的镜像。
//!
//! 与 SQL 协议 [`crate::rxdb::protocol`] **刻意分成两个解析器**而不是合并成一个大枚举：
//! TS 侧的注释已经写明理由——SQLite host 的 dispatch 把「不是 open/close/version 的」
//! 一律当 `execute` 处理，一旦 `file.*` 能通过那个解析器，一条文件请求就会被当成 SQL 执行。
//! 两个解析器互不接受对方的 `kind`，这条路径在运行时上不存在。
//!
//! 路径校验是 AC#4 的**第一道闸**：renderer 不可信，`..` / 绝对路径 / 盘符 / NUL / 保留名
//! 必须在信任边界上就被挡下，而不是等 host 拼完路径再靠前缀比对兜底——那道兜底
//! （[`super::resolve_within_root`]）仍然保留，但它是最后一道，不是唯一一道。

use serde_json::{Map, Value};

use crate::rxdb::error::{ErrorCode, HostError, HostResult};
use crate::rxdb::paths::is_windows_reserved_device_name;
use crate::rxdb::protocol::is_session_id;
use crate::rxdb::value::decode_bytes;

/// 单个分片的字节上限，与 TS 侧 `DESKTOP_HOST_MAX_FILE_CHUNK_BYTES` 相同。
pub const MAX_FILE_CHUNK_BYTES: usize = 4 * 1024 * 1024;

/// 整条路径的长度上限（UTF-16 码元），与 TS 侧 `DESKTOP_HOST_MAX_PATH_LENGTH` 相同。
pub const MAX_PATH_LENGTH: usize = 1024;

/// 单个分段的字节上限，与 TS 侧 `DESKTOP_HOST_MAX_PATH_SEGMENT_BYTES` 相同。
pub const MAX_PATH_SEGMENT_BYTES: usize = 255;

/// 单个会话同时挂起的未提交写入数上限，与 TS 侧
/// `DESKTOP_HOST_MAX_PENDING_WRITES_PER_SESSION` 相同。
///
/// 每个挂起的写入都占着一个打开的临时文件句柄，只有 commit/abort 才归还。renderer 不可信：
/// 不设上限，一个只 begin 不 commit 的循环就能把宿主进程的 fd 耗光，连带数据库也打不开。
pub const MAX_PENDING_WRITES_PER_SESSION: usize = 256;

/// 单个锁名允许排队的等待者数上限，与 TS 侧 `DESKTOP_HOST_MAX_QUEUED_LOCKS_PER_NAME` 相同。
///
/// 等待者不超时（对齐 Web Locks 的语义），队列只会越堆越长。这是给失控的调用方设的护栏，
/// 不是给正常并发设的配额。
pub const MAX_QUEUED_LOCKS_PER_NAME: usize = 256;

/// 文件协议认可的全部 `kind`。
///
/// 路由器按它分派，因此顺序无关紧要、完整性至关重要：漏掉一个，那条请求会掉进
/// SQL 解析器，报出的错误会指向一个与真实原因无关的方向。
pub const FILE_REQUEST_KINDS: [&str; 15] = [
    "file.open",
    "file.close",
    "file.stat",
    "file.list",
    "file.mkdir",
    "file.rmdir",
    "file.remove",
    "file.move",
    "file.read",
    "file.writeBegin",
    "file.writeChunk",
    "file.writeCommit",
    "file.writeAbort",
    "file.lockAcquire",
    "file.lockRelease",
];

/// 允许以存储根（空路径）为目标的操作；其余必须指向一个具体条目。
const ROOT_ADDRESSABLE_KINDS: [&str; 3] = ["file.stat", "file.list", "file.mkdir"];

/// 与 renderer 侧物理名编码器转义的集合一致：编码器的输出永远不含这些字符，
/// 出现即说明请求不是那个编码器产出的。
const FORBIDDEN_SEGMENT_CHARACTERS: [char; 9] = ['<', '>', ':', '"', '/', '\\', '|', '?', '*'];

/// 跨上下文锁的模式。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LockMode {
    /// 可与其他共享锁并存。
    Shared,
    /// 与一切其他持有者互斥。
    Exclusive,
}

/// renderer 可以发给文件 host 的请求。
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FileRequest {
    /// 开一个文件会话；未提交的写入与已持有的锁都挂在它上面。
    Open,
    /// 关闭会话并回收它的全部资源。
    Close {
        /// host 签发的会话 ID。
        session_id: String,
    },
    /// 读取条目元信息；目标不存在时结果是 `null` 而不是错误。
    Stat {
        /// host 签发的会话 ID。
        session_id: String,
        /// 相对存储根的路径，空串表示存储根自身。
        path: String,
    },
    /// 枚举目录的直属条目。
    List {
        /// host 签发的会话 ID。
        session_id: String,
        /// 相对存储根的路径，空串表示存储根自身。
        path: String,
    },
    /// 递归创建目录。
    Mkdir {
        /// host 签发的会话 ID。
        session_id: String,
        /// 相对存储根的路径，空串表示存储根自身。
        path: String,
    },
    /// 递归删除目录；目标不存在时静默成功。
    Rmdir {
        /// host 签发的会话 ID。
        session_id: String,
        /// 相对存储根的路径。
        path: String,
    },
    /// 删除文件；目标不存在时静默成功。
    Remove {
        /// host 签发的会话 ID。
        session_id: String,
        /// 相对存储根的路径。
        path: String,
    },
    /// 移动（重命名）文件或目录。
    Move {
        /// host 签发的会话 ID。
        session_id: String,
        /// 源路径。
        from_path: String,
        /// 目标路径。
        to_path: String,
    },
    /// 读取一帧内容。
    Read {
        /// host 签发的会话 ID。
        session_id: String,
        /// 相对存储根的路径。
        path: String,
        /// 起始偏移。
        offset: u64,
        /// 本帧最多读取的字节数。
        length: usize,
    },
    /// 开始一次写入，返回写入令牌。
    WriteBegin {
        /// host 签发的会话 ID。
        session_id: String,
        /// 相对存储根的目标路径。
        path: String,
    },
    /// 追加一个分片。
    WriteChunk {
        /// host 签发的会话 ID。
        session_id: String,
        /// host 签发的写入令牌。
        write_id: String,
        /// 分片内容。
        chunk: Vec<u8>,
    },
    /// 提交写入：`fsync` 后原子替换目标。
    WriteCommit {
        /// host 签发的会话 ID。
        session_id: String,
        /// host 签发的写入令牌。
        write_id: String,
    },
    /// 放弃写入并删除临时文件。
    WriteAbort {
        /// host 签发的会话 ID。
        session_id: String,
        /// host 签发的写入令牌。
        write_id: String,
    },
    /// 申请一把跨上下文锁；拿不到时阻塞排队。
    LockAcquire {
        /// host 签发的会话 ID。
        session_id: String,
        /// 锁名。
        name: String,
        /// 锁模式。
        mode: LockMode,
    },
    /// 释放一把锁。
    LockRelease {
        /// host 签发的会话 ID。
        session_id: String,
        /// host 签发的锁 ID。
        lock_id: String,
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

/// 缺席的字段在消息里写成 `undefined`，与 TS 侧 `String(undefined)` 的输出一致。
fn describe(value: Option<&Value>) -> String {
    value.map_or_else(|| "undefined".to_string(), Value::to_string)
}

/// `character < ' '` 覆盖 U+0000–U+001F。
///
/// 控制字符与 NUL 一并拒掉——部分平台会在 NUL 处截断路径，让校验通过的前缀和实际落盘的
/// 路径分家。用集合而不是正则：控制字符写进正则要么以裸字节形式躺在源码里，要么看不见。
fn has_forbidden_character(segment: &str) -> bool {
    segment
        .chars()
        .any(|character| FORBIDDEN_SEGMENT_CHARACTERS.contains(&character) || character < ' ')
}

/// 逐段校验一个路径分段，镜像 TS 侧的 `assertPathSegment`。
fn assert_path_segment(segment: &str, path: &str) -> HostResult<()> {
    if segment.is_empty() || segment == "." || segment == ".." {
        return Err(violation(format!(
            "path segment {segment:?} does not address an entry: {path}"
        )));
    }
    if has_forbidden_character(segment) {
        return Err(violation(format!(
            "path contains a character the host filesystem rejects: {path}"
        )));
    }
    if segment.ends_with('.') || segment.ends_with(' ') {
        return Err(violation(format!(
            "path segment ends with a dot or space, which Windows silently strips: {path}"
        )));
    }
    if is_windows_reserved_device_name(segment) {
        return Err(violation(format!("path segment is a reserved device name: {path}")));
    }
    // `len()` 是 UTF-8 字节数，与 TS 侧 `UTF8_ENCODER.encode(segment).byteLength` 同义。
    if segment.len() > MAX_PATH_SEGMENT_BYTES {
        return Err(violation(format!(
            "path segment exceeds {MAX_PATH_SEGMENT_BYTES} bytes: {path}"
        )));
    }
    Ok(())
}

/// 读取一个相对存储根的路径；`allow_root` 决定空串（存储根自身）是否合法。
fn read_path(record: &Map<String, Value>, key: &str, allow_root: bool) -> HostResult<String> {
    let path = record
        .get(key)
        .and_then(Value::as_str)
        .ok_or_else(|| violation(format!("{key} must be a string")))?;
    // 与 TS 侧一致按 UTF-16 码元计长，否则同一条路径在两侧的上限判定会不同。
    if path.encode_utf16().count() > MAX_PATH_LENGTH {
        return Err(violation(format!("{key} exceeds {MAX_PATH_LENGTH} characters")));
    }
    if path.is_empty() && !allow_root {
        return Err(violation(format!(
            "{key} must address a concrete entry, not the storage root"
        )));
    }
    if path.is_empty() {
        return Ok(String::new());
    }
    for segment in path.split('/') {
        assert_path_segment(segment, path)?;
    }
    Ok(path.to_string())
}

fn read_uuid(record: &Map<String, Value>, key: &str) -> HostResult<String> {
    record
        .get(key)
        .and_then(Value::as_str)
        .filter(|candidate| is_session_id(candidate))
        .map(str::to_string)
        .ok_or_else(|| violation(format!("{key} must be a UUID string issued by the host")))
}

fn read_chunk(record: &Map<String, Value>) -> HostResult<Vec<u8>> {
    let chunk = record
        .get("chunk")
        .ok_or_else(|| violation("chunk must be a Uint8Array"))?;
    let bytes = decode_bytes(chunk)?;
    if bytes.len() > MAX_FILE_CHUNK_BYTES {
        return Err(violation(format!("chunk exceeds {MAX_FILE_CHUNK_BYTES} bytes")));
    }
    Ok(bytes)
}

/// `length` 下界是 1：零长度的读没有语义，只会让调用方误以为读到了文件尾。
fn read_read_range(record: &Map<String, Value>) -> HostResult<(u64, usize)> {
    let offset = record.get("offset").and_then(Value::as_u64).ok_or_else(|| {
        violation(format!(
            "offset must be an integer >= 0, got {}",
            describe(record.get("offset"))
        ))
    })?;
    let length = record
        .get("length")
        .and_then(Value::as_u64)
        .filter(|length| (1..=MAX_FILE_CHUNK_BYTES as u64).contains(length))
        .ok_or_else(|| {
            violation(format!(
                "length must be an integer within 1..{MAX_FILE_CHUNK_BYTES}, got {}",
                describe(record.get("length"))
            ))
        })?;
    Ok((offset, length as usize))
}

fn read_lock_name(record: &Map<String, Value>) -> HostResult<String> {
    let name = record
        .get("name")
        .and_then(Value::as_str)
        .filter(|name| !name.is_empty())
        .ok_or_else(|| violation("name must be a non-empty string"))?;
    if name.encode_utf16().count() > MAX_PATH_LENGTH {
        return Err(violation(format!("name exceeds {MAX_PATH_LENGTH} characters")));
    }
    Ok(name.to_string())
}

fn read_lock_mode(record: &Map<String, Value>) -> HostResult<LockMode> {
    match record.get("mode").and_then(Value::as_str) {
        Some("shared") => Ok(LockMode::Shared),
        Some("exclusive") => Ok(LockMode::Exclusive),
        _ => Err(violation(format!(
            "mode must be shared or exclusive, got {}",
            describe(record.get("mode"))
        ))),
    }
}

/// 判断一条请求是否属于文件协议。
///
/// 只看 `kind` 字段、不看内容——真正的校验留给 [`parse_file_request`]。
/// 与 TS 侧 `isDesktopHostFileRequestKind` 同源，Electron 的桥接层用的也是它。
pub fn is_file_request(value: &Value) -> bool {
    value
        .get("kind")
        .and_then(Value::as_str)
        .is_some_and(|kind| FILE_REQUEST_KINDS.contains(&kind))
}

fn parse_path_request(kind: &str, session_id: String, record: &Map<String, Value>) -> HostResult<FileRequest> {
    let path = read_path(record, "path", ROOT_ADDRESSABLE_KINDS.contains(&kind))?;
    match kind {
        "file.stat" => Ok(FileRequest::Stat { session_id, path }),
        "file.list" => Ok(FileRequest::List { session_id, path }),
        "file.mkdir" => Ok(FileRequest::Mkdir { session_id, path }),
        "file.rmdir" => Ok(FileRequest::Rmdir { session_id, path }),
        _ => Ok(FileRequest::Remove { session_id, path }),
    }
}

fn parse_write_request(kind: &str, session_id: String, record: &Map<String, Value>) -> HostResult<FileRequest> {
    if kind == "file.writeBegin" {
        return Ok(FileRequest::WriteBegin {
            session_id,
            path: read_path(record, "path", false)?,
        });
    }
    let write_id = read_uuid(record, "writeId")?;
    match kind {
        "file.writeChunk" => Ok(FileRequest::WriteChunk {
            session_id,
            write_id,
            chunk: read_chunk(record)?,
        }),
        "file.writeCommit" => Ok(FileRequest::WriteCommit { session_id, write_id }),
        _ => Ok(FileRequest::WriteAbort { session_id, write_id }),
    }
}

fn parse_lock_request(kind: &str, session_id: String, record: &Map<String, Value>) -> HostResult<FileRequest> {
    if kind == "file.lockAcquire" {
        return Ok(FileRequest::LockAcquire {
            session_id,
            name: read_lock_name(record)?,
            mode: read_lock_mode(record)?,
        });
    }
    Ok(FileRequest::LockRelease {
        session_id,
        lock_id: read_uuid(record, "lockId")?,
    })
}

/// 校验并归一化一条来自 renderer 的文件请求。
///
/// 返回值是**重新构造**出来的 [`FileRequest`]，而不是把原始 JSON 往下传：
/// 契约之外的字段因此不会顺着流进 host。
pub fn parse_file_request(value: &Value) -> HostResult<FileRequest> {
    let record = as_object(value)?;
    let kind = record.get("kind").and_then(Value::as_str).unwrap_or("<missing>");
    if kind == "file.open" {
        return Ok(FileRequest::Open);
    }
    if !FILE_REQUEST_KINDS.contains(&kind) {
        return Err(violation(format!("unknown file request kind {kind}")));
    }
    let session_id = read_uuid(record, "sessionId")?;
    match kind {
        "file.close" => Ok(FileRequest::Close { session_id }),
        "file.stat" | "file.list" | "file.mkdir" | "file.rmdir" | "file.remove" => {
            parse_path_request(kind, session_id, record)
        }
        "file.move" => Ok(FileRequest::Move {
            session_id,
            from_path: read_path(record, "fromPath", false)?,
            to_path: read_path(record, "toPath", false)?,
        }),
        "file.read" => parse_read_request(session_id, record),
        "file.lockAcquire" | "file.lockRelease" => parse_lock_request(kind, session_id, record),
        _ => parse_write_request(kind, session_id, record),
    }
}

fn parse_read_request(session_id: String, record: &Map<String, Value>) -> HostResult<FileRequest> {
    // 路径先于范围校验，与 TS 侧的字段求值顺序一致——两侧对同一条坏请求要报同一个原因。
    let path = read_path(record, "path", false)?;
    let (offset, length) = read_read_range(record)?;
    Ok(FileRequest::Read {
        session_id,
        path,
        offset,
        length,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    const SESSION: &str = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
    const WRITE: &str = "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d";

    fn parse(value: Value) -> HostResult<FileRequest> {
        parse_file_request(&value)
    }

    fn code_of(value: Value) -> ErrorCode {
        parse(value).unwrap_err().code
    }

    /// 分派判据必须与解析器认可的集合同源：漏掉一个 `kind`，那条请求会掉进 SQL 解析器。
    #[test]
    fn recognises_exactly_the_file_protocol_kinds() {
        for kind in FILE_REQUEST_KINDS {
            assert!(is_file_request(&json!({ "kind": kind })), "{kind} should route to files");
        }
        for kind in ["open", "execute", "version", "close", "file.", "file.explode"] {
            assert!(!is_file_request(&json!({ "kind": kind })), "{kind} should not route to files");
        }
        assert!(!is_file_request(&json!({})));
        assert!(!is_file_request(&json!("file.open")));
    }

    #[test]
    fn parses_the_session_lifecycle() {
        assert_eq!(parse(json!({ "kind": "file.open" })).unwrap(), FileRequest::Open);
        assert_eq!(
            parse(json!({ "kind": "file.close", "sessionId": SESSION })).unwrap(),
            FileRequest::Close {
                session_id: SESSION.into()
            }
        );
    }

    /// `file.stat` / `file.list` / `file.mkdir` 可以指向存储根本身，其余必须指向具体条目——
    /// 一条 `file.remove` 打在空路径上会把整个存储根删掉。
    #[test]
    fn allows_the_storage_root_only_where_the_protocol_says_so() {
        for kind in ROOT_ADDRESSABLE_KINDS {
            let request = parse(json!({ "kind": kind, "sessionId": SESSION, "path": "" }));
            assert!(request.is_ok(), "{kind} should address the storage root");
        }
        for kind in ["file.rmdir", "file.remove", "file.writeBegin"] {
            let error = code_of(json!({ "kind": kind, "sessionId": SESSION, "path": "" }));
            assert_eq!(error, ErrorCode::ProtocolViolation, "for {kind}");
        }
    }

    /// AC#4 的第一道闸。逐条对齐 `desktop-host-protocol.ts` 的 `assertPathSegment`。
    #[test]
    fn rejects_every_path_shape_that_could_escape_the_storage_root() {
        let long_segment = "x".repeat(MAX_PATH_SEGMENT_BYTES + 1);
        let long_path = format!("{}/a", "y".repeat(MAX_PATH_LENGTH));
        let rejected = [
            "..",
            "../escape",
            "a/../../b",
            "./a",
            "/leading",
            "trailing/",
            "a//b",
            "C:\\app",
            "a\\b",
            "a<b",
            "a>b",
            "a:b",
            "a\"b",
            "a|b",
            "a?b",
            "a*b",
            "a\u{0}b",
            "a\u{1f}b",
            "ends.",
            "ends ",
            "CON",
            "nul.txt",
            "com1",
            "LPT9.bin",
            &long_segment,
            &long_path,
        ];
        for path in rejected {
            let error = code_of(json!({ "kind": "file.stat", "sessionId": SESSION, "path": path }));
            assert_eq!(error, ErrorCode::ProtocolViolation, "for {path:?}");
        }
    }

    /// 白名单不能顺手把正常名字毙掉：物理名编码器产出的就是这类名字。
    #[test]
    fn keeps_accepting_the_names_the_physical_encoder_produces() {
        let at_limit = "x".repeat(MAX_PATH_SEGMENT_BYTES);
        let accepted = ["a", "a/b/c.txt", "文档/报告.pdf", "CONFIG.json", "com0", ".hidden", &at_limit];
        for path in accepted {
            let request = parse(json!({ "kind": "file.stat", "sessionId": SESSION, "path": path }));
            assert!(request.is_ok(), "{path:?} should be accepted: {:?}", request.err());
        }
    }

    #[test]
    fn parses_move_and_read_requests() {
        assert_eq!(
            parse(json!({ "kind": "file.move", "sessionId": SESSION, "fromPath": "a", "toPath": "b/c" })).unwrap(),
            FileRequest::Move {
                session_id: SESSION.into(),
                from_path: "a".into(),
                to_path: "b/c".into()
            }
        );
        assert_eq!(
            parse(json!({ "kind": "file.read", "sessionId": SESSION, "path": "a", "offset": 0, "length": 8 }))
                .unwrap(),
            FileRequest::Read {
                session_id: SESSION.into(),
                path: "a".into(),
                offset: 0,
                length: 8
            }
        );
    }

    /// 零长度的读没有语义，只会让调用方误以为读到了文件尾。
    #[test]
    fn rejects_read_ranges_outside_the_protocol_window() {
        let ranges = [
            json!({ "offset": -1, "length": 8 }),
            json!({ "offset": 1.5, "length": 8 }),
            json!({ "offset": 0, "length": 0 }),
            json!({ "offset": 0, "length": -1 }),
            json!({ "offset": 0, "length": MAX_FILE_CHUNK_BYTES + 1 }),
            json!({ "offset": 0 }),
            json!({ "length": 8 }),
        ];
        for range in ranges {
            let mut request = json!({ "kind": "file.read", "sessionId": SESSION, "path": "a" });
            let record = request.as_object_mut().expect("literal is an object");
            for (key, value) in range.as_object().expect("literal is an object") {
                record.insert(key.clone(), value.clone());
            }
            assert_eq!(code_of(request.clone()), ErrorCode::ProtocolViolation, "for {range}");
        }
    }

    /// `chunk` 只有 `$u8` 一种合法写法：放行字符串会让一段文本被静默写进用户的文件。
    #[test]
    fn parses_write_chunks_only_from_the_tagged_byte_shape() {
        let request = parse(json!({
            "kind": "file.writeChunk", "sessionId": SESSION, "writeId": WRITE, "chunk": { "$u8": "Zm9v" }
        }))
        .unwrap();
        assert_eq!(
            request,
            FileRequest::WriteChunk {
                session_id: SESSION.into(),
                write_id: WRITE.into(),
                chunk: vec![102, 111, 111]
            }
        );

        for chunk in [json!("Zm9v"), json!([102]), json!(null)] {
            let error = code_of(json!({
                "kind": "file.writeChunk", "sessionId": SESSION, "writeId": WRITE, "chunk": chunk
            }));
            assert_eq!(error, ErrorCode::ProtocolViolation, "for {chunk}");
        }
    }

    #[test]
    fn parses_the_lock_requests() {
        assert_eq!(
            parse(json!({ "kind": "file.lockAcquire", "sessionId": SESSION, "name": "/a", "mode": "shared" }))
                .unwrap(),
            FileRequest::LockAcquire {
                session_id: SESSION.into(),
                name: "/a".into(),
                mode: LockMode::Shared
            }
        );
        assert_eq!(
            parse(json!({ "kind": "file.lockRelease", "sessionId": SESSION, "lockId": WRITE })).unwrap(),
            FileRequest::LockRelease {
                session_id: SESSION.into(),
                lock_id: WRITE.into()
            }
        );
        for mode in [json!("write"), json!(null), json!(1)] {
            let error = code_of(json!({
                "kind": "file.lockAcquire", "sessionId": SESSION, "name": "/a", "mode": mode
            }));
            assert_eq!(error, ErrorCode::ProtocolViolation, "for {mode}");
        }
        let error = code_of(json!({
            "kind": "file.lockAcquire", "sessionId": SESSION, "name": "", "mode": "shared"
        }));
        assert_eq!(error, ErrorCode::ProtocolViolation);
    }

    /// 令牌一律走 host 签发的 UUID 形状，和会话 ID 同一套判据。
    #[test]
    fn rejects_tokens_the_host_could_not_have_issued() {
        for kind in ["file.writeChunk", "file.writeCommit", "file.writeAbort"] {
            let error = code_of(json!({ "kind": kind, "sessionId": SESSION, "writeId": "nope" }));
            assert_eq!(error, ErrorCode::ProtocolViolation, "for {kind}");
        }
        let error = code_of(json!({ "kind": "file.lockRelease", "sessionId": SESSION, "lockId": "nope" }));
        assert_eq!(error, ErrorCode::ProtocolViolation);
        let error = code_of(json!({ "kind": "file.stat", "sessionId": "nope", "path": "a" }));
        assert_eq!(error, ErrorCode::ProtocolViolation);
    }

    /// SQL 的 `kind` 不得被文件解析器接受，反之亦然——两个解析器互不认对方的请求。
    #[test]
    fn rejects_shapes_that_are_not_file_requests() {
        for value in [
            json!([]),
            json!("file.open"),
            json!(null),
            json!({ "kind": "file.explode", "sessionId": SESSION }),
            json!({ "kind": "execute", "sessionId": SESSION, "sql": "SELECT 1" }),
        ] {
            assert_eq!(code_of(value.clone()), ErrorCode::ProtocolViolation, "for {value}");
        }
    }
}
