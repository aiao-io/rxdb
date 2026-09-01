// 私有：只有 `run()` 用得到。自检模式没有第二个消费者，导出它等于凭空多一片公开表面。
//
// 桌面宿主本身已经不在这里了——它是 `aiao_rxdb_tauri`（`packages/rxdb-adapter-tauri/rust`），
// 由 `[dependencies]` 的 path 依赖引入。本文件从此只剩「宿主应用要写的接线」，
// 也就是文档里给用户抄的那一份。
mod selfcheck;

use aiao_rxdb_tauri::commands::DesktopHost;
use tauri::Manager;
// `Emitter` 只在 `#[cfg(dev)]` 的 `devtools_message` 里用（`target.emit`）；
// 不 cfg 掉的话，release（custom-protocol）构建会报 unused import。
#[cfg(dev)]
use tauri::Emitter;

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

/// US-905 阶段 1：定向中继的窗口 label 与路由判定（AC#3）。
///
/// 纯函数，不碰 Tauri 状态——「谁 → 谁」的规则可以被直接测到，而不必起一个真实窗口。
#[cfg(dev)]
mod devtools_routing {
    /// 调试窗口的 label。
    pub const DEVTOOLS_LABEL: &str = "rxdb-devtools";
    /// 主窗口（被检查页）的 label。
    pub const MAIN_LABEL: &str = "main";

    /// 由发起窗口 label 决定目标 label。
    ///
    /// # 为什么拒绝未知 label 而不是默认转发到 main
    ///
    /// 默认转发到 `main` 意味着「任何能 `invoke` 的窗口都能向被检查页注入消息」——将来新增的、
    /// 忘了排除在 capability 之外的窗口会静默获得这条通道。白名单两枚已知 label 而不是
    /// 黑名单其余，是「无 fallback 兜底」在身份这一侧的同一写法（AC#3：错误身份在 Rust 侧拒绝）。
    pub fn target_label_of(sender: &str) -> Result<&'static str, String> {
        match sender {
            DEVTOOLS_LABEL => Ok(MAIN_LABEL),
            MAIN_LABEL => Ok(DEVTOOLS_LABEL),
            other => Err(format!("unexpected sender window label: {other}")),
        }
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        /// 两个已知 label 之间双向路由。
        #[test]
        fn routes_between_the_two_known_labels() {
            assert_eq!(target_label_of(DEVTOOLS_LABEL).unwrap(), MAIN_LABEL);
            assert_eq!(target_label_of(MAIN_LABEL).unwrap(), DEVTOOLS_LABEL);
        }

        /// AC#3：非两个已知 label 之一的发起窗口一律拒绝，不得默认转发到 main。
        #[test]
        fn rejects_an_unknown_sender_label() {
            assert!(target_label_of("settings").is_err());
            assert!(target_label_of("").is_err());
        }
    }
}

/// US-905 阶段 1：dev 模式创建 `rxdb-devtools` 调试窗口。
///
/// `#[cfg(dev)]` 是 tauri-build 在 `tauri dev` / 非 release 的 `cargo build` 下设置的：
/// release 构建里这段代码根本不进产物，`rxdb-devtools` label 的窗口、入口与 command 随之消失，
/// 满足「release 无入口、bootstrap、专用 command」。
#[cfg(dev)]
fn open_devtools_window(app: &tauri::AppHandle) -> tauri::Result<()> {
    tauri::WebviewWindowBuilder::new(
        app,
        devtools_routing::DEVTOOLS_LABEL,
        tauri::WebviewUrl::App("devtools/devtools.html".into()),
    )
    .title("RxDB DevTools")
    .build()?;
    Ok(())
}

/// US-905 阶段 1：面板 ↔ connector 之间的定向消息中继。
///
/// 只做**路由**、不做授权：按发起窗口的 label 决定转发到哪一边（`rxdb-devtools` ↔ `main`），
/// payload 原样透传、不做解释。授权（session / capability / mutation policy）是 connector 与
/// provider 的职责，transport 不代劳——「session 不是授权 secret」。
///
/// 定向 `emit` 而不是广播：业务数据（实体、事件、文件路径）只发往目标窗口，
/// 不落到任何不该看到它的 WebView 上。
///
/// `#[cfg(dev)]`（US-905 AC#1 硬阻塞 B）：命令与 `generate_handler!` 里的对应臂一起在 release
/// 构建中消失——release 产物不含只服务 `rxdb-devtools` 的专用 command。这是**编译期隔离**，
/// 不是「release 无窗口所以恒 not found」的运行时兜底。
#[cfg(dev)]
#[tauri::command]
fn devtools_message(window: tauri::Window, app: tauri::AppHandle, payload: String) -> Result<(), String> {
    let target_label = devtools_routing::target_label_of(window.label())?;
    let target = app
        .get_webview_window(target_label)
        .ok_or_else(|| format!("{target_label} window not found"))?;
    target.emit("devtools:message", &payload).map_err(|error| error.to_string())
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
            get_platform,
            get_versions,
            check_runtime,
            aiao_rxdb_tauri::commands::rxdb_desktop_request,
            selfcheck::rxdb_selfcheck_report,
            selfcheck::rxdb_selfcheck_probe_base_url,
            // US-905 AC#1：`devtools_message` 命令与它在 `generate_handler!` 里的臂一起
            // 只在 dev 构建中注册（`#[cfg(dev)]` 直接作用于生成出的 match 臂）。
            #[cfg(dev)]
            devtools_message
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
            // US-905：dev 模式开调试窗口；release 无此入口（#[cfg(dev)] 两侧一起消失）。
            #[cfg(dev)]
            open_devtools_window(app.handle())?;
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
