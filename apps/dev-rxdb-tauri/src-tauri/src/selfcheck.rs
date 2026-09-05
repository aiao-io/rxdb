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

/// webview 能力探针要打的本地 HTTP 服务根地址（US-505 AC#6）；**可选**。
///
/// 不设它就是不跑 webview 探针 —— 那条探针要发真实跨源请求，而正常启动时没有服务在那头。
/// 它**不参与**上面两个变量的成对规则：它是自检模式内部的一个开关，而不是第三个必需项。
/// 但反过来不成立，见 [`plan_from_env`]。
pub const PROBE_BASE_URL_ENV: &str = "DEV_RXDB_TAURI_PROBE_BASE_URL";

/// 是否跑 DevTools 双 WebView 握手探针（US-905 阶段 1 AC#2）；**可选**，存在即开启。
///
/// # 为什么必须是显式开关而不是「有调试窗口就跑」
///
/// 探针要**等**调试窗口把握手发过来，等不到就得耗满预算。release 产物里根本没有调试窗口
/// （`#[cfg(dev)]`），若默认开启，每一次 `desktop-smoke` 都会白等一个预算；
/// 而 renderer 侧又没有合法途径去问「这个构建有没有调试窗口」——问的话要么多给一条
/// 窗口枚举权限（AC#1 把调试窗口的 capability 钉死在 `['core:event:default']`），
/// 要么去 catch 一个 command-not-found，那是拿异常当控制流。
///
/// 与 [`PROBE_BASE_URL_ENV`] 同规则：没开自检却设了它，是配置错误而不是「顺带开一下」。
pub const DEVTOOLS_PROBE_ENV: &str = "DEV_RXDB_TAURI_DEVTOOLS_PROBE";

/// 报告的结构版本。
///
/// 读报告的一方（`apps/dev-rxdb-tauri-e2e`）先比这个数再读别的字段：字段改了名而读的一方
/// 没跟上时，报出来的是「版本对不上」，而不是一个到处都是 `undefined` 的对象。
///
/// v2 起多了 [`StorageProbe`]（US-505 AC#1 / AC#3）；v3 起多了 [`DevToolsProbe`] 与
/// `windowLabels`（US-905 阶段 1）；v4 把 `devtools.sessionId` 换成 `sessionIds`（AC#4 要看轮换）；v5 加 `devtools.relayRejected`（AC#3）；v6 加 `devtools.native`（阶段 2 的 wire 结论）；v7 加它的写入两条（`createDirectory` / `deleteEntry`）。
pub const REPORT_SCHEMA_VERSION: u32 = 7;

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

/// renderer 跑完文件存储探针之后回报的事实（US-505 AC#1 / AC#3）。
///
/// # 为什么光有 `launch_count` 不够
///
/// 那个数字整个活在 SQLite 里。一个把**文件内容**写进 webview 存储、写进内存、
/// 甚至每次启动重新生成的实现，重启断言照样从 1 数到 2 —— 而 US-505 要证的恰恰是
/// 「内容落在应用数据目录的原生文件里，与 SQLite 元数据同属一个备份域」。
/// 有了摘要与 `existed_before`，重启（AC#1）与整目录拷贝（AC#3）两条路径上才拿得到
/// 「同一份内容还在、字节没变」的证据。
///
/// 物理路径**不进**报告（AC#4：物理路径不出协议），沿用库文件名的做法 ——
/// 读报告的一方自己去 `rxdb-files/` 下找，找错了是它自己的问题。
#[derive(Debug, Clone, PartialEq, Eq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageProbe {
    /// 探针文件内容的 sha256，小写十六进制。
    pub digest: String,
    /// 内容字节数。
    pub byte_length: u64,
    /// 本次启动**之前**该文件是否已存在。
    pub existed_before: bool,
}

