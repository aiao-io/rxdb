//! 打包产物的自检模式（US-210 AC#1 / AC#9）。
//!
//! # 为什么需要它
//!
//! 「数据在应用重启后仍然存在」这条结论，只有**真的把打包产物拉起两次**才验得到：单测里
//! host 与被测代码同在一个进程，`tauri dev` 下库文件落在开发目录，两者都验不到发布形态。
//! 而 Tauri 的窗口里既没有 WebDriver 也没有 CDP，唯一可靠的观察面只剩下两样东西——
//! **进程退出码**，和**一份写在磁盘上的报告**。
//!
//! 自检模式因此只做三件事：把应用数据根目录换到测试给的临时目录、等 renderer 报一次结果、
//! 把结果写成 JSON 之后带着对应的退出码退出。产品路径本身一行不改——被观察的必须是
//! 真正跑给用户的那条路径，否则测出来的只是自检模式自己。
//!
//! # 开关只有一个真相源
//!
//! [`REPORT_PATH_ENV`] 的**存在**就是开关。不另设 `..._ENABLED` 之类的布尔变量：两个真相源
//! 迟早互相矛盾，而「开关开着但没给报告路径」这种组合没有任何有意义的行为可言。
//!
//! # 配错了必须立刻死，不能猜
//!
//! 变量名少打一个字母、路径写成相对的、目录还没建——这些若被当作「没开自检」放过去，
//! CI 上看到的会是一次 job 超时，而真正的原因（应用写进了**真实的**用户数据目录）不会在
//! 任何地方留下痕迹。所以 [`plan_from_env`] 的每一条 `Err` 都走 `eprintln!` +
//! [`CONFIG_EXIT_CODE`]，且发生在建窗之前。理由与 `bin/rxdb_host_stdio.rs` 里
//! 「缺参数就退出」同源。

use std::env::VarError;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use tauri::{AppHandle, Manager};

use aiao_rxdb_tauri::commands::DesktopHost;

/// 报告 JSON 的绝对路径；它的存在即自检模式的开关。
pub const REPORT_PATH_ENV: &str = "DEV_RXDB_TAURI_SELFCHECK_REPORT";

/// 应用数据根目录覆盖；必须是绝对路径且目录已存在。
pub const APP_DATA_DIR_ENV: &str = "DEV_RXDB_TAURI_APP_DATA_DIR";

/// 报告的结构版本。
///
/// 读报告的一方（`apps/dev-rxdb-tauri-e2e`）先比这个数再读别的字段：字段改了名而读的一方
/// 没跟上时，报出来的是「版本对不上」，而不是一个到处都是 `undefined` 的对象。
pub const REPORT_SCHEMA_VERSION: u32 = 1;

/// 环境变量配错时的退出码。
///
/// 与 [`SelfCheckStatus::exit_code`] 的 0/1/2 都不重叠：读退出码的一方要能分辨
/// 「应用没跑起来」和「应用跑了但结论是失败」。
const CONFIG_EXIT_CODE: i32 = 3;

/// renderer 迟迟不上报时的兜底时限。
///
/// 没有它的话，前端在 bootstrap 里挂死（白屏、JS 异常、WebKitGTK 渲染器起不来）表现为
/// 一次 job 超时——CI 日志上只有一句「the job running exceeded the maximum execution time」。
/// 有了它，同样的故障会变成一份写着 `timedOut` 的报告加一个确定的退出码。
const WATCHDOG_TIMEOUT: Duration = Duration::from_secs(60);

/// 自检结论。
///
/// # 为什么是外部标签的字符串而不是内部标签的枚举
///
/// 这三个值要从 TypeScript 那边原样发过来。若把整个结论建成内部标签枚举（`ok` 分支带
/// `launchCount`、`failed` 分支带 `message`），renderer 少发一个字段就会让 serde
/// 反序列化失败 → `invoke` 被拒 → 没有报告 → 只能等 60s 看门狗。那是比「某个字段是 null」
/// **更差**的诊断信号：前者什么都不说，后者至少说清了是哪一步没给出数据。
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub enum SelfCheckStatus {
    /// 连上了库、写入并读回了计数。
    Ok,
    /// 应用跑起来了，但这条链路上某一步失败了。
    Failed,
    /// renderer 在 [`WATCHDOG_TIMEOUT`] 内一次都没上报。
    TimedOut,
}

