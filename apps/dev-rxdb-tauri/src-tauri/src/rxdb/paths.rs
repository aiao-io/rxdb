//! 逻辑数据库名 → 应用作用域内的物理路径。
//!
//! 对应 `packages/rxdb-adapter-desktop/src/desktop-storage.ts` 的
//! `assertValidDesktopDatabaseName` 与 Electron 侧 `desktop-sqlite-bridge.ts` 的目录解析。
//!
//! renderer 传来的永远是**逻辑名**，物理根目录由 host 自己决定并且不回传（AC#4）：
//! renderer 拿到物理根目录等于拿到了额外的文件系统情报，而它并不需要这份情报就能工作。

use std::fs;
use std::path::{Path, PathBuf};

use super::error::{ErrorCode, HostError, HostResult};

/// 数据库文件所在的子目录名。
///
/// **不能叫 `databases`**：US-207 踩过这个坑——Chromium 把同名目录当作 WebSQL 的地盘，
/// 会静默删除其中没有登记在案的文件。换个名字就完全绕开了这套回收逻辑。
pub const DATABASE_DIRECTORY: &str = "rxdb-data";

const DATABASE_NAME_MAX_LENGTH: usize = 128;

fn is_leading_character(character: char) -> bool {
    character.is_ascii_alphanumeric()
}

fn is_trailing_character(character: char) -> bool {
    character.is_ascii_alphanumeric() || matches!(character, '.' | '_' | '@' | '-')
}

/// 校验逻辑数据库名，等价于 TS 侧的 `/^[A-Za-z0-9][A-Za-z0-9._@-]*$/` 加 128 字符上限。
///
/// 允许集是白名单而非黑名单：字符集里没有 `/`、`\`、`:`，也不允许以 `.` 开头，
/// 于是 `..`、绝对路径、盘符、`~` 展开、URL scheme 全部落在集合外，不需要逐一枚举攻击形态。
/// `@` 必须在集合内：RxDB 的本地库名恒为 `<dbName>@<RXDB_DB_NAME_SUFFIX>`。
pub fn validate_database_name(database_name: &str) -> HostResult<()> {
    let invalid = |message: String| HostError::new(ErrorCode::InvalidDatabaseName, message);
    if database_name.chars().count() > DATABASE_NAME_MAX_LENGTH {
        return Err(invalid(format!(
            "database name exceeds {DATABASE_NAME_MAX_LENGTH} characters"
        )));
    }
    let mut characters = database_name.chars();
    let leading = characters.next().filter(|character| is_leading_character(*character));
    if leading.is_none() || !characters.all(is_trailing_character) {
        return Err(invalid(format!(
            "database name {database_name:?} must match ^[A-Za-z0-9][A-Za-z0-9._@-]*$; \
             it is an app-scoped logical name, not a path"
        )));
    }
    Ok(())
}

fn directory_error(directory: &Path, error: &std::io::Error) -> HostError {
    let code = if error.kind() == std::io::ErrorKind::PermissionDenied {
        ErrorCode::PermissionDenied
    } else {
        ErrorCode::OpenFailed
    };
    HostError::new(code, format!("failed to prepare {}: {error}", directory.display()))
}

/// 解析出数据库文件的物理路径，必要时创建 `<app_data_dir>/rxdb-data/`。
///
/// **先校验库名再建目录**：顺序反过来的话，一个非法名字也会先把目录建出来，
/// 于是一次注定失败的连接在磁盘上留下痕迹。
///
/// # 参数
/// - `app_data_dir` —— 应用作用域的根目录（Tauri 下是 `app.path().app_data_dir()`，
///   stdio 测试二进制下是 `argv[1]` 指定的临时目录）
/// - `database_name` —— renderer 传来的逻辑名
pub fn resolve_database_path(app_data_dir: &Path, database_name: &str) -> HostResult<PathBuf> {
    validate_database_name(database_name)?;
    let directory = app_data_dir.join(DATABASE_DIRECTORY);
    fs::create_dir_all(&directory).map_err(|error| directory_error(&directory, &error))?;
    Ok(directory.join(database_name))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_the_names_rxdb_actually_generates() {
        let longest = "x".repeat(DATABASE_NAME_MAX_LENGTH);
        let valid = ["app.sqlite3", "a", "todo@rxdb-local.sqlite3", "A1_b-c.d", &longest];
        for name in valid {
            assert!(validate_database_name(name).is_ok(), "{name} should be valid");
        }
    }

    /// 路径穿越、绝对路径、盘符与 URL scheme 全部落在白名单之外——
    /// 这些断言在于证明白名单本身就够，而不是靠逐条黑名单。
    #[test]
    fn rejects_anything_that_could_escape_the_app_scope() {
        let too_long = "x".repeat(DATABASE_NAME_MAX_LENGTH + 1);
        let invalid = [
            "",
            "..",
            "../escape.sqlite3",
            "sub/dir.sqlite3",
            "sub\\dir.sqlite3",
            "C:\\app.sqlite3",
            "~/app.sqlite3",
            ".hidden",
            "-leading-dash",
            "file:app.sqlite3",
            "app.sqlite3\0",
            "名字.sqlite3",
            &too_long,
        ];
        for name in invalid {
            let error = validate_database_name(name).unwrap_err();
            assert_eq!(error.code, ErrorCode::InvalidDatabaseName, "for {name:?}");
        }
    }

    #[test]
    fn creates_the_scoped_directory_and_joins_the_logical_name() {
        let root = std::env::temp_dir().join(format!("rxdb-paths-{}", uuid::Uuid::new_v4()));
        let path = resolve_database_path(&root, "app.sqlite3").unwrap();
        assert_eq!(path, root.join(DATABASE_DIRECTORY).join("app.sqlite3"));
        assert!(root.join(DATABASE_DIRECTORY).is_dir());
        fs::remove_dir_all(&root).unwrap();
    }

    /// 非法名字不得在磁盘上留下任何痕迹。
    #[test]
    fn does_not_create_anything_for_an_invalid_name() {
        let root = std::env::temp_dir().join(format!("rxdb-paths-{}", uuid::Uuid::new_v4()));
        let error = resolve_database_path(&root, "../escape").unwrap_err();
        assert_eq!(error.code, ErrorCode::InvalidDatabaseName);
        assert!(!root.exists());
    }
}