/// renderer 跑完 webview 能力探针之后回报的事实（US-505 AC#6）。
///
/// # 为什么这些字段值得进协议
///
/// `download()` 与 `fetch()` 是**不经 host** 的两条 renderer 侧路径：它们的行为由那家
/// webview 自己决定，Rust 侧一个字节也看不到。而 Tauri 的 webview 是三家的矩阵
/// （WebView2 / WKWebView / WebKitGTK），"和 Chromium 一样"是假设不是事实 ——
/// 所以把每家上的真实取值搬进报告，由 e2e 侧的平台期望表冻结。
///
/// 探针**绝不触发原生保存对话框**：那会让进程停在一个没人去点的模态框上，直到 60s
/// 看门狗把它判成超时 —— 与「renderer 挂死」这种真实缺陷的失败形态一模一样。
/// 因此 `download()` 这一半锁的是**分支判据**（`save_file_picker` 决定服务走哪条路）
/// 与各分支的结构前提，而不是保存动作本身。
#[derive(Debug, Clone, PartialEq, Eq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WebviewProbe {
    /// 从 UA 认出的引擎：`chromium` / `webkit` / `gecko` / `unknown`。
    ///
    /// WKWebView 与 WebKitGTK 的 UA 都自称 WebKit，靠它分不开 —— 分开靠的是读报告那一方
    /// 自己的 `process.platform`，这里只负责说清"是哪一族"。
    pub engine: String,
    /// renderer 的 origin，例如 `tauri://localhost`（Windows 上是 `http://tauri.localhost`）。
    pub origin: String,
    /// `navigator.onLine`；为 false 时 `fetch()` 会在发请求之前就抛 `StorageOfflineError`。
    pub online: bool,
    /// `window.showSaveFilePicker` 是否存在 —— 它**单独**决定 `download()` 走哪条分支。
    pub save_file_picker: bool,
    /// `<a download>` 属性是否被实现（`save_file_picker` 为 false 时用的就是这条）。
    pub anchor_download: bool,
    /// `URL.createObjectURL` 是否交出一个 `blob:` URL。
    pub object_url: bool,
    /// 同源 `storage.fetch()` 缓存下来的内容 sha256。
    ///
    /// 没有"失败时为空"这一档：同源缓存是 AC#6 里 `fetch()` 那一半的**正向**判据，
    /// 它失败就该整份自检判 `failed` 并带上原因，而不是报一个 `ok` 里藏着一个 null。
    pub same_origin_digest: String,
    /// 同源 `storage.fetch()` 缓存下来的字节数。
    pub same_origin_byte_length: u64,
    /// 跨源（服务端**带** `Access-Control-Allow-Origin`）`storage.fetch()` 的判别结果：
    /// 成功是 `"ok"`，否则是错误的 `name`。
    pub cross_origin_allowed: String,
    /// 跨源（服务端**不带** ACAO）的同一判据。
    ///
    /// 与上一条取值相同，说明拦住它的是 CSP 的 `connect-src` 而不是 CORS —— 这正是
    /// 本 demo 的真实配置（`tauri.conf.json` 的 `connect-src 'self' ipc: http://ipc.localhost`），
    /// 也是"服务端加 ACAO 并不能解开它"这条事实的载体。
    pub cross_origin_denied: String,
}

