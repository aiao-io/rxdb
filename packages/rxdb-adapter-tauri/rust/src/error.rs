//! 桌面适配器的稳定错误码，与 `packages/rxdb-adapter-sqlite-core/src/desktop/desktop-error.ts` 一一对应。
//!
//! 这些码是**契约的一部分**：renderer 按 `code` 分支处理，消息文本才是可变的。
//! `serde` 的 `snake_case` 重命名保证序列化结果与 TS 侧的字面量逐字相同——
//! 少一个下划线，`isRxDBAdapterDesktopErrorCode` 就会把它判为未知码并转成
//! `protocol_violation`，真正的失败原因随之丢失。

use std::fmt;

/// 与 `RxDBAdapterDesktopErrorCode` 对齐的错误码。
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ErrorCode {
    /// runtime 与 engine 的组合不在能力矩阵内。
    UnsupportedRuntimeEngine,
    /// 逻辑数据库名非法，或试图越出应用作用域。
    InvalidDatabaseName,
    /// 会话已断开后继续使用。
    SessionClosed,
    /// 请求或响应不符合协议形状。
    ProtocolViolation,
    /// 打开数据库失败。
    OpenFailed,
    /// 路径无权限。
    PermissionDenied,
    /// 目标文件不是可用的 SQLite 数据库。
    DatabaseCorrupted,
    /// SQL 本身执行失败（语法、约束等）。
    StatementFailed,
    /// host 自身出错，属于缺陷而非调用方问题。
    HostInternalError,
    /// 另一个连接正持有冲突的锁，重试即可，数据无损。
    DatabaseBusy,
    /// 目标文件或目录不存在（US-505）。
    ///
    /// renderer 侧 `desktop.ts` 把它单独翻成 `name === 'NotFoundError'` 的 `DOMException`，
    /// 而不是 `StorageBackendError`：服务层「不存在即视为空快照」的补偿分支认那个名字，
    /// 换成别的错误会让回滚把本不该删的文件删掉。
    FileNotFound,
    /// 路径非法或试图逃出存储根（US-505）。
    InvalidFilePath,
    /// 磁盘写满或超出配额（US-505）。
    DiskFull,
    /// 写入令牌已失效：会话关闭或已被放弃（US-505）。
    WriteAborted,
}

/// host 侧的错误：一个稳定码加一段面向开发者的描述。
///
/// 它**不实现** `std::error::Error` 的自动转换链：每一处 `?` 都要显式决定错误码，
/// 否则一次 `From` 推导就能把 `database_busy` 悄悄压成 `host_internal_error`。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HostError {
    /// 稳定错误码。
    pub code: ErrorCode,
    /// 不含 `[code]` 前缀的描述，跨 IPC 后由 renderer 侧重新加前缀。
    pub message: String,
}

impl HostError {
    /// 构造一个错误。
    pub fn new(code: ErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }

    /// 协议形状违规的快捷构造。
    pub fn violation(message: impl Into<String>) -> Self {
        Self::new(ErrorCode::ProtocolViolation, message)
    }
}

impl fmt::Display for HostError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "[{:?}] {}", self.code, self.message)
    }
}

/// host 内部统一的结果类型。
pub type HostResult<T> = Result<T, HostError>;

#[cfg(test)]
mod tests {
    use super::*;

    /// 错误码的**线上字面量**必须与 TS 侧的联合类型逐字一致。
    /// 断言序列化结果而不是枚举变体名：改名或加 `#[serde(rename)]` 都会在这里断掉。
    #[test]
    fn error_codes_serialize_to_the_typescript_literals() {
        let expected = [
            (
                ErrorCode::UnsupportedRuntimeEngine,
                "unsupported_runtime_engine",
            ),
            (ErrorCode::InvalidDatabaseName, "invalid_database_name"),
            (ErrorCode::SessionClosed, "session_closed"),
            (ErrorCode::ProtocolViolation, "protocol_violation"),
            (ErrorCode::OpenFailed, "open_failed"),
            (ErrorCode::PermissionDenied, "permission_denied"),
            (ErrorCode::DatabaseCorrupted, "database_corrupted"),
            (ErrorCode::StatementFailed, "statement_failed"),
            (ErrorCode::HostInternalError, "host_internal_error"),
            (ErrorCode::DatabaseBusy, "database_busy"),
            (ErrorCode::FileNotFound, "file_not_found"),
            (ErrorCode::InvalidFilePath, "invalid_file_path"),
            (ErrorCode::DiskFull, "disk_full"),
            (ErrorCode::WriteAborted, "write_aborted"),
        ];
        for (code, literal) in expected {
            assert_eq!(serde_json::to_value(code).unwrap(), literal);
        }
    }
}