impl SelfCheckStatus {
    /// 结论 → 进程退出码。
    fn exit_code(self) -> i32 {
        match self {
            Self::Ok => 0,
            Self::Failed => 1,
            Self::TimedOut => 2,
        }
    }
}

/// renderer 上报的结论，[`rxdb_selfcheck_report`] 的入参。
#[derive(Debug, Clone, PartialEq, Eq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SelfCheckOutcome {
    /// 结论本身。
    pub status: SelfCheckStatus,
    /// 本次启动读回的累计启动次数；只有 [`SelfCheckStatus::Ok`] 时有值。
    #[serde(default)]
    pub launch_count: Option<i64>,
    /// 失败原因；只有失败方向有值。
    #[serde(default)]
    pub message: Option<String>,
}

/// 落盘的报告。
///
/// `appDataDir` 取自**活着的** [`DesktopHost`]，不从环境变量重推——重推的话，
/// 「读到了变量但根本没接到 host 上」这种接线错误会静默通过，而那正是这套断言要抓的东西。
///
/// 物理库文件名**不进**报告：那会绕开 AC#4 划下的边界（物理路径不出协议）。读报告的一方
/// 自己按 `rxdb-data/<dbName>@<suffix>` 拼，拼错了是它自己的问题。
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct SelfCheckReport {
    schema_version: u32,
    status: SelfCheckStatus,
    launch_count: Option<i64>,
    message: Option<String>,
    app_data_dir: String,
    identifier: String,
}

/// 一次自检运行的全部配置，由 [`plan_from_env`] 从环境变量解出。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SelfCheckPlan {
    /// 报告的最终路径。
    pub report_path: PathBuf,
    /// 先写这里再 `rename` 成 [`Self::report_path`]。
    ///
    /// 必须与目标同目录：跨文件系统的 `rename` 会失败，而「先写后改名」的原子性正是为了
    /// 让读报告的一方永远读不到半截 JSON。
    report_temp_path: PathBuf,
    /// 应用数据根目录。
    pub app_data_dir: PathBuf,
}

impl SelfCheckPlan {
    /// 检查两个目录确实存在。
    ///
    /// 与 [`plan_from_env`] 分开是为了让后者保持纯函数：解析规则能在单测里穷举，
    /// 不必为每条规则先在磁盘上摆一个目录出来。
    pub fn ensure_directories(&self) -> Result<(), String> {
        require_directory(APP_DATA_DIR_ENV, &self.app_data_dir)?;
        let Some(parent) = self.report_path.parent() else {
            return Err(format!(
                "{REPORT_PATH_ENV} has no parent directory: {}",
                self.report_path.display()
            ));
        };
        require_directory(REPORT_PATH_ENV, parent)
    }
}

fn require_directory(key: &str, path: &Path) -> Result<(), String> {
    if path.is_dir() {
        return Ok(());
    }
    Err(format!(
        "{key} points at {}, which is not an existing directory",
        path.display()
    ))
}