/// DevTools 双 WebView 探针的结果（US-905 阶段 1 AC#2）。
///
/// # 为什么这条探针只能由主 WebView 来做
///
/// AC#2 的判据是「真实主窗口与调试窗口已打开」并完成往返。Rust 侧看得见两个窗口存在
/// （见 [`SelfCheckReport::window_labels`]），但看不见握手——`devtools_message` 是**原样透传**的
/// 中继，按设计不解释 payload，把它改成会解析协议的东西，等于让传输层参与协议决策，
/// 而那正是 US-905 技术约束明确禁止的。
///
/// 所以握手证据取自主 WebView：它订阅与 connector **同一条** `devtools:message` 事件，
/// 记录调试窗口发过来的 v2 帧类型。收到 `HANDSHAKE_ACK` 就同时证明了四件事——调试窗口真的
/// 建起来了、它加载的是共享面板、面板协商到了 v2、而且它的帧经真实 Rust 中继到达了主窗口。
/// 这比「窗口存在」强得多，也不需要 WebDriver（`tauri-driver` 在 macOS 上根本不存在）。
#[derive(Debug, Clone, PartialEq, Eq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DevToolsProbe {
    /// 调试窗口发过来的 v2 帧类型，按首次出现排序、已去重。
    pub panel_frame_types: Vec<String>,
    /// 每一轮握手读到的 session id，按发生顺序。
    ///
    /// # 为什么是列表而不是单值
    ///
    /// AC#4 的判据是「以同 label 重开的调试窗口拿到**新** UUID v4 session，并拒绝全部旧身份」。
    /// 只报最后一个的话，「换了」与「一直是同一个」在报告里长得完全一样——而后者正是这条 AC
    /// 要抓的缺陷（Electron 侧 US-904 AC#51 上就真的发生过：光关 session 而不换端点，
    /// 下一个面板会拿到**同一个** session id）。
    pub session_ids: Vec<String>,
    /// 是否在预算内看到了 `HANDSHAKE_ACK`。
    pub handshake_completed: bool,
    /// 冒名窗口活着期间被中继按 label 拒掉的帧数（AC#3）。
    ///
    /// 计数而不是布尔：`0` 说明那扇窗根本没敲到门，这条用例什么都没验到——
    /// 与「敲了但被拒」是两个结论。
    pub relay_rejected: u64,
    /// 调试窗口里的 wire 驱动跑出来的结论（US-905 阶段 2）；没装驱动时为 `None`。
    pub native: Option<DevToolsNativeProbe>,
}

