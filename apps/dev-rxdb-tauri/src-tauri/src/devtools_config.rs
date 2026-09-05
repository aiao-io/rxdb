//! dev 下把 DevTools 的授权档送进**主窗口页面**（US-905 阶段 2）。
//!
//! # 为什么不是 IPC
//!
//! 页内 connector 是 bootstrap 期的一次性全局单例（`getDevToolsConnector()` 首次调用即定档，
//! 之后静默返回同一个实例）。异步 `invoke` 到不了那么早，只能退化成「先按默认档建好、再想
//! 办法改」——那等于让授权有一段真实可用的空窗。
//!
//! Tauri 没有 preload，但有等价物：插件的 `js_init_script` 被收进每个 webview 的初始化脚本，
//! 在**页面脚本之前**同步执行（`tauri::manager::webview` 的 `all_initialization_scripts`），
//! 与 Electron 的 preload 同一个时序等级。Electron 那侧的同一决策见
//! `apps/dev-rxdb-electron/src-electron/devtools-extension.ts` 的启动参数一节。
//!
//! # 变量与 Electron 逐字同名
//!
//! 同一件事在两个宿主上叫两个名字，是文档与肌肉记忆同时出错的来源。少的那一个是
//! `DEV_RXDB_DEVTOOLS_EXTENSION`：它是 Chrome CRX 路径专有的，Tauri 这边没有扩展可加载。
//!
//! # 配错了必须立刻死
//!
//! 与 `selfcheck.rs` 同一条理由：一个打错的变量名若被当成「没开 DevTools」放过去，
//! e2e 上看到的是「面板什么都点不动」，而真正的原因不会在任何地方留下痕迹。
//!
//! 整个模块在 `#[cfg(dev)]` 之下：release 产物里既没有这些变量的读取点，也没有那个全局键。

use serde::Serialize;
use tauri::plugin::{Builder, TauriPlugin};
use tauri::Wry;

/// 总开关；值必须逐字为 `1`。
pub const ENABLE_ENV: &str = "DEV_RXDB_DEVTOOLS";

/// 本次运行的能力档；`none` / `readonly` / `full` 三选一。
pub const CAPABILITY_ENV: &str = "DEV_RXDB_DEVTOOLS_CAPABILITY";

/// 写入开关；只有逐字 `allow` 才开写，省略即只读。
pub const MUTATION_ENV: &str = "DEV_RXDB_DEVTOOLS_MUTATION";

/// 页面上承载这份配置的全局键。
///
/// 与 `setup_rxdb_desktop.ts` 的 `devToolsRuntimeConfig()` 逐字相同，也与 Electron 侧
/// preload 暴露的那个键同名——两个宿主上页内读法因此完全一致。
pub const CONFIG_GLOBAL_KEY: &str = "__aiaoRxdbDevToolsConfig__";

/// 合法能力档；与 `@aiao/rxdb-devtools` 的 `DEVTOOLS_CAPABILITIES` 同集。
const CAPABILITIES: [&str; 3] = ["none", "readonly", "full"];

/// 配置错误的退出码。
///
/// 刻意避开 `selfcheck` 已用掉的 0/1/2/3：读退出码的一方要能分辨「自检配错」与
/// 「DevTools 配错」，两者的排查方向完全不同。
const CONFIG_EXIT_CODE: i32 = 4;

/// 一次开发态 DevTools 运行的授权档。
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DevToolsRuntimeConfig {
    /// 能力档。
    pub capability: String,
    /// 写入开关；`allow` 或 `omit`。
    pub mutation_policy: String,
}

/// 按注入的读取函数解析配置。
///
/// # 规则
///
/// - [`ENABLE_ENV`] 不为逐字 `1` 即未开启（与 Electron 的 `isDevToolsEnabled` 同规则）
/// - 开启后 [`CAPABILITY_ENV`] **必填**，且只接受三个档位之一：默认档意味着「没写就按最宽的来」，
///   而这里的默认值决定的是授权
/// - [`MUTATION_ENV`] 可选，只接受 `allow`；**省略即只读**——写入开关是 owner 为这一次运行
///   打开的，不该由某个默认值代表
///
/// @param read - 环境读取函数；注入而不是直接读进程全局，单测才能并行且穷举。
/// @returns 已校验的配置；未开启时为 `None`。
pub fn plan_from_env<R>(read: R) -> Result<Option<DevToolsRuntimeConfig>, String>
where
    R: Fn(&str) -> Option<String>,
{
    if read(ENABLE_ENV).as_deref() != Some("1") {
        return Ok(None);
    }
    let Some(capability) = read(CAPABILITY_ENV) else {
        return Err(format!("{CAPABILITY_ENV} is required when {ENABLE_ENV}=1"));
    };
    if !CAPABILITIES.contains(&capability.as_str()) {
        return Err(format!("{CAPABILITY_ENV} must be one of none / readonly / full, got {capability:?}"));
    }
    let mutation = read(MUTATION_ENV);
    match mutation.as_deref() {
        None => Ok(Some(config(capability, "omit"))),
        Some("allow") => Ok(Some(config(capability, "allow"))),
        Some(other) => Err(format!("{MUTATION_ENV} only accepts allow; omit it for read-only, got {other:?}")),
    }
}

fn config(capability: String, mutation_policy: &str) -> DevToolsRuntimeConfig {
    DevToolsRuntimeConfig { capability, mutation_policy: mutation_policy.to_string() }
}