/// 从环境变量解出自检计划；两个变量都没设时返回 `Ok(None)`（正常启动）。
///
/// `read` 的签名照着 `std::env::var` 抄，于是生产调用就是把它原样传进来，而单测能塞一张表
/// 进去——不必去改**进程全局**的环境变量（那会让并行跑的测试互相打架）。
///
/// # 规则
///
/// - 两个变量必须**成对**出现：只设其一是打错字最常见的形态，静默忽略等于把测试放回真实目录
/// - 值为空串是错误，不是「没设」：一个没展开的 `${DIR}` 不该被当成「用默认值」
/// - 两个路径都必须是绝对路径：相对路径的基准是进程的工作目录，而打包产物的工作目录由谁拉起它决定
pub fn plan_from_env<R>(read: R) -> Result<Option<SelfCheckPlan>, String>
where
    R: Fn(&str) -> Result<String, VarError>,
{
    let report = read_optional(&read, REPORT_PATH_ENV)?;
    let app_data_dir = read_optional(&read, APP_DATA_DIR_ENV)?;
    match (report, app_data_dir) {
        (None, None) => Ok(None),
        (Some(report), Some(app_data_dir)) => Ok(Some(build_plan(&report, &app_data_dir)?)),
        (Some(_), None) => Err(format!(
            "{REPORT_PATH_ENV} is set but {APP_DATA_DIR_ENV} is not; self-check needs both"
        )),
        (None, Some(_)) => Err(format!(
            "{APP_DATA_DIR_ENV} is set but {REPORT_PATH_ENV} is not; self-check needs both"
        )),
    }
}

fn read_optional<R>(read: &R, key: &str) -> Result<Option<String>, String>
where
    R: Fn(&str) -> Result<String, VarError>,
{
    match read(key) {
        Err(VarError::NotPresent) => Ok(None),
        Err(error) => Err(format!("{key} is unreadable: {error}")),
        Ok(raw) if raw.trim().is_empty() => Err(format!(
            "{key} is set to an empty value; unset it entirely to disable self-check"
        )),
        Ok(raw) => Ok(Some(raw)),
    }
}

fn build_plan(report: &str, app_data_dir: &str) -> Result<SelfCheckPlan, String> {
    let report_path = absolute(REPORT_PATH_ENV, report)?;
    let Some(file_name) = report_path.file_name() else {
        return Err(format!("{REPORT_PATH_ENV} must end in a file name, got {report:?}"));
    };
    let report_temp_path = report_path.with_file_name(format!("{}.tmp", file_name.to_string_lossy()));
    Ok(SelfCheckPlan {
        report_path,
        report_temp_path,
        app_data_dir: absolute(APP_DATA_DIR_ENV, app_data_dir)?,
    })
}

fn absolute(key: &str, raw: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(raw);
    if path.is_absolute() {
        return Ok(path);
    }
    Err(format!("{key} must be an absolute path, got {raw:?}"))
}

/// 读环境变量并检查目录；配错就地退出。
///
/// 调用点在 `lib.rs` 的 `run()` 开头，**早于** `tauri::Builder`：Tauri v2 里配置声明的窗口
/// 与 `setup` 钩子谁先跑不是可以下注的事，而「配错了绝不能建窗」这条不允许有例外。
pub fn plan_or_exit() -> Option<SelfCheckPlan> {
    match resolve_plan() {
        Ok(plan) => plan,
        Err(error) => {
            eprintln!("[selfcheck] {error}");
            std::process::exit(CONFIG_EXIT_CODE);
        }
    }
}

fn resolve_plan() -> Result<Option<SelfCheckPlan>, String> {
    // 必须包一层闭包：`std::env::var` 的函数项会把 `&str` 的生命周期钉死在某一个具体值上，
    // 而 `plan_from_env` 要的是对**任意**生命周期都成立的 `Fn`。
    let Some(plan) = plan_from_env(|key: &str| std::env::var(key))? else {
        return Ok(None);
    };
    plan.ensure_directories()?;
    Ok(Some(plan))
}

/// 自检模式下托管在 Tauri state 里的观察者。
///
/// 只在自检模式注册，因此 [`rxdb_selfcheck_report`] 用 `try_state` 取：取不到就是没开自检，
/// 直接返回。这是「可选观察者未注册」，不是回退路径——没有第二条语义等着被兜底。
struct SelfCheckState {
    plan: SelfCheckPlan,
    /// 保证只结算一次：renderer 与看门狗可能同时到达。
    reported: AtomicBool,
}

