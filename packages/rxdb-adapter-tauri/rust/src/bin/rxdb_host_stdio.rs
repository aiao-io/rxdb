//! 一致性测试专用的宿主二进制：在 stdin/stdout 上跑 [`DesktopRouter`]，不启动 `tauri::App`。
//!
//! # 为什么需要它
//!
//! US-210 真正要证明的是「Rust 引擎与 Electron / wasm 后端行为一致」，US-505 要证明的是
//! 「Rust 文件宿主与 OPFS / Electron 后端行为一致」，而这两份证明都只能由 TypeScript 的
//! 共享套件给出（`@aiao/rxdb-adapter-sqlite-core/testing` 与
//! `@aiao/rxdb-plugin-storage/testing`）。让 Vitest 直接驱动一个 Rust 进程，比在 Rust 里
//! 重写这些套件便宜得多，也不会因为重写而悄悄放松断言。
//!
//! 托的是 [`DesktopRouter`] 而不是单个 `Host`：套件驱动不到的宿主等于没被证明过。
//!
//! **它不进产品包**：`tauri build` 只打包 `dev-rxdb-tauri` 主二进制。这里也刻意不引入
//! `tauri` 的任何东西——它跑在测试进程里，没有 `AppHandle` 可用。
//!
//! # 行协议
//!
//! - stdin：每行一个 JSON 请求，形如 `{ "id": 7, "payload": <协议请求> }`
//! - stdout：每行一个 JSON 消息
//!   - 应答：`{ "id": 7, "payload": <协议应答> }`
//!   - 变更事件：`{ "event": <change 消息> }`
//!
//! 请求带 `id` 是因为 stdout 上应答与事件是交错的，调用方需要把应答对回自己的 promise。
//! 事件没有 `id`——它不属于任何一次请求。
//!
//! 数据库根目录由 `argv[1]` 给出（测试临时目录）。缺参数就退出：默认到某个「合理」的位置
//! 只会让测试悄悄写进真实的用户数据目录。
//!
//! # 协议版本改写（US-210 AC#10）
//!
//! 设了 [`PROTOCOL_VERSION_OVERRIDE_ENV`]，本进程就把应答里的 `protocolVersion` 换成给定值，
//! 于是两端版本**真的**对不上，`DesktopSqliteClient.connect` 的拒绝路径第一次被真实覆盖。
//!
//! 改写只发生在这个**测试替身**里：`session.rs` / `protocol.rs` 一行不动。产品代码里出现
//! 「版本可配置」的分支，等于给线协议开了一个降级口子——而版本号存在的意义正是不许降级。
//!
//! # 每条请求一个线程
//!
//! Tauri 把每次 `invoke` 派到自己的线程上，并发的 command 是真并发。这里必须照做：
//! 串行处理会在两个会话争写锁时死锁——A 持锁，B 的 `BEGIN IMMEDIATE` 占住唯一的处理线程
//! 一直等到 `busy_timeout`，而能解开它的 A 的 `COMMIT` 正排在 B 后面。
//! 那种死锁是本文件的产物，不是被测引擎的性质，会把套件的结论污染掉。

use std::io::{BufRead, Write};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;

use aiao_rxdb_tauri::router::DesktopRouter;
use aiao_rxdb_tauri::session::HostOptions;
use serde_json::{json, Value};

/// stdout 的独占写入口。
///
/// 变更事件来自引擎的 flusher 线程，应答来自主线程：两者必须串行化，否则两行 JSON
/// 会在管道里交织成一行无法解析的垃圾。
type Out = Arc<Mutex<std::io::Stdout>>;

/// 设置后把应答里的协议版本换成该值，制造真实的版本不匹配。见模块头。
const PROTOCOL_VERSION_OVERRIDE_ENV: &str = "RXDB_HOST_STDIO_PROTOCOL_VERSION";

/// 读取协议版本改写开关。
///
/// 变量存在但不是整数就退出，不当作「没设」：那样的话一个手滑的取值会让用例默默地
/// 去验一条版本**匹配**的路径，然后绿着通过。
fn protocol_version_override() -> Option<i64> {
    match std::env::var(PROTOCOL_VERSION_OVERRIDE_ENV) {
        Err(std::env::VarError::NotPresent) => None,
        Err(error) => {
            eprintln!("{PROTOCOL_VERSION_OVERRIDE_ENV} is unreadable: {error}");
            std::process::exit(2);
        }
        Ok(raw) => match raw.parse::<i64>() {
            Ok(version) => Some(version),
            Err(error) => {
                eprintln!("{PROTOCOL_VERSION_OVERRIDE_ENV} must be an integer, got {raw:?}: {error}");
                std::process::exit(2);
            }
        },
    }
}

fn write_line(out: &Out, message: &Value) {
    let mut handle = out.lock().expect("stdout mutex poisoned");
    // 写失败意味着测试进程已经走了，此时安静退出比 panic 出一屏噪音有用。
    if writeln!(handle, "{message}").is_err() {
        return;
    }
    let _ = handle.flush();
}

fn main() {
    let mut arguments = std::env::args().skip(1);
    let Some(root) = arguments.next() else {
        eprintln!("usage: rxdb_host_stdio <database-root-directory>");
        std::process::exit(2);
    };

    let version_override = protocol_version_override();
    let out: Out = Arc::new(Mutex::new(std::io::stdout()));
    let events = Arc::clone(&out);
    let host = Arc::new(DesktopRouter::new(HostOptions {
        app_data_dir: std::path::PathBuf::from(root),
        deliver: Arc::new(move |message| write_line(&events, &json!({ "event": message }))),
    }));

    let mut workers: Vec<JoinHandle<()>> = Vec::new();
    for line in std::io::stdin().lock().lines() {
        let Ok(line) = line else { break };
        if line.trim().is_empty() {
            continue;
        }
        // 已经跑完的句柄清掉，否则一轮套件下来会攒出几万个 JoinHandle。
        workers.retain(|worker| !worker.is_finished());
        let (host, out) = (Arc::clone(&host), Arc::clone(&out));
        workers.push(std::thread::spawn(move || {
            write_line(&out, &handle_line(&host, &line, version_override));
        }));
    }
    for worker in workers {
        // 忽略 panic：`DesktopRouter::handle` 契约上不 panic，真 panic 了标准库已经把它打到 stderr，
        // 而测试侧断言的正是 stderr 为空。
        let _ = worker.join();
    }
    host.close_all();
}

/// 处理一行输入。
///
/// 解析失败也要**回一条应答**：调用方那边挂着一个 promise，静默丢弃只会让测试挂到超时，
/// 而超时的报错信息完全指不出问题在哪。
fn handle_line(host: &DesktopRouter, line: &str, version_override: Option<i64>) -> Value {
    let Ok(request) = serde_json::from_str::<Value>(line) else {
        return json!({
            "id": Value::Null,
            "payload": { "kind": "error", "code": "protocol_violation", "message": "stdin line is not valid JSON" }
        });
    };
    let mut payload = host.handle(request.get("payload").unwrap_or(&Value::Null));
    if let Some(version) = version_override {
        // 按 JSON 指针改而不是按 `kind` 分支：`open` 与 `file.open` 两族应答都带这个字段，
        // 照 `kind` 枚举的话，将来多一族握手就会悄悄漏掉。字段不存在时什么也不做。
        if let Some(slot) = payload.pointer_mut("/result/protocolVersion") {
            *slot = json!(version);
        }
    }
    json!({ "id": request.get("id").cloned().unwrap_or(Value::Null), "payload": payload })
}
