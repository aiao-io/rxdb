// 私有：只有 `run()` 用得到。自检模式没有第二个消费者，导出它等于凭空多一片公开表面。
//
// 桌面宿主本身已经不在这里了——它是 `aiao_rxdb_tauri`（`packages/rxdb-adapter-tauri/rust`），
// 由 `[dependencies]` 的 path 依赖引入。本文件从此只剩「宿主应用要写的接线」，
// 也就是文档里给用户抄的那一份。
mod selfcheck;

use aiao_rxdb_tauri::commands::DesktopHost;
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

// ⚠️ 临时诊断代码（不提交）：renderer 的面包屑出口。
#[tauri::command]
fn dev_probe(msg: String) {
    use std::io::Write;
    eprintln!("[probe] {msg}");
    let _ = std::io::stderr().flush();
    if let Ok(path) = std::env::var("DEV_RXDB_TAURI_PROBE_LOG") {
        if let Ok(mut file) = std::fs::OpenOptions::new().create(true).append(true).open(path) {
            let _ = writeln!(file, "{msg}");
        }
    }
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
///
/// 进程级的退出钩子只是下界。单个窗口关闭或崩溃时也要回收，见下面的
/// [`tauri::WindowEvent::Destroyed`]。
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 环境变量的校验发生在 `tauri::Builder` 之前：配错了就地退出，而不是带着一个「合理的
    // 默认值」把测试数据写进用户真实的应用数据目录。放这里而不是放进 `setup`，是因为
    // 配置里声明的窗口与 `setup` 钩子谁先跑不是可以下注的事，而「配错了绝不建窗」没有例外。
    let plan = selfcheck::plan_or_exit();
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            dev_probe,
            get_platform,
            get_versions,
            check_runtime,
            aiao_rxdb_tauri::commands::rxdb_desktop_request,
            selfcheck::rxdb_selfcheck_report
        ])
        .setup(move |app| {
            // 全程唯一一处根目录分支，且**不是** `unwrap_or`：两边都是被显式选出来的，
            // 没有哪一个是另一个的兜底。自检模式下根目录必须来自测试，来不了就该报错退出，
            // 而不是安静地回落到真实目录——那正是这套 e2e 要抓的逃逸。
            let app_data_dir = match &plan {
                Some(plan) => plan.app_data_dir.clone(),
                None => app.path().app_data_dir()?,
            };
            app.manage(DesktopHost::new(app.handle(), app_data_dir));
            // host 先托管再挂看门狗：看门狗到期时要读 host 的根目录写进报告。
            if let Some(plan) = plan {
                selfcheck::arm(app.handle(), plan);
            }
            Ok(())
        })
        // 单个窗口没了就回收它的会话，不等整个应用退出。
        //
        // 挂 `Destroyed` 而不是 `CloseRequested`：后者可被阻止，也压根不会在窗口崩溃或被
        // 外部关掉时触发。窗口带着一把独占文件锁消失后，另一个窗口的 `file.lockAcquire`
        // 会在条件变量上无限期地等下去——没有超时能解开它，用户看到的就是界面卡死。
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::Destroyed) {
                window
                    .state::<DesktopHost>()
                    .close_window(window.label());
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if matches!(event, tauri::RunEvent::Exit) {
                app.state::<DesktopHost>().close_all();
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