/// 读进程环境；配错就地退出。
///
/// 调用点与 `selfcheck::plan_or_exit` 并列，在 `tauri::Builder` **之前**：配置错误绝不能
/// 走到建窗那一步，否则页面已经按默认档把 connector 建好了。
pub fn plan_or_exit() -> Option<DevToolsRuntimeConfig> {
    // 包一层闭包的理由同 `selfcheck::resolve_plan`：函数项会把 `&str` 的生命周期钉死。
    match plan_from_env(|key: &str| std::env::var(key).ok()) {
        Ok(plan) => plan,
        Err(error) => {
            eprintln!("[devtools] {error}");
            std::process::exit(CONFIG_EXIT_CODE);
        }
    }
}

/// 生成注入脚本。
///
/// 值走 `serde_json` 序列化而不是字符串拼接：拼接会把一个校验过的枚举值重新变成一段可以
/// 越界的文本。脚本首行按窗口 label 自守——插件脚本对**每个** webview 都注入，而页面授权
/// 配置没有理由出现在调试窗口里（那里没有 connector，只有面板）。
///
/// @param config - 已校验的授权档。
/// @param main_window_label - 唯一该收到这份配置的窗口。
/// @returns 注入脚本源码。
pub fn init_script(config: &DevToolsRuntimeConfig, main_window_label: &str) -> String {
    // 两个值都由 serde 产出：label 同样进的是 JS 源码，同样不能拼。
    let payload = serde_json::to_string(config).expect("devtools config is plain data");
    let label = serde_json::to_string(main_window_label).expect("window label is a string");
    format!(
        r#"(function () {{
  if (window.__TAURI_INTERNALS__?.metadata?.currentWebview?.label !== {label}) return;
  Object.defineProperty(window, "{CONFIG_GLOBAL_KEY}", {{ value: Object.freeze({payload}) }});
}})();"#
    )
}

/// 把注入脚本装成插件。
///
/// 只在 [`plan_or_exit`] 给出配置时注册：没开 DevTools 时页面上**根本没有**那个全局键，
/// 与 Electron「未开启时 `additionalArguments` 是空数组」同构。页内那侧据此返回空对象，
/// 交回库默认档，而不是自己编一个默认值。
pub fn plugin(config: DevToolsRuntimeConfig, main_window_label: &str) -> TauriPlugin<Wry> {
    Builder::new("rxdb-devtools-config")
        .js_init_script(init_script(&config, main_window_label))
        .build()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn reader(pairs: &[(&str, &str)]) -> impl Fn(&str) -> Option<String> {
        let map: HashMap<String, String> =
            pairs.iter().map(|(key, value)| ((*key).to_string(), (*value).to_string())).collect();
        move |key: &str| map.get(key).cloned()
    }

    #[test]
    fn no_switch_means_no_config_at_all() {
        // 「没开」必须是 `None` 而不是一份默认档：默认档会在页面上留下一个全局键，
        // 而那个键的存在本身就是 connector 判断「本次运行开了 DevTools」的依据。
        assert_eq!(plan_from_env(reader(&[])).unwrap(), None);
        assert_eq!(plan_from_env(reader(&[(CAPABILITY_ENV, "full")])).unwrap(), None);
    }

    #[test]
    fn the_switch_must_be_the_literal_one() {
        for value in ["0", "true", "yes", ""] {
            assert_eq!(plan_from_env(reader(&[(ENABLE_ENV, value)])).unwrap(), None, "{value}");
        }
    }

    #[test]
    fn an_enabled_run_must_name_its_capability() {
        let error = plan_from_env(reader(&[(ENABLE_ENV, "1")])).unwrap_err();
        assert!(error.contains(CAPABILITY_ENV), "{error}");
    }

    #[test]
    fn only_the_three_known_capabilities_pass() {
        for capability in CAPABILITIES {
            let plan = plan_from_env(reader(&[(ENABLE_ENV, "1"), (CAPABILITY_ENV, capability)])).unwrap();
            assert_eq!(plan.unwrap().capability, capability);
        }
        for bogus in ["", "FULL", "readonly ", "admin"] {
            let read = reader(&[(ENABLE_ENV, "1"), (CAPABILITY_ENV, bogus)]);
            assert!(plan_from_env(read).is_err(), "{bogus}");
        }
    }

    #[test]
    fn omitting_the_mutation_switch_means_read_only() {
        let plan = plan_from_env(reader(&[(ENABLE_ENV, "1"), (CAPABILITY_ENV, "full")])).unwrap().unwrap();
        // 省略 = 只读。这是整组授权用例的判别力来源：写入档必须是本次运行被显式打开的。
        assert_eq!(plan.mutation_policy, "omit");
    }

    #[test]
    fn the_mutation_switch_only_accepts_allow() {
        let read = reader(&[(ENABLE_ENV, "1"), (CAPABILITY_ENV, "full"), (MUTATION_ENV, "allow")]);
        assert_eq!(plan_from_env(read).unwrap().unwrap().mutation_policy, "allow");

        for bogus in ["", "1", "true", "omit "] {
            let read = reader(&[(ENABLE_ENV, "1"), (CAPABILITY_ENV, "full"), (MUTATION_ENV, bogus)]);
            // `omit` 本身也不接受：省略与显式写只读是两种输入，后者只可能是照着别处抄来的。
            assert!(plan_from_env(read).is_err(), "{bogus}");
        }
    }

    #[test]
    fn the_init_script_guards_on_the_main_window_and_carries_json_values() {
        let script = init_script(&config("readonly".to_string(), "allow"), "main");

        assert!(script.contains(r#"currentWebview?.label !== "main""#), "{script}");
        assert!(script.contains(r#"{"capability":"readonly","mutationPolicy":"allow"}"#), "{script}");
        // 键名是跨语言契约的另一半（`setup_rxdb_desktop.ts` 的 `devToolsRuntimeConfig`）。
        assert!(script.contains(CONFIG_GLOBAL_KEY), "{script}");
    }
}