/// 真实双窗口链路上的 wire 结论（US-905 阶段 2，AC#9 / #12 / #13）。
///
/// # 为什么这些字段都是**错误码**而不是数据
///
/// 判据要的是「这条操作在真实链路上答了什么」，而不是内容本身。回显路径、字节或 SQL 绑定值
/// 会把一份诊断报告变成一条泄漏通道（AC#13 明写响应不得含这些），而错误码是稳定、可断言、
/// 且本来就要跨端一致的东西。
#[derive(Debug, Clone, PartialEq, Eq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DevToolsNativeProbe {
    /// 驱动是否等到了握手；`false` 时其余字段无意义。
    pub session_seen: bool,
    /// `files.list` 的结果码；接上真实 native host 后应为 `ok`。
    #[serde(default)]
    pub files_list: Option<String>,
    /// `files.list` 读到的条目数；`-1` 表示这次没读到结果。
    #[serde(default)]
    pub files_entry_count: Option<i64>,
    /// 强制 `settings.export` 的结果码；恒为 `export_unsupported`（AC#12）。
    #[serde(default)]
    pub settings_export: Option<String>,
    /// 未声明的 `settings.clear` 的结果码；恒为 `provider_unsupported`（AC#12）。
    #[serde(default)]
    pub settings_clear: Option<String>,
    /// 伪造 session 的同一条请求的结果码；必须被拒（AC#13）。
    #[serde(default)]
    pub forged_session: Option<String>,
    /// 新建目录的结果码（AC#10 / #13 的写入半边）。
    ///
    /// # 判别力不在这个码上
    ///
    /// 没 opt-in 写入时它是 `provider_unsupported`，与「这个操作压根没声明」**同一个码**
    /// （共享包的 `authorizeOperation` 刻意不区分，免得对端据此枚举 provider 目录）。
    /// 所以只读那一跑的判据是**磁盘上一个目录都没落**，由 e2e 自己去看。
    #[serde(default)]
    pub create_directory: Option<String>,
    /// 删除的结果码；只读档下同样是 `provider_unsupported`。
    #[serde(default)]
    pub delete_entry: Option<String>,
    /// 驱动自身失败时的原因；正常跑完为 `None`。
    #[serde(default)]
    pub failure: Option<String>,
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
    /// 文件存储探针的结果；只有 [`SelfCheckStatus::Ok`] 时有值。
    #[serde(default)]
    pub storage: Option<StorageProbe>,
    /// webview 能力探针的结果；只有设了 [`PROBE_BASE_URL_ENV`] 且跑成功时有值。
    #[serde(default)]
    pub webview: Option<WebviewProbe>,
    /// DevTools 双 WebView 探针的结果；release 构建里没有调试窗口，因此恒为 `None`。
    #[serde(default)]
    pub devtools: Option<DevToolsProbe>,
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
    storage: Option<StorageProbe>,
    webview: Option<WebviewProbe>,
    devtools: Option<DevToolsProbe>,
    /// 结算时刻**实际存在**的窗口 label，已排序（US-905 AC#1）。
    ///
    /// 由 Rust 侧直接枚举，不听 renderer 的：AC#1 要的是「dev 只创建一个 `rxdb-devtools`
    /// 窗口」「release 没有这个入口」，而窗口是不是真的建起来了，只有主进程说了算。
    /// 让 renderer 上报的话，`#[cfg(dev)]` 那道编译期隔离就退化成了一句自述。
    window_labels: Vec<String>,
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
    /// webview 探针要打的服务根地址；`None` 表示这次不跑那条探针。
    pub probe_base_url: Option<String>,
    /// 这次要不要跑 DevTools 握手探针，见 [`DEVTOOLS_PROBE_ENV`]。
    pub devtools_probe: bool,
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
/// - [`PROBE_BASE_URL_ENV`] 是可选的**第三个**变量，只在自检模式下有意义：没开自检却设了它，
///   只可能是打错了变量名或漏设了另外两个 —— 静默忽略等于让 e2e 去等一份永远不会出现的
///   `webview` 字段，而报告本身写着 `ok`
pub fn plan_from_env<R>(read: R) -> Result<Option<SelfCheckPlan>, String>
where
    R: Fn(&str) -> Result<String, VarError>,
{
    let report = read_optional(&read, REPORT_PATH_ENV)?;
    let app_data_dir = read_optional(&read, APP_DATA_DIR_ENV)?;
    let probe_base_url = read_optional(&read, PROBE_BASE_URL_ENV)?;
    let devtools_probe = read_optional(&read, DEVTOOLS_PROBE_ENV)?.is_some();
    match (report, app_data_dir) {
        (None, None) if probe_base_url.is_none() && !devtools_probe => Ok(None),
        (None, None) if devtools_probe => Err(format!(
            "{DEVTOOLS_PROBE_ENV} is set but self-check is off; it needs {REPORT_PATH_ENV} and {APP_DATA_DIR_ENV}"
        )),
        (None, None) => Err(format!(
            "{PROBE_BASE_URL_ENV} is set but self-check is off; it needs {REPORT_PATH_ENV} and {APP_DATA_DIR_ENV}"
        )),
        (Some(report), Some(app_data_dir)) => {
            Ok(Some(build_plan(&report, &app_data_dir, probe_base_url, devtools_probe)?))
        }
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

fn build_plan(
    report: &str,
    app_data_dir: &str,
    probe_base_url: Option<String>,
    devtools_probe: bool,
) -> Result<SelfCheckPlan, String> {
    let report_path = absolute(REPORT_PATH_ENV, report)?;
    let Some(file_name) = report_path.file_name() else {
        return Err(format!(
            "{REPORT_PATH_ENV} must end in a file name, got {report:?}"
        ));
    };
    let report_temp_path =
        report_path.with_file_name(format!("{}.tmp", file_name.to_string_lossy()));
    Ok(SelfCheckPlan {
        report_path,
        report_temp_path,
        app_data_dir: absolute(APP_DATA_DIR_ENV, app_data_dir)?,
        probe_base_url: probe_base_url.map(|raw| check_base_url(&raw)).transpose()?,
        devtools_probe,
    })
}

/// renderer 会把它当成 `${base}/<route>` 的前缀直接拼接，所以这里就把两条前提定死。
///
/// 规范化（补协议、削尾斜杠）比拒绝更"贴心"，但那要求两侧各写一遍同样的规则 ——
/// 而两侧写得不一样时，拼出来的是一个连不上的地址，失败形态与"服务没起来"无法区分。
fn check_base_url(raw: &str) -> Result<String, String> {
    if !raw.starts_with("http://") && !raw.starts_with("https://") {
        return Err(format!(
            "{PROBE_BASE_URL_ENV} must start with http:// or https://, got {raw:?}"
        ));
    }
    if raw.ends_with('/') {
        return Err(format!(
            "{PROBE_BASE_URL_ENV} must not have a trailing slash, got {raw:?}"
        ));
    }
    Ok(raw.to_string())
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
                storage: None,
                webview: None,
                devtools: None,
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
    // 排序后再写：`webview_windows()` 是个 HashMap，迭代顺序每次都可能不同，
    // 而下游要拿它做**等值**断言（恰为 `["main", "rxdb-devtools"]`）。
    let mut window_labels: Vec<String> = app.webview_windows().into_keys().collect();
    window_labels.sort();
    let report = SelfCheckReport {
        schema_version: REPORT_SCHEMA_VERSION,
        status: outcome.status,
        launch_count: outcome.launch_count,
        message: outcome.message,
        storage: outcome.storage,
        webview: outcome.webview,
        devtools: outcome.devtools,
        window_labels,
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
    let body = serde_json::to_vec_pretty(report)
        .map_err(|error| format!("cannot serialize the report: {error}"))?;
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

/// renderer 问「这次要不要跑 webview 探针，打哪个地址」（US-505 AC#6）。
///
/// 返回 `None` 有两种成因 —— 没开自检，或者开了自检但没设 [`PROBE_BASE_URL_ENV`]。
/// **刻意不区分**：renderer 拿它只做一个决定（跑还是不跑），区分开来就等于把一份
/// renderer 用不上的状态搬过去，而它迟早会被当成第二个「现在是不是自检模式」的判据。
///
/// 与 [`rxdb_selfcheck_report`] 一样，renderer 无条件调用它：没开自检时查不到
/// [`SelfCheckState`]，直接给 `None`。
#[tauri::command]
pub fn rxdb_selfcheck_probe_base_url(app: AppHandle) -> Option<String> {
    let state = app.try_state::<SelfCheckState>()?;
    state.plan.probe_base_url.clone()
}

/// renderer 问「这次要不要跑 DevTools 握手探针」（US-905 阶段 1 AC#2）。
///
/// 没开自检时查不到 [`SelfCheckState`]，直接给 `false`——与 [`rxdb_selfcheck_probe_base_url`]
/// 同一形态：renderer 无条件问一次，判定的真相源只有 Rust 侧这一个。
#[tauri::command]
pub fn rxdb_selfcheck_devtools_probe(app: AppHandle) -> bool {
    devtools_probe_armed(&app)
}

/// 这次运行是否开着 DevTools 探针。
///
/// 抽出来是给 `lib.rs` 的窗口回收命令当门禁用：那条命令只在自检探针开着时才允许动窗口，
/// 于是它是**自检设施**而不是一个「谁都能调」的后门。
pub fn devtools_probe_armed(app: &AppHandle) -> bool {
    app.try_state::<SelfCheckState>()
        .is_some_and(|state| state.plan.devtools_probe)
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
        std::env::temp_dir()
            .join(name)
            .to_string_lossy()
            .into_owned()
    }

    fn temp_directory(name: &str) -> PathBuf {
        let path =
            std::env::temp_dir().join(format!("rxdb-selfcheck-{}-{}", name, uuid::Uuid::new_v4()));
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
        let error =
            plan_from_env(reader(&[(REPORT_PATH_ENV, &absolute_path("r.json"))])).unwrap_err();
        assert!(error.contains(REPORT_PATH_ENV), "{error}");
        assert!(error.contains(APP_DATA_DIR_ENV), "{error}");
    }

    #[test]
    fn only_the_app_data_dir_is_an_error() {
        let error =
            plan_from_env(reader(&[(APP_DATA_DIR_ENV, &absolute_path("root"))])).unwrap_err();
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
            probe_base_url: None,
            devtools_probe: false,
        };
        plan.ensure_directories().unwrap();

        let missing = SelfCheckPlan {
            app_data_dir: root.join("not-created"),
            ..plan.clone()
        };
        assert!(missing
            .ensure_directories()
            .unwrap_err()
            .contains(APP_DATA_DIR_ENV));

        let unwritable = SelfCheckPlan {
            report_path: root.join("no-such-dir").join("report.json"),
            ..plan
        };
        assert!(unwritable
            .ensure_directories()
            .unwrap_err()
            .contains(REPORT_PATH_ENV));
        std::fs::remove_dir_all(&root).unwrap();
    }

    /// 三个状态词是跨语言契约的一半，另一半在 `services/selfcheck-reporter.ts` 里。
    /// 改动只会表现为「上报了但 Rust 侧反序列化失败」，编译器帮不上忙，所以钉死它。
    #[test]
    fn status_words_match_the_renderer_contract() {
        let encode = |status: SelfCheckStatus| serde_json::to_value(status).unwrap();
        assert_eq!(encode(SelfCheckStatus::Ok), serde_json::json!("ok"));
        assert_eq!(encode(SelfCheckStatus::Failed), serde_json::json!("failed"));
        assert_eq!(
            encode(SelfCheckStatus::TimedOut),
            serde_json::json!("timedOut")
        );
    }

    /// 退出码互不相同，且都不撞 [`CONFIG_EXIT_CODE`]：读退出码的一方要能分辨四种局面。
    #[test]
    fn exit_codes_are_distinguishable() {
        assert_eq!(SelfCheckStatus::Ok.exit_code(), 0);
        assert_eq!(SelfCheckStatus::Failed.exit_code(), 1);
        assert_eq!(SelfCheckStatus::TimedOut.exit_code(), 2);
        assert_ne!(SelfCheckStatus::TimedOut.exit_code(), CONFIG_EXIT_CODE);
    }

    /// 第三个变量是**可选**的：不设它就是不跑 webview 探针，其余两条规则一个字不变。
    #[test]
    fn the_probe_base_url_rides_along_with_the_self_check_pair() {
        let plan = plan_from_env(reader(&[
            (REPORT_PATH_ENV, &absolute_path("report.json")),
            (APP_DATA_DIR_ENV, &absolute_path("root")),
            (PROBE_BASE_URL_ENV, "http://127.0.0.1:54321"),
        ]))
        .unwrap()
        .unwrap();
        assert_eq!(
            plan.probe_base_url.as_deref(),
            Some("http://127.0.0.1:54321")
        );

        let without = plan_from_env(reader(&[
            (REPORT_PATH_ENV, &absolute_path("report.json")),
            (APP_DATA_DIR_ENV, &absolute_path("root")),
        ]))
        .unwrap()
        .unwrap();
        assert_eq!(without.probe_base_url, None);
    }

    /// 没开自检却设了它，只能是打错了变量名或漏设了另外两个。
    /// 静默忽略的话，e2e 会等着一份永远不会出现的 `webview` 字段，
    /// 而报告本身写着 `status: "ok"` —— 最难查的一种失败。
    #[test]
    fn a_probe_base_url_without_self_check_is_an_error() {
        let error =
            plan_from_env(reader(&[(PROBE_BASE_URL_ENV, "http://127.0.0.1:54321")])).unwrap_err();
        assert!(error.contains(PROBE_BASE_URL_ENV), "{error}");
        assert!(error.contains(REPORT_PATH_ENV), "{error}");
    }

    /// renderer 会把它当成 `${base}/allowed` 的前缀直接拼接。
    /// 不是 http(s) 的值拼出来是一个永远连不上的地址，而失败形态与「服务没起来」一模一样。
    #[test]
    fn a_probe_base_url_that_is_not_http_is_rejected() {
        let error = plan_from_env(reader(&[
            (REPORT_PATH_ENV, &absolute_path("report.json")),
            (APP_DATA_DIR_ENV, &absolute_path("root")),
            (PROBE_BASE_URL_ENV, "127.0.0.1:54321"),
        ]))
        .unwrap_err();
        assert!(error.contains(PROBE_BASE_URL_ENV), "{error}");
    }

    /// 尾斜杠会拼出 `//allowed`，那是另一个路径。宁可在这里就拒绝，也不在两侧各写一遍规范化。
    #[test]
    fn a_probe_base_url_with_a_trailing_slash_is_rejected() {
        let error = plan_from_env(reader(&[
            (REPORT_PATH_ENV, &absolute_path("report.json")),
            (APP_DATA_DIR_ENV, &absolute_path("root")),
            (PROBE_BASE_URL_ENV, "http://127.0.0.1:54321/"),
        ]))
        .unwrap_err();
        assert!(error.contains("trailing"), "{error}");
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
                storage: None,
                webview: None,
                devtools: None,
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

    /// 存储探针的键名是跨语言契约的一半，另一半在 `src/app/storage-probe.ts` 里。
    ///
    /// serde 的 `rename_all` 与 TypeScript 的字面量之间没有编译器把关：`byteLength`
    /// 漂成 `byte_length` 只会表现为「上报了但 Rust 侧反序列化失败」→ 没有报告 →
    /// 只剩一次 60s 看门狗超时，而 US-505 AC#1/AC#3 的全部证据都挂在这三个字段上。
    #[test]
    fn the_storage_probe_payload_deserializes() {
        let reported: SelfCheckOutcome = serde_json::from_value(serde_json::json!({
            "status": "ok",
            "launchCount": 1,
            "storage": { "digest": "abc123", "byteLength": 65536, "existedBefore": false }
        }))
        .unwrap();
        assert_eq!(
            reported.storage,
            Some(StorageProbe {
                digest: "abc123".to_string(),
                byte_length: 65536,
                existed_before: false,
            })
        );
    }

    /// webview 探针的键名同样是跨语言契约的一半，另一半在 `src/app/webview-probe.ts` 里。
    ///
    /// 这几个字段承载的是 AC#6 的**全部**证据 —— 三家 webview 上 `download()` 走哪条分支、
    /// `fetch()` 在自定义协议 origin 下是什么结果。名字漂了只会表现为反序列化失败 →
    /// 没有报告 → 一次 60s 看门狗超时。
    #[test]
    fn the_webview_probe_payload_deserializes() {
        let reported: SelfCheckOutcome = serde_json::from_value(serde_json::json!({
            "status": "ok",
            "launchCount": 1,
            "webview": {
                "engine": "webkit",
                "origin": "tauri://localhost",
                "online": true,
                "saveFilePicker": false,
                "anchorDownload": true,
                "objectUrl": true,
                "sameOriginDigest": "abc123",
                "sameOriginByteLength": 512,
                "crossOriginAllowed": "StorageOfflineError",
                "crossOriginDenied": "StorageOfflineError"
            }
        }))
        .unwrap();
        assert_eq!(
            reported.webview,
            Some(WebviewProbe {
                engine: "webkit".to_string(),
                origin: "tauri://localhost".to_string(),
                online: true,
                save_file_picker: false,
                anchor_download: true,
                object_url: true,
                same_origin_digest: "abc123".to_string(),
                same_origin_byte_length: 512,
                cross_origin_allowed: "StorageOfflineError".to_string(),
                cross_origin_denied: "StorageOfflineError".to_string(),
            })
        );
    }

    /// 报告的线上形状：读它的是 `apps/dev-rxdb-tauri-e2e`，八个键一个都不能少。
    /// 顺带证明「先写临时文件再改名」真的没留下半截文件。
    #[test]
    fn the_report_lands_atomically_with_the_shape_the_suite_reads() {
        let root = temp_directory("report");
        let plan = SelfCheckPlan {
            report_path: root.join("launch-1.json"),
            report_temp_path: root.join("launch-1.json.tmp"),
            app_data_dir: root.join("data"),
            probe_base_url: None,
            devtools_probe: false,
        };
        write_report(
            &plan,
            &SelfCheckReport {
                schema_version: REPORT_SCHEMA_VERSION,
                status: SelfCheckStatus::Ok,
                launch_count: Some(2),
                message: None,
                storage: Some(StorageProbe {
                    digest: "abc123".to_string(),
                    byte_length: 65536,
                    existed_before: true,
                }),
                webview: None,
                devtools: Some(DevToolsProbe {
                    panel_frame_types: vec![
                        "PROTOCOL_HELLO".to_string(),
                        "HANDSHAKE_ACK".to_string(),
                    ],
                    session_ids: vec!["a5f7c4ce-6f6f-4a6e-8f0e-2a0c9a2f5d31".to_string()],
                    handshake_completed: true,
                    relay_rejected: 1,
                    native: Some(DevToolsNativeProbe {
                        session_seen: true,
                        files_list: Some("ok".to_string()),
                        files_entry_count: Some(0),
                        settings_export: Some("export_unsupported".to_string()),
                        settings_clear: Some("provider_unsupported".to_string()),
                        forged_session: Some("session_invalid".to_string()),
                        create_directory: Some("ok".to_string()),
                        delete_entry: Some("ok".to_string()),
                        failure: None,
                    }),
                }),
                window_labels: vec!["main".to_string(), "rxdb-devtools".to_string()],
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
                "storage": { "digest": "abc123", "byteLength": 65536, "existedBefore": true },
                "webview": null,
                "devtools": {
                    "panelFrameTypes": ["PROTOCOL_HELLO", "HANDSHAKE_ACK"],
                    "sessionIds": ["a5f7c4ce-6f6f-4a6e-8f0e-2a0c9a2f5d31"],
                    "handshakeCompleted": true,
                    "relayRejected": 1,
                    "native": {
                        "sessionSeen": true,
                        "filesList": "ok",
                        "filesEntryCount": 0,
                        "settingsExport": "export_unsupported",
                        "settingsClear": "provider_unsupported",
                        "forgedSession": "session_invalid",
                        "createDirectory": "ok",
                        "deleteEntry": "ok",
                        "failure": null
                    }
                },
                "windowLabels": ["main", "rxdb-devtools"],
                "appDataDir": "/tmp/root",
                "identifier": "io.aiao.dev-rxdb-tauri"
            })
        );
        assert!(
            !plan.report_temp_path.exists(),
            "临时文件没有被改名，而是留在了原地"
        );
        std::fs::remove_dir_all(&root).unwrap();
    }

    /// 结构版本必须**随字段一起**往前走：读报告的一方按它决定认不认识这份 JSON。
    /// 忘了加这个数字的话，一份少了 `storage` 键的旧报告会被当成合法的新版读进去，
    /// 于是断言读到 `undefined` 而不是「版本对不上」。
    ///
    /// v3 加的是 `devtools` 与 `windowLabels`（US-905 阶段 1）；v6 加的是 `devtools.native`（阶段 2）。
    #[test]
    fn the_schema_version_covers_the_storage_probe() {
        assert_eq!(REPORT_SCHEMA_VERSION, 7);
    }
}
