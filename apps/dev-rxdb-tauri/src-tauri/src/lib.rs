pub mod rxdb;

use tauri::Manager;

#[derive(serde::Serialize)]
struct RuntimeHealth {
    status: &'static str,
}

/// TAURI-02：这里原本是 `HashMap<String, String>`。
///
/// 一个开放的字符串映射不承诺任何键，前端于是把它读成
/// `{ node?, chrome?, tauri? }` —— 三个字段里两个永远不存在，
/// 而两端都不会因此报错。换成结构体后，契约由类型本身写死：
/// 想加字段就得同时改 Rust 和 TS。
#[derive(serde::Serialize)]
struct AppVersions {
    tauri: &'static str,
}

#[tauri::command]
fn get_platform() -> String {
    std::env::consts::OS.to_string()
}

#[tauri::command]
fn get_versions() -> AppVersions {
    AppVersions {
        tauri: tauri::VERSION,
    }
}

#[tauri::command]
fn check_runtime() -> RuntimeHealth {
    RuntimeHealth { status: "ready" }
}

/// US-210：退出前必须显式关掉全部会话。
///
/// 用 `build(...).run(closure)` 而不是 `run(context)`，就是为了拿到 [`tauri::RunEvent::Exit`]
/// 这个钩子。放任进程退出的话，SQLite 的文件句柄与 `-wal` / `-shm` 会活到最后一刻，
/// 库文件在应用关闭后仍被占用——AC#8 要的「关掉应用后能重命名库文件」就不成立。
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_platform,
            get_versions,
            check_runtime,
            rxdb::commands::rxdb_desktop_request
        ])
        .setup(|app| {
            app.manage(rxdb::commands::DesktopHost::new(app.handle())?);
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if matches!(event, tauri::RunEvent::Exit) {
                app.state::<rxdb::commands::DesktopHost>().close_all();
            }
        });
}

#[cfg(test)]
mod tests {
    use super::*;

    /// TAURI-FRESH-01：Rust 侧此前**一条测试都没有**，`cargo test` 也不在任何 Nx target 里。
    /// 这三条覆盖的是前端真正依赖的三个 IPC 契约。
    #[test]
    fn get_platform_returns_a_non_empty_target_os() {
        assert!(!get_platform().is_empty());
        assert_eq!(get_platform(), std::env::consts::OS);
    }

    /// TAURI-02：把 `get_versions` 的**线上形状**钉住 —— 前端解析器
    /// (`tauri-contracts.ts`) 断言的就是这个 JSON，两端必须一起改才能改动它。
    #[test]
    fn get_versions_serializes_to_the_single_key_the_frontend_parses() {
        let versions = get_versions();
        assert_eq!(versions.tauri, tauri::VERSION);
        assert_eq!(
            serde_json::to_value(&versions).unwrap(),
            serde_json::json!({ "tauri": tauri::VERSION })
        );
    }

    #[test]
    fn check_runtime_reports_ready() {
        assert_eq!(check_runtime().status, "ready");
    }
}