/// 注册观察者并挂上看门狗。
pub fn arm(app: &AppHandle, plan: SelfCheckPlan) {
    app.manage(SelfCheckState {
        plan,
        reported: AtomicBool::new(false),
    });
    let watched = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(WATCHDOG_TIMEOUT);
        finish(
            &watched,
            SelfCheckOutcome {
                status: SelfCheckStatus::TimedOut,
                launch_count: None,
                message: Some(format!(
                    "the renderer never reported within {}s",
                    WATCHDOG_TIMEOUT.as_secs()
                )),
            },
        );
    });
}

/// 写报告并退出。
///
/// # 为什么是 `app.exit` 而不是 `std::process::exit`
///
/// 前者走 [`tauri::RunEvent::Exit`]，那里挂着 `DesktopHost::close_all()`：WAL checkpoint、
/// 交还文件句柄。绕过它的话，第二次启动验的就成了 SQLite 的崩溃恢复，而不是我们自己的
/// 收尾逻辑（US-210 AC#8）——而崩溃恢复**也能**把数据读回来，于是这条断言会绿着放过一个
/// 真实的缺陷。
fn finish(app: &AppHandle, outcome: SelfCheckOutcome) {
    let Some(state) = app.try_state::<SelfCheckState>() else {
        return;
    };
    if state.reported.swap(true, Ordering::SeqCst) {
        return;
    }
    let host = app.state::<DesktopHost>();
    let exit_code = outcome.status.exit_code();
    let report = SelfCheckReport {
        schema_version: REPORT_SCHEMA_VERSION,
        status: outcome.status,
        launch_count: outcome.launch_count,
        message: outcome.message,
        app_data_dir: host.app_data_dir().to_string_lossy().into_owned(),
        identifier: app.config().identifier.clone(),
    };
    if let Err(error) = write_report(&state.plan, &report) {
        // 没有别的出口了：报告写不出去时，stderr 是唯一还能说话的地方。
        eprintln!("[selfcheck] {error}");
    }
    app.exit(exit_code);
}

fn write_report(plan: &SelfCheckPlan, report: &SelfCheckReport) -> Result<(), String> {
    let body = serde_json::to_vec_pretty(report).map_err(|error| format!("cannot serialize the report: {error}"))?;
    std::fs::write(&plan.report_temp_path, &body)
        .map_err(|error| format!("cannot write {}: {error}", plan.report_temp_path.display()))?;
    std::fs::rename(&plan.report_temp_path, &plan.report_path).map_err(|error| {
        format!(
            "cannot rename {} to {}: {error}",
            plan.report_temp_path.display(),
            plan.report_path.display()
        )
    })
}

