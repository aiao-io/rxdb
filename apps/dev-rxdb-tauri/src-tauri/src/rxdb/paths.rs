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

/// 文件内容所在的子目录名（US-505）。
///
/// 与 Electron 侧 `desktop-file-bridge.ts` 的 `DESKTOP_STORAGE_DIRECTORY` 逐字相同：
/// 两个桌面宿主写出的数据目录布局必须一致，否则同一份备份换个宿主恢复就找不到文件。
/// 它与 [`DATABASE_DIRECTORY`] 并列在应用数据目录下——同一个备份域，正是 US-505 的全部要点。
pub const STORAGE_DIRECTORY: &str = "rxdb-files";

const DATABASE_NAME_MAX_LENGTH: usize = 128;

fn is_leading_character(character: char) -> bool {
    character.is_ascii_alphanumeric()
}

fn is_trailing_character(character: char) -> bool {
    character.is_ascii_alphanumeric() || matches!(character, '.' | '_' | '@' | '-')
}

/// Windows 保留设备名——白名单唯一挡不住的一类名字。
///
/// `CON`、`NUL`、`COM1` 这些在 Win32 命名空间里指向字符设备而不是文件，`CreateFile` 会连上设备本身。
/// 它们全都匹配 `^[A-Za-z0-9][A-Za-z0-9._@-]*$`，于是在 Windows 上失败点被推迟到 `open`，
/// 报出来的是 `open_failed` 这类含糊错误——而不是调用方能理解、且三平台一致的 `invalid_database_name`。
///
/// 匹配的是**第一个 `.` 之前**的部分：`CON.sqlite3` 与 `CON` 在 Windows 上是同一个设备。
/// 大小写不敏感。`COM0`/`LPT0` 不在其列（Windows 只保留 1–9），上标数字变体（`COM¹`）
/// 本就落在 ASCII 白名单之外。与 TS 侧 `desktop-storage.ts` 的
/// `WINDOWS_RESERVED_DEVICE_NAME_PATTERN`、`desktop-host-protocol.ts` 的
/// `RESERVED_SEGMENT_BASE_NAMES` 同义。
///
/// 入参既可以是逻辑库名，也可以是一个文件路径分段：两处的判据完全相同，
/// 各写一份只会让它们在下一次修订时分叉。
pub fn is_windows_reserved_device_name(name: &str) -> bool {
    let stem = name.split('.').next().unwrap_or_default().as_bytes();
    if [&b"CON"[..], b"PRN", b"AUX", b"NUL"].iter().any(|reserved| stem.eq_ignore_ascii_case(reserved)) {
        return true;
    }
    stem.len() == 4
        && matches!(stem[3], b'1'..=b'9')
        && (stem[..3].eq_ignore_ascii_case(b"COM") || stem[..3].eq_ignore_ascii_case(b"LPT"))
}

/// 校验逻辑数据库名，等价于 TS 侧的 `/^[A-Za-z0-9][A-Za-z0-9._@-]*$/` 加 128 字符上限。
///
/// 允许集是白名单而非黑名单：字符集里没有 `/`、`\`、`:`，也不允许以 `.` 开头，
/// 于是 `..`、绝对路径、盘符、`~` 展开、URL scheme 全部落在集合外，不需要逐一枚举攻击形态。
/// `@` 必须在集合内：RxDB 的本地库名恒为 `<dbName>@<RXDB_DB_NAME_SUFFIX>`。
/// [`is_windows_reserved_device_name`] 是唯一必须补的黑名单——那类名字合法却不指向文件。
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
    if is_windows_reserved_device_name(database_name) {
        return Err(invalid(format!(
            "database name {database_name:?} is a reserved Windows device name; \
             it would open a character device instead of a file"
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

    /// 这些名字过得了字符白名单，却在 Windows 上指向字符设备。三平台统一在校验期拒绝，
    /// 免得同一个名字在 macOS 上建出文件、在 Windows 上连上串口。
    #[test]
    fn rejects_windows_reserved_device_names_on_every_platform() {
        let reserved = ["CON", "con", "NUL", "PRN", "AUX", "COM1", "lpt9", "CON.sqlite3", "nul.db"];
        for name in reserved {
            let error = validate_database_name(name).unwrap_err();
            assert_eq!(error.code, ErrorCode::InvalidDatabaseName, "for {name:?}");
        }
    }

    /// 黑名单只认设备名本身，不能顺手把以它开头的正常名字一起毙掉。
    #[test]
    fn keeps_accepting_names_that_merely_start_like_a_device() {
        let valid = ["CONFIG.sqlite3", "console", "COM0", "LPT0", "COM10", "nullable.db", "auxiliary"];
        for name in valid {
            assert!(validate_database_name(name).is_ok(), "{name} should be valid");
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

    /// 目录名是**跨宿主契约**：Electron 与 Tauri 写出的应用数据目录布局必须一致，
    /// 否则同一份备份换个宿主恢复就找不到文件。另一半在
    /// `apps/dev-rxdb-electron/src-electron/desktop-file-bridge.ts`。
    #[test]
    fn storage_directory_matches_the_electron_layout() {
        assert_eq!(STORAGE_DIRECTORY, "rxdb-files");
        assert_ne!(STORAGE_DIRECTORY, DATABASE_DIRECTORY);
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