/// renderer 上报自检结论。
///
/// renderer **无条件**调用它：没开自检时这里查不到 [`SelfCheckState`]，什么也不做。
/// 让 renderer 去判断「现在是不是自检模式」的话，判断依据只能是另一份从 Rust 传过去的
/// 状态——凭空多出第二个真相源。
///
/// 应用自有的命令不经过 capability 门禁，所以 `capabilities/default.json` 一个字不用改：
/// AC#1 的「未授予额外 shell / 全文件系统权限」仍然是结构性事实，而不是一句需要人去核对的话。
///
/// 写成 `async` 是为了让 `app.exit` 发生在**非主线程**上，与看门狗那条路径一致——
/// 同步命令跑在主线程，在事件循环里请求退出事件循环不是值得下注的事。
#[tauri::command]
pub async fn rxdb_selfcheck_report(outcome: SelfCheckOutcome, app: AppHandle) {
    finish(&app, outcome);
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    /// 造一个假的 `std::env::var`：不碰进程全局环境，因此可以并行跑。
    fn reader(pairs: &[(&str, &str)]) -> impl Fn(&str) -> Result<String, VarError> {
        let table: HashMap<String, String> = pairs
            .iter()
            .map(|(key, value)| ((*key).to_string(), (*value).to_string()))
            .collect();
        move |key| table.get(key).cloned().ok_or(VarError::NotPresent)
    }

    /// 平台无关的绝对路径来源；`temp_dir()` 在三个平台上都是绝对的。
    fn absolute_path(name: &str) -> String {
        std::env::temp_dir().join(name).to_string_lossy().into_owned()
    }

    fn temp_directory(name: &str) -> PathBuf {
        let path = std::env::temp_dir().join(format!("rxdb-selfcheck-{}-{}", name, uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&path).unwrap();
        path
    }

    #[test]
    fn two_absent_variables_mean_a_normal_launch() {
        assert_eq!(plan_from_env(reader(&[])).unwrap(), None);
    }

    /// 成对出现是硬规则：只设其一是变量名打错字最常见的形态。
    #[test]
    fn only_the_report_path_is_an_error() {
        let error = plan_from_env(reader(&[(REPORT_PATH_ENV, &absolute_path("r.json"))])).unwrap_err();
        assert!(error.contains(REPORT_PATH_ENV), "{error}");
        assert!(error.contains(APP_DATA_DIR_ENV), "{error}");
    }

    #[test]
    fn only_the_app_data_dir_is_an_error() {
        let error = plan_from_env(reader(&[(APP_DATA_DIR_ENV, &absolute_path("root"))])).unwrap_err();
        assert!(error.contains(REPORT_PATH_ENV), "{error}");
    }

    /// 空串必须报错而不是当成「没设」：一个没展开的 `${DIR}` 不该悄悄回落到真实用户目录。
    #[test]
    fn an_empty_value_is_an_error_rather_than_absence() {
        let error = plan_from_env(reader(&[
            (REPORT_PATH_ENV, "   "),
            (APP_DATA_DIR_ENV, &absolute_path("root")),
        ]))
        .unwrap_err();
        assert!(error.contains("empty"), "{error}");
    }

    /// 变量读不出来（非 UTF-8）也不能当成没设，理由同上。
    #[test]
    fn an_unreadable_variable_is_an_error_rather_than_absence() {
        let error = plan_from_env(|key: &str| {
            if key == REPORT_PATH_ENV {
                Err(VarError::NotUnicode("\u{fffd}".into()))
            } else {
                Err(VarError::NotPresent)
            }
        })
        .unwrap_err();
        assert!(error.contains("unreadable"), "{error}");
    }

    #[test]
    fn a_relative_report_path_is_rejected() {
        let error = plan_from_env(reader(&[
            (REPORT_PATH_ENV, "report.json"),
            (APP_DATA_DIR_ENV, &absolute_path("root")),
        ]))
        .unwrap_err();
        assert!(error.contains("absolute"), "{error}");
    }

    #[test]
    fn a_relative_app_data_dir_is_rejected() {
        let error = plan_from_env(reader(&[
            (REPORT_PATH_ENV, &absolute_path("report.json")),
            (APP_DATA_DIR_ENV, "tmp/root"),
        ]))
        .unwrap_err();
        assert!(error.contains("absolute"), "{error}");
    }

    /// 临时文件必须与目标同目录，否则跨文件系统的 `rename` 会失败。
    #[test]
    fn the_temp_file_is_a_sibling_of_the_report() {
        let plan = plan_from_env(reader(&[
            (REPORT_PATH_ENV, &absolute_path("launch-1.json")),
            (APP_DATA_DIR_ENV, &absolute_path("root")),
        ]))
        .unwrap()
        .unwrap();
        assert_eq!(plan.report_temp_path.parent(), plan.report_path.parent());
        assert_eq!(
            plan.report_temp_path.file_name().unwrap().to_string_lossy(),
            "launch-1.json.tmp"
        );
    }

    #[test]
    fn missing_directories_are_rejected_before_the_window_opens() {
        let root = temp_directory("dirs");
        let plan = SelfCheckPlan {
            report_path: root.join("report.json"),
            report_temp_path: root.join("report.json.tmp"),
            app_data_dir: root.clone(),
        };
        plan.ensure_directories().unwrap();

        let missing = SelfCheckPlan {
            app_data_dir: root.join("not-created"),
            ..plan.clone()
        };
        assert!(missing.ensure_directories().unwrap_err().contains(APP_DATA_DIR_ENV));

        let unwritable = SelfCheckPlan {
            report_path: root.join("no-such-dir").join("report.json"),
            ..plan
        };
        assert!(unwritable.ensure_directories().unwrap_err().contains(REPORT_PATH_ENV));
        std::fs::remove_dir_all(&root).unwrap();
    }

    /// 三个状态词是跨语言契约的一半，另一半在 `services/selfcheck-reporter.ts` 里。
    /// 改动只会表现为「上报了但 Rust 侧反序列化失败」，编译器帮不上忙，所以钉死它。
    #[test]
    fn status_words_match_the_renderer_contract() {
        let encode = |status: SelfCheckStatus| serde_json::to_value(status).unwrap();
        assert_eq!(encode(SelfCheckStatus::Ok), serde_json::json!("ok"));
        assert_eq!(encode(SelfCheckStatus::Failed), serde_json::json!("failed"));
        assert_eq!(encode(SelfCheckStatus::TimedOut), serde_json::json!("timedOut"));
    }

    /// 退出码互不相同，且都不撞 [`CONFIG_EXIT_CODE`]：读退出码的一方要能分辨四种局面。
    #[test]
    fn exit_codes_are_distinguishable() {
        assert_eq!(SelfCheckStatus::Ok.exit_code(), 0);
        assert_eq!(SelfCheckStatus::Failed.exit_code(), 1);
        assert_eq!(SelfCheckStatus::TimedOut.exit_code(), 2);
        assert_ne!(SelfCheckStatus::TimedOut.exit_code(), CONFIG_EXIT_CODE);
    }

    /// renderer 发来的 JSON 必须能原样解出来；缺省字段走 `None` 而不是解析失败。
    #[test]
    fn the_renderer_payload_deserializes() {
        let ok: SelfCheckOutcome = serde_json::from_value(serde_json::json!({
            "status": "ok",
            "launchCount": 2
        }))
        .unwrap();
        assert_eq!(
            ok,
            SelfCheckOutcome {
                status: SelfCheckStatus::Ok,
                launch_count: Some(2),
                message: None,
            }
        );

        let failed: SelfCheckOutcome = serde_json::from_value(serde_json::json!({
            "status": "failed",
            "message": "boom"
        }))
        .unwrap();
        assert_eq!(failed.status, SelfCheckStatus::Failed);
        assert_eq!(failed.message.as_deref(), Some("boom"));
    }

    /// 报告的线上形状：读它的是 `apps/dev-rxdb-tauri-e2e`，六个键一个都不能少。
    /// 顺带证明「先写临时文件再改名」真的没留下半截文件。
    #[test]
    fn the_report_lands_atomically_with_the_shape_the_suite_reads() {
        let root = temp_directory("report");
        let plan = SelfCheckPlan {
            report_path: root.join("launch-1.json"),
            report_temp_path: root.join("launch-1.json.tmp"),
            app_data_dir: root.join("data"),
        };
        write_report(
            &plan,
            &SelfCheckReport {
                schema_version: REPORT_SCHEMA_VERSION,
                status: SelfCheckStatus::Ok,
                launch_count: Some(2),
                message: None,
                app_data_dir: "/tmp/root".to_string(),
                identifier: "io.aiao.dev-rxdb-tauri".to_string(),
            },
        )
        .unwrap();

        let written: serde_json::Value =
            serde_json::from_slice(&std::fs::read(&plan.report_path).unwrap()).unwrap();
        assert_eq!(
            written,
            serde_json::json!({
                "schemaVersion": REPORT_SCHEMA_VERSION,
                "status": "ok",
                "launchCount": 2,
                "message": null,
                "appDataDir": "/tmp/root",
                "identifier": "io.aiao.dev-rxdb-tauri"
            })
        );
        assert!(!plan.report_temp_path.exists(), "临时文件没有被改名，而是留在了原地");
        std::fs::remove_dir_all(&root).unwrap();
    }
}
